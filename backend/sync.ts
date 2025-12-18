import { handleWebSocket, makePostgres } from "@livestore/sync-cf/cf-worker";
import { type Env, type ExecutionContext } from "./types";

import { getValidatedUser } from "./auth";
import { Schema } from "@runtimed/schema";

export class WebSocketServer extends makePostgres({
  // These are needed, even if they are empty
  onPush: async (message) => {
    console.log("onPush", message.batch);
  },
  onPull: async (message) => {
    console.log("onPull", message);
  },
}) {}

// User sync payload (runtime is false or undefined)
const UserSyncPayloadSchema = Schema.Struct({
  authToken: Schema.String,
  runtime: Schema.optional(Schema.Literal(false)),
});

// Runtime sync payload (runtime is true with additional fields)
const RuntimeSyncPayloadSchema = Schema.Struct({
  authToken: Schema.String,
  runtime: Schema.Literal(true),
  runtimeId: Schema.String,
  sessionId: Schema.String,
  userId: Schema.String,
});

// Union schema for all sync payload types
const SyncPayloadSchema = Schema.Union(
  UserSyncPayloadSchema,
  RuntimeSyncPayloadSchema
);

const decodePayload = Schema.decodeUnknownSync(SyncPayloadSchema);

export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);

    const pathname = url.pathname;

    if (!pathname.startsWith("/livestore")) {
      return new Response("Invalid request", { status: 400 });
    }

    return handleWebSocket(request, env, ctx, {
      validatePayload: async (rawPayload) => {
        try {
          const payload = decodePayload(rawPayload);
          let validatedUser = await getValidatedUser(payload.authToken, env);

          if (!validatedUser) {
            throw new Error("User must be authenticated");
          }

          // User identity is validated via JWT token
          // LiveStore will manage clientId for device/app instance identification
          if (payload?.runtime === true) {
            // For runtime agents with full payload
            console.log("✅ Runtime agent authenticated:", {
              runtimeId: payload.runtimeId,
              sessionId: payload.sessionId,
              userId: payload.userId,
              validatedUserId: validatedUser.id,
            });

            // Verify that the runtime's claimed userId matches the authenticated user
            if (payload.userId !== validatedUser.id) {
              throw new Error(
                `Runtime userId mismatch: payload claims ${payload.userId}, but token is for ${validatedUser.id}`
              );
            }
          } else {
            // For regular users
            console.log("✅ Authenticated user:", {
              userId: validatedUser.id,
            });
          }

          // SECURITY NOTE: This validation only occurs at connection time.
          // The current version of `@livestore/sync-cf` does not provide a mechanism
          // to verify that the `clientId` on incoming events matches the `clientId`
          // that was validated with this initial connection payload. A malicious
          // client could pass this check and then send events with a different clientId.
        } catch (error: any) {
          console.error("🚫 Authentication failed:", error.message);
          throw error; // Reject the WebSocket connection
        }
      },
    });
  },
};
