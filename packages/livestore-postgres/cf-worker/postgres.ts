import { UnexpectedError } from "@livestore/common";
import {
  EventSequenceNumber,
  type LiveStoreEvent,
} from "@livestore/common/schema";
import { shouldNeverHappen } from "@livestore/utils";
import {
  Effect,
  Logger,
  LogLevel,
  Option,
  Schema,
} from "@livestore/utils/effect";
import { DurableObject } from "cloudflare:workers";
import type { QueryResult } from "pg";
import { Client } from "pg";

import { WSMessage } from "../common/mod.js";
import type { SyncMetadata } from "../common/ws-message-types.js";

type DB = Client;

export interface PostgresEnv {
  // DB: D1Database
  PG_CONNECTION_STRING: string;
  ADMIN_SECRET: string;
}

type WebSocketClient = WebSocket;

const encodeOutgoingMessage = Schema.encodeSync(
  Schema.parseJson(WSMessage.BackendToClientMessage)
);
const encodeIncomingMessage = Schema.encodeSync(
  Schema.parseJson(WSMessage.ClientToBackendMessage)
);
const decodeIncomingMessage = Schema.decodeUnknownEither(
  Schema.parseJson(WSMessage.ClientToBackendMessage)
);

/**
 * Safely sends a message on a WebSocket, catching errors if the connection is closed.
 */
const safeSend = (ws: WebSocketClient, message: string): void => {
  try {
    ws.send(message);
  } catch (error: any) {
    // Ignore errors when WebSocket is already closed
    if (
      error?.message?.includes("close") ||
      error?.message?.includes("closed")
    ) {
      // Connection is closed, silently ignore
      return;
    }
    // Re-throw unexpected errors
    throw error;
  }
};

// PostgreSQL column type definitions
type PostgresColumnType = "INTEGER" | "TEXT" | "JSONB" | "BIGINT";

type PostgresColumnDef = {
  name: string;
  type: PostgresColumnType;
  primaryKey?: boolean;
  nullable?: boolean;
};

type PostgresTableDef = {
  name: string;
  columns: ReadonlyArray<PostgresColumnDef>;
};

// PostgreSQL table definition for eventlog
export const postgresEventlogTable: PostgresTableDef = {
  // NOTE actual table name is determined at runtime
  name: "eventlog_${POSTGRES_PERSISTENCE_FORMAT_VERSION}_${storeId}",
  columns: [
    { name: "seqNum", type: "BIGINT", primaryKey: true },
    { name: "parentSeqNum", type: "BIGINT" },
    { name: "name", type: "TEXT" },
    { name: "args", type: "JSONB", nullable: true },
    { name: "createdAt", type: "TEXT" },
    { name: "clientId", type: "TEXT" },
    { name: "sessionId", type: "TEXT" },
  ],
};

const WebSocketAttachmentSchema = Schema.parseJson(
  Schema.Struct({
    storeId: Schema.String,
  })
);

export const POSTGRES_CHUNK_SIZE = 100;

/**
 * Needs to be bumped when the storage format changes (e.g. postgresEventlogTable schema changes)
 *
 * Changing this version number will lead to a "soft reset".
 */
export const POSTGRES_PERSISTENCE_FORMAT_VERSION = 7;

export type PostgresMakeDurableObjectClassOptions = {
  onPush?: (message: WSMessage.PushReq) => Effect.Effect<void> | Promise<void>;
  onPushRes?: (
    message: WSMessage.PushAck | WSMessage.Error
  ) => Effect.Effect<void> | Promise<void>;
  onPull?: (message: WSMessage.PullReq) => Effect.Effect<void> | Promise<void>;
  onPullRes?: (
    message: WSMessage.PullRes | WSMessage.Error
  ) => Effect.Effect<void> | Promise<void>;
};

export type PostgresMakeDurableObjectClass = (
  options?: PostgresMakeDurableObjectClassOptions
) => {
  new (ctx: DurableObjectState, env: PostgresEnv): DurableObject<PostgresEnv>;
};

export const makePostgres: PostgresMakeDurableObjectClass = (options) => {
  return class WebSocketServerBase extends DurableObject<PostgresEnv> {
    /** Needed to prevent concurrent pushes */
    private pushSemaphore = Effect.makeSemaphore(1).pipe(Effect.runSync);

    private currentHead:
      | EventSequenceNumber.GlobalEventSequenceNumber
      | "uninitialized" = "uninitialized";

    fetch = async (request: Request) =>
      Effect.sync(async () => {
        const storeId = getStoreId(request);

        console.log("🐘 connection string", this.env.PG_CONNECTION_STRING);

        const pgClient = new Client({
          connectionString: this.env.PG_CONNECTION_STRING,
        });
        // Connect to the PostgreSQL database
        await pgClient.connect();
        console.log("🐘 PostgreSQL client connected");

        const storage = makeStorage(this.ctx, this.env, storeId, pgClient);
        console.log("🐘🔌 storage created");

        const { 0: client, 1: server } = new WebSocketPair();

        // Since we're using websocket hibernation, we need to remember the storeId for subsequent `webSocketMessage` calls
        server.serializeAttachment(
          Schema.encodeSync(WebSocketAttachmentSchema)({ storeId })
        );

        // See https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server

        this.ctx.acceptWebSocket(server);

        this.ctx.setWebSocketAutoResponse(
          new WebSocketRequestResponsePair(
            encodeIncomingMessage(WSMessage.Ping.make({ requestId: "ping" })),
            encodeOutgoingMessage(WSMessage.Pong.make({ requestId: "ping" }))
          )
        );

        console.log("🐘 setWebSocketAutoResponse");

        const colSpec = postgresTableToColumnSpec(postgresEventlogTable);
        console.log("🐘🔌 colSpec", colSpec);
        await createPostgresTable(pgClient, storage.dbName, colSpec);

        console.log("🐘🔌 table created");

        return new Response(null, {
          status: 101,
          webSocket: client,
        });
      }).pipe(Effect.tapCauseLogPretty, Effect.runPromise);

    webSocketMessage = (ws: WebSocketClient, message: ArrayBuffer | string) => {
      console.log("webSocketMessage", message);
      const decodedMessageRes = decodeIncomingMessage(message);

      if (decodedMessageRes._tag === "Left") {
        console.error("Invalid message received", decodedMessageRes.left);
        return;
      }

      const decodedMessage = decodedMessageRes.right;
      const requestId = decodedMessage.requestId;

      return Effect.gen(this, function* () {
        console.log("🐘🔌 PostgreSQL client connecting 2");
        const pgClient = new Client({
          connectionString: this.env.PG_CONNECTION_STRING,
        });
        // Connect to the PostgreSQL database
        yield* Effect.promise(() => pgClient.connect());
        console.log("🐘🔌 PostgreSQL client connected 2");

        const { storeId } = yield* Schema.decode(WebSocketAttachmentSchema)(
          ws.deserializeAttachment()
        );
        const storage = makeStorage(this.ctx, this.env, storeId, pgClient);

        try {
          switch (decodedMessage._tag) {
            // TODO allow pulling concurrently to not block incoming push requests
            case "WSMessage.PullReq": {
              if (options?.onPull) {
                console.log("🐘🔌 onPull", decodedMessage);
                yield* Effect.tryAll(() => options.onPull!(decodedMessage));
              }

              console.log("🐘🔌 before respond");
              const respond = (message: WSMessage.PullRes) =>
                Effect.gen(function* () {
                  if (options?.onPullRes) {
                    yield* Effect.tryAll(() => options.onPullRes!(message));
                  }
                  safeSend(ws, encodeOutgoingMessage(message));
                });

              console.log("🐘🔌 after respond");

              const cursor = decodedMessage.cursor;

              console.log("🐘🔌 before getEvents, cursor", cursor);

              // TODO use streaming
              const remainingEvents = yield* storage.getEvents(cursor);

              console.log("🐘🔌 after getEvents");

              // Send at least one response, even if there are no events
              const batches =
                remainingEvents.length === 0
                  ? [[]]
                  : Array.from(
                      {
                        length: Math.ceil(
                          remainingEvents.length / POSTGRES_CHUNK_SIZE
                        ),
                      },
                      (_, i) =>
                        remainingEvents.slice(
                          i * POSTGRES_CHUNK_SIZE,
                          (i + 1) * POSTGRES_CHUNK_SIZE
                        )
                    );

              console.log("🐘🔌 after batches");

              for (const [index, batch] of batches.entries()) {
                const remaining = Math.max(
                  0,
                  remainingEvents.length - (index + 1) * POSTGRES_CHUNK_SIZE
                );
                yield* respond(
                  WSMessage.PullRes.make({
                    batch,
                    remaining,
                    requestId: { context: "pull", requestId },
                  })
                );
              }

              console.log("🐘🔌 after for loop");

              break;
            }
            case "WSMessage.PushReq": {
              const respond = (message: WSMessage.PushAck | WSMessage.Error) =>
                Effect.gen(function* () {
                  if (options?.onPushRes) {
                    yield* Effect.tryAll(() => options.onPushRes!(message));
                  }
                  safeSend(ws, encodeOutgoingMessage(message));
                });

              if (decodedMessage.batch.length === 0) {
                yield* respond(WSMessage.PushAck.make({ requestId }));
                return;
              }

              yield* this.pushSemaphore.take(1);

              if (options?.onPush) {
                yield* Effect.tryAll(() => options.onPush!(decodedMessage));
              }

              // TODO check whether we could use the Durable Object storage for this to speed up the lookup
              // const expectedParentNum = yield* storage.getHead

              let currentHead: EventSequenceNumber.GlobalEventSequenceNumber;
              if (this.currentHead === "uninitialized") {
                const currentHeadFromStorage = yield* Effect.promise(() =>
                  this.ctx.storage.get("currentHead")
                );
                // console.log('currentHeadFromStorage', currentHeadFromStorage)
                if (currentHeadFromStorage === undefined) {
                  // console.log('currentHeadFromStorage is null, getting from D1')
                  // currentHead = yield* storage.getHead
                  // console.log('currentHeadFromStorage is null, using root')
                  currentHead = EventSequenceNumber.ROOT.global;
                } else {
                  currentHead =
                    currentHeadFromStorage as EventSequenceNumber.GlobalEventSequenceNumber;
                }
              } else {
                // console.log('currentHead is already initialized', this.currentHead)
                currentHead = this.currentHead;
              }

              // TODO handle clientId unique conflict
              // Validate the batch
              const firstEvent = decodedMessage.batch[0]!;
              if (firstEvent.parentSeqNum !== currentHead) {
                const err = WSMessage.Error.make({
                  message: `Invalid parent event number. Received e${firstEvent.parentSeqNum} but expected e${currentHead}`,
                  requestId,
                });

                yield* Effect.logError(err);

                yield* respond(err);
                yield* this.pushSemaphore.release(1);
                return;
              }

              yield* respond(WSMessage.PushAck.make({ requestId }));

              const createdAt = new Date().toISOString();

              // NOTE we're not waiting for this to complete yet to allow the broadcast to happen right away
              // while letting the async storage write happen in the background
              const storeFiber = yield* storage
                .appendEvents(decodedMessage.batch, createdAt)
                .pipe(Effect.fork);

              this.currentHead = decodedMessage.batch.at(-1)!.seqNum;
              yield* Effect.promise(() =>
                this.ctx.storage.put("currentHead", this.currentHead)
              );

              yield* this.pushSemaphore.release(1);

              const connectedClients = this.ctx.getWebSockets();

              // console.debug(`Broadcasting push batch to ${this.subscribedWebSockets.size} clients`)
              if (connectedClients.length > 0) {
                // TODO refactor to batch api
                const pullRes = WSMessage.PullRes.make({
                  batch: decodedMessage.batch.map((eventEncoded) => ({
                    eventEncoded,
                    metadata: Option.some({ createdAt }),
                  })),
                  remaining: 0,
                  requestId: { context: "push", requestId },
                });
                const pullResEnc = encodeOutgoingMessage(pullRes);

                // Only calling once for now.
                if (options?.onPullRes) {
                  yield* Effect.tryAll(() => options.onPullRes!(pullRes));
                }

                // NOTE we're also sending the pullRes to the pushing ws client as a confirmation
                for (const conn of connectedClients) {
                  safeSend(conn, pullResEnc);
                }
              }

              // Wait for the storage write to complete before finishing this request
              yield* storeFiber;

              break;
            }
            case "WSMessage.AdminResetRoomReq": {
              if (decodedMessage.adminSecret !== this.env.ADMIN_SECRET) {
                safeSend(
                  ws,
                  encodeOutgoingMessage(
                    WSMessage.Error.make({
                      message: "Invalid admin secret",
                      requestId,
                    })
                  )
                );
                return;
              }

              yield* storage.resetStore;
              safeSend(
                ws,
                encodeOutgoingMessage(
                  WSMessage.AdminResetRoomRes.make({ requestId })
                )
              );

              break;
            }
            case "WSMessage.AdminInfoReq": {
              if (decodedMessage.adminSecret !== this.env.ADMIN_SECRET) {
                safeSend(
                  ws,
                  encodeOutgoingMessage(
                    WSMessage.Error.make({
                      message: "Invalid admin secret",
                      requestId,
                    })
                  )
                );
                return;
              }

              safeSend(
                ws,
                encodeOutgoingMessage(
                  WSMessage.AdminInfoRes.make({
                    requestId,
                    info: { durableObjectId: this.ctx.id.toString() },
                  })
                )
              );

              break;
            }
            default: {
              console.error("unsupported message", decodedMessage);
              return shouldNeverHappen();
            }
          }
        } catch (error: any) {
          safeSend(
            ws,
            encodeOutgoingMessage(
              WSMessage.Error.make({ message: error.message, requestId })
            )
          );
        }
      }).pipe(
        Effect.withSpan(
          `@livestore/sync-cf:postgres:webSocketMessage:${decodedMessage._tag}`,
          {
            attributes: { requestId },
          }
        ),
        Effect.tapCauseLogPretty,
        Effect.tapErrorCause((cause) =>
          Effect.sync(() =>
            safeSend(
              ws,
              encodeOutgoingMessage(
                WSMessage.Error.make({ message: cause.toString(), requestId })
              )
            )
          )
        ),
        Logger.withMinimumLogLevel(LogLevel.Debug),
        Effect.provide(Logger.prettyWithThread("postgres")),
        Effect.runPromise
      );
    };

    webSocketClose = async (
      ws: WebSocketClient,
      code: number,
      _reason: string,
      _wasClean: boolean
    ) => {
      // If the client closes the connection, the runtime will invoke the webSocketClose() handler.
      ws.close(code, "Durable Object is closing WebSocket");
    };
  };
};

type SyncStorage = {
  dbName: string;
  // getHead: Effect.Effect<EventSequenceNumber.GlobalEventSequenceNumber, UnexpectedError>
  getEvents: (cursor: number | undefined) => Effect.Effect<
    ReadonlyArray<{
      eventEncoded: LiveStoreEvent.AnyEncodedGlobal;
      metadata: Option.Option<SyncMetadata>;
    }>,
    UnexpectedError
  >;
  appendEvents: (
    batch: ReadonlyArray<LiveStoreEvent.AnyEncodedGlobal>,
    createdAt: string
  ) => Effect.Effect<void, UnexpectedError>;
  resetStore: Effect.Effect<void, UnexpectedError>;
};

/**
 * Converts a PostgreSQL table definition to a column specification string.
 * @param tableDef - PostgreSQL table definition
 * @returns Column specification string for CREATE TABLE
 */
const postgresTableToColumnSpec = (tableDef: PostgresTableDef): string => {
  const primaryKeys: string[] = [];
  const columnDefs = tableDef.columns.map((col) => {
    let def = `${col.name} ${col.type}`;

    if (col.primaryKey) {
      primaryKeys.push(col.name);
    }

    // Primary keys are always NOT NULL, and columns are NOT NULL unless explicitly nullable: true
    if (col.primaryKey || col.nullable !== true) {
      def += " NOT NULL";
    }

    return def;
  });

  if (primaryKeys.length > 0) {
    columnDefs.push(`PRIMARY KEY (${primaryKeys.join(", ")})`);
  }

  return columnDefs.join(", ");
};

/**
 * Creates a PostgreSQL table with a raw column specification string.
 * @param pgClient - PostgreSQL client instance
 * @param tableName - Name of the table to create
 * @param columnSpec - Raw PostgreSQL column specification string (e.g., "seqNum INTEGER PRIMARY KEY, name TEXT")
 */
const createPostgresTable = async (
  pgClient: Client,
  tableName: string,
  columnSpec: string
): Promise<void> => {
  const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (${columnSpec})`;
  console.log("🐘🔌 sql", sql);
  await pgClient.query(sql);
};

const makeStorage = (
  ctx: DurableObjectState,
  _env: PostgresEnv,
  storeId: string,
  pgClient: Client
): SyncStorage => {
  const dbName = `eventlog_${POSTGRES_PERSISTENCE_FORMAT_VERSION}_${toValidTableName(storeId)}`;

  const execDb = <T>(cb: (db: DB) => Promise<QueryResult<T & { rows: T[] }>>) =>
    Effect.tryPromise({
      try: () => cb(pgClient),
      catch: (error) =>
        new UnexpectedError({ cause: error, payload: { dbName } }),
    }).pipe(
      Effect.map((_) => _.rows),
      Effect.withSpan("@livestore/sync-cf:postgres:execDb")
    );

  // const getHead: Effect.Effect<EventSequenceNumber.GlobalEventSequenceNumber, UnexpectedError> = Effect.gen(
  //   function* () {
  //     const result = yield* execDb<{ seqNum: EventSequenceNumber.GlobalEventSequenceNumber }>((db) =>
  //       db.prepare(`SELECT seqNum FROM ${dbName} ORDER BY seqNum DESC LIMIT 1`).all(),
  //     )

  //     return result[0]?.seqNum ?? EventSequenceNumber.ROOT.global
  //   },
  // ).pipe(UnexpectedError.mapToUnexpectedError)

  const getEvents = (
    cursor: number | undefined
  ): Effect.Effect<
    ReadonlyArray<{
      eventEncoded: LiveStoreEvent.AnyEncodedGlobal;
      metadata: Option.Option<SyncMetadata>;
    }>,
    UnexpectedError
  > =>
    Effect.gen(function* () {
      console.log("🐘🔌 getEvents, cursor", cursor);
      const sql =
        cursor === undefined
          ? `SELECT * FROM ${dbName} ORDER BY seqNum ASC`
          : `SELECT * FROM ${dbName} WHERE seqNum > ${cursor} ORDER BY seqNum ASC`;
      // TODO handle case where `cursor` was not found
      console.log("🐘🔌 getEvents, sql", sql);

      type RawEvent = {
        seqnum: string;
        parentseqnum: string;
        name: string;
        args: string;
        createdat: string;
        clientid: string;
        sessionid: string;
      };

      const rawEvents = yield* execDb<RawEvent>((db) => db.query(sql));
      console.log("🐘🔌 getEvents, rawEvents", rawEvents);

      const events: {
        eventEncoded: LiveStoreEvent.AnyEncodedGlobal;
        metadata: Option.Option<SyncMetadata>;
      }[] = rawEvents.map((event) => ({
        eventEncoded: {
          seqNum: Number(
            event.seqnum
          ) as EventSequenceNumber.GlobalEventSequenceNumber,
          parentSeqNum: Number(
            event.parentseqnum
          ) as EventSequenceNumber.GlobalEventSequenceNumber,
          name: event.name,
          args: event.args,
          clientId: event.clientid,
          sessionId: event.sessionid,
        },
        metadata: Option.some({ createdAt: event.createdat }),
      }));

      console.log("🐘🔌 getEvents, events", events);

      return events;
    }).pipe(UnexpectedError.mapToUnexpectedError);

  const appendEvents: SyncStorage["appendEvents"] = (batch, createdAt) =>
    Effect.gen(function* () {
      // If there are no events, do nothing.
      if (batch.length === 0) return;

      // PostgreSQL limits:
      // Maximum bound parameters per query	100, Maximum arguments per SQL function	32
      // Thus we need to split the batch into chunks of max (100/7=)14 events each.
      const CHUNK_SIZE = 14;
      const COLUMNS_PER_EVENT = 7;

      for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
        const chunk = batch.slice(i, i + CHUNK_SIZE);

        // Create PostgreSQL-style placeholders: ($1, $2, $3, $4, $5, $6, $7), ($8, $9, ...)
        const valuesPlaceholders = chunk
          .map((_, eventIndex) => {
            const startParam = eventIndex * COLUMNS_PER_EVENT + 1;
            const params = Array.from(
              { length: COLUMNS_PER_EVENT },
              (_, j) => `$${startParam + j}`
            );
            return `(${params.join(", ")})`;
          })
          .join(", ");

        const sql = `INSERT INTO ${dbName} (seqNum, parentSeqNum, args, name, createdAt, clientId, sessionId) VALUES ${valuesPlaceholders}`;
        console.log("🐘🔌 sql insert", { sql, valuesPlaceholders });
        // Flatten the event properties into a parameters array.
        const params = chunk.flatMap((event) => [
          event.seqNum,
          event.parentSeqNum,
          event.args === undefined ? null : JSON.stringify(event.args),
          event.name,
          createdAt,
          event.clientId,
          event.sessionId,
        ]);

        yield* execDb((db) => db.query(sql, params));
      }
    }).pipe(UnexpectedError.mapToUnexpectedError);

  const resetStore = Effect.gen(function* () {
    yield* Effect.promise(() => ctx.storage.deleteAll());
  }).pipe(UnexpectedError.mapToUnexpectedError);

  return {
    dbName,
    // getHead,
    getEvents,
    appendEvents,
    resetStore,
  };
};

const getStoreId = (request: Request) => {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const storeId = searchParams.get("storeId");
  if (storeId === null) {
    throw new Error("storeId search param is required");
  }
  return storeId;
};

const toValidTableName = (str: string) => str.replaceAll(/[^a-zA-Z0-9]/g, "_");
