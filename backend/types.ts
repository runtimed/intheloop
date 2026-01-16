import type {
  Request as WorkerRequest,
  Response as WorkerResponse,
  ExecutionContext,
  ExportedHandler,
  DurableObjectNamespace,
  D1Database,
  Fetcher,
  R2Bucket,
  Headers,
  FormData,
  IncomingRequestCfProperties,
  ExportedHandlerFetchHandler,
} from "@cloudflare/workers-types";

// N.B. it's important that we pull in all the types directly from @cloudflare/workers-types
// because we are NOT adding @cloudflare/workers-types to the types[] field in tsconfig.json
// This means that e.g. the global Request and Response objects are not correct
// If we use the experimental types, then these don't assume the global vars are correctly typed
// TL;DR: This can go away once we switch to a monorepo setup and isolate the cloudflare types to only worker projects

/**
 * The Env interface includes all bindings from the original sync worker,
 * plus the `ASSETS` binding for serving static assets.
 */
export type Env = {
  DEPLOYMENT_ENV: string;

  // Service provider configuration
  SERVICE_PROVIDER?: string; // "local" | "anaconda"
  PERMISSIONS_PROVIDER?: string;

  // Bindings from the original sync worker configuration
  WEBSOCKET_SERVER: DurableObjectNamespace;
  DB: D1Database;

  // Secrets
  AUTH_ISSUER: string;

  // New binding for the preview worker to serve the frontend application
  ASSETS?: Fetcher;

  // Bindings for the artifact service, as per artifact-service-design.md
  ARTIFACT_BUCKET: R2Bucket;
  ARTIFACT_STORAGE: "r2" | "local";
  ARTIFACT_THRESHOLD: string;

  // Hidden bits from LiveStore (?!)
  ADMIN_SECRET: string;

  LOCAL_OIDC_AUTHORIZATION_ENDPOINT?: string;

  // Whether to enable the local_oidc routes
  ALLOW_LOCAL_AUTH?: string;

  // Extension configuration for Anaconda provider
  EXTENSION_CONFIG?: string;

  // Anaconda Projects Service configuration
  ANACONDA_PROJECTS_URL: string;

  // Cloudflare Access headers for service-to-service authentication with Projects service
  // These are set via:
  // - GitHub environment secrets (for CI/CD) → Cloudflare Workers secrets (via wrangler secret put)
  // - Local: Set in .dev.vars file (loaded automatically by wrangler dev)
  CLOUDFLARE_SERVICE_TOKEN_CLIENT_ID?: string;
  CLOUDFLARE_SERVICE_TOKEN_CLIENT_SECRET?: string;

  // External OIDC provider for development
  EXTERNAL_OIDC_URL?: string; // e.g., https://auth.stage.anaconda.com/api/auth

  DEBUG?: boolean;

  customFetch?: typeof fetch; // Only used in unit tests to mock fetch
};

// The global Request and Response object is different between cloudflare and node
// For right now, we are using a single tsconfig environment for the whole repository
// so there's going to be a conflict between the global Request/Response objects between the DOM, Node, and Cloudflare
// To workaround this, we'll use a module-wide constant that is just the global response object, but re-cast to be the cloudflare object
// In the long term, we should fix this properly by using a monorepo setup and having different environments for each deploy target

const workerGlobals = {
  Request: globalThis.Request as any as typeof WorkerRequest,
  Response: globalThis.Response as any as typeof WorkerResponse,
  Headers: globalThis.Headers as any as typeof Headers,
  FormData: globalThis.FormData as any as typeof FormData,
};

export type FetchHandler = ExportedHandlerFetchHandler<Env>;

export type SimpleHandler = {
  fetch: FetchHandler;
};

export type {
  WorkerRequest,
  WorkerResponse,
  ExecutionContext,
  ExportedHandler,
  ExportedHandlerFetchHandler,
  Headers,
  FormData,
  IncomingRequestCfProperties,
};
// Error handling types to replace @runtimed/extensions
export enum ErrorType {
  Unknown = "unknown",
  MissingAuthToken = "missing_token",
  AuthTokenInvalid = "invalid_token",
  AuthTokenWrongSignature = "wrong_signature",
  AuthTokenExpired = "expired_token",
  AccessDenied = "access_denied",
  NotFound = "not_found",
  ServerMisconfigured = "server_misconfigured",
  InvalidRequest = "invalid_request",
  CapabilityNotAvailable = "capability_not_available",
}

type StatusCode = 200 | 201 | 204 | 400 | 401 | 403 | 404 | 500;

type ErrorOptions = {
  message?: string;
  responsePayload?: Record<string, unknown>;
  debugPayload?: Record<string, unknown>;
  cause?: unknown;
};

export type ErrorPayload = {
  type: ErrorType;
  message: string;
  data: Record<string, unknown>;
  debug?: {
    stack?: string;
    underlying?: {
      message: string;
      stack?: string;
    };
  } & Record<string, unknown>;
};

export class RuntError extends Error {
  public originalCause?: unknown;

  constructor(
    public type: ErrorType,
    private options: ErrorOptions = {}
  ) {
    super(options.message ?? `RuntError: ${type}`);
    // Store cause manually for compatibility
    if (options.cause) {
      this.originalCause = options.cause;
    }
  }

  get statusCode(): StatusCode {
    const StatusCodeMapping: Record<ErrorType, StatusCode> = {
      [ErrorType.InvalidRequest]: 400,
      [ErrorType.CapabilityNotAvailable]: 400,
      [ErrorType.MissingAuthToken]: 401,
      [ErrorType.AuthTokenInvalid]: 401,
      [ErrorType.AuthTokenExpired]: 401,
      [ErrorType.AuthTokenWrongSignature]: 401,
      [ErrorType.AccessDenied]: 403,
      [ErrorType.NotFound]: 404,
      [ErrorType.ServerMisconfigured]: 500,
      [ErrorType.Unknown]: 500,
    };
    return StatusCodeMapping[this.type];
  }

  public getPayload(debug: boolean): ErrorPayload {
    const underlying =
      this.originalCause instanceof Error
        ? {
            message: this.originalCause.message,
            stack: this.originalCause.stack,
          }
        : undefined;
    return {
      type: this.type,
      message: this.message,
      data: this.options.responsePayload ?? {},
      debug: debug
        ? {
            stack: this.stack,
            underlying,
            ...this.options.debugPayload,
          }
        : undefined,
    };
  }
}

export { workerGlobals };
