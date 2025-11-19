import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebSocketServer } from "./sync.ts";
import syncHandler from "./sync.ts";
import {
  workerGlobals,
  type Env,
  type WorkerRequest,
  type WorkerResponse,
  type ExecutionContext,
} from "./types.ts";
import { type AuthContext } from "./middleware.ts";
import { RuntError, ErrorType } from "./types.ts";
import apiRoutes from "./routes.ts";
import localOidcRoutes from "./local-oidc-routes.ts";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./trpc/index.ts";
import { extractAndValidateUser } from "./auth.ts";
import { createPermissionsProvider } from "./notebook-permissions/factory.ts";
import { TrcpContext } from "./trpc/trpc.ts";

// NOTE: This export is necessary at the root entry point for the Workers
// runtime for Durable Object usage
export { WebSocketServer };

const honoApp = new Hono<{ Bindings: Env; Variables: AuthContext }>();

honoApp.onError(async (error, c) => {
  let runtError: RuntError;
  if (error instanceof RuntError) {
    runtError = error;
  } else {
    runtError = new RuntError(ErrorType.Unknown, { cause: error as Error });
  }

  if (runtError.statusCode === 500) {
    console.error(
      "500 error for request",
      c.req.url,
      JSON.stringify(runtError.getPayload(true), null, 2)
    );
  }

  return c.json(
    runtError.getPayload(c.env.DEBUG ?? false),
    runtError.statusCode as any
  );
});

// Global CORS middleware
honoApp.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "x-notebook-id"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

// Request logging middleware
honoApp.use("*", async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const url = new URL(c.req.url);
  const path = url.pathname;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  console.log(`[HONO] ${method} ${path} ${status} ${duration}ms`);
});

// No-cache middleware for API routes
honoApp.use("*", async (c, next) => {
  await next();

  // Add no-cache headers to prevent edge caching
  c.res.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  c.res.headers.set("Pragma", "no-cache");
  c.res.headers.set("Expires", "0");
});

// Environment-based security check middleware for local OIDC
honoApp.use("/local_oidc/*", async (c, next) => {
  const allowLocalAuth = c.env.ALLOW_LOCAL_AUTH === "true";

  if (!allowLocalAuth) {
    return c.json({ error: "Local OIDC is disabled" }, 403);
  }

  if (c.env.DEPLOYMENT_ENV === "production") {
    return c.json(
      {
        error: "SECURITY_ERROR",
        message:
          "Local authentication cannot be enabled in production environments",
      },
      500
    );
  }

  await next();
});

// Mount existing routes
honoApp.route("/api", apiRoutes);
honoApp.route("/local_oidc", localOidcRoutes);

// ============================================================================
// Main Selective Router
// ============================================================================

export default {
  async fetch(
    request: WorkerRequest,
    env: Env,
    ctx: ExecutionContext
  ): Promise<WorkerResponse> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    console.log("🔍 Selective router:", {
      method: request.method,
      pathname,
      timestamp: new Date().toISOString(),
    });

    // Security check for local auth in production
    const allowLocalAuth = env.ALLOW_LOCAL_AUTH === "true";
    if (allowLocalAuth && env.DEPLOYMENT_ENV === "production") {
      return new workerGlobals.Response(
        JSON.stringify({
          error: "SECURITY_ERROR",
          message:
            "Local authentication cannot be enabled in production environments",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    if (!env.AUTH_ISSUER) {
      throw new Error(
        "STARTUP_ERROR: AUTH_ISSUER is required when DEPLOYMENT_ENV is production"
      );
    }

    // CORS preflight handling
    if (request.method === "OPTIONS") {
      return new workerGlobals.Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (pathname.startsWith("/api/trpc")) {
      console.log("🚀 Routing to tRPC");
      try {
        const response = await fetchRequestHandler({
          endpoint: "/api/trpc",
          req: request as unknown as Request,
          router: appRouter,
          createContext: async (): Promise<TrcpContext> => {
            let auth = await extractAndValidateUser(
              request as unknown as Request,
              env
            );

            // Create permissions provider
            const permissionsProvider = createPermissionsProvider(env);

            return {
              env,
              user: auth,
              permissionsProvider,
            };
          },
        });

        // Add no-cache headers to tRPC responses
        response.headers.set(
          "Cache-Control",
          "no-cache, no-store, must-revalidate"
        );
        response.headers.set("Pragma", "no-cache");
        response.headers.set("Expires", "0");

        console.log("✅ tRPC response:", response.status);
        return response as unknown as WorkerResponse;
      } catch (error) {
        console.error("❌ tRPC error:", error);
        return new workerGlobals.Response(
          JSON.stringify({
            error: "tRPC processing failed",
            message: error instanceof Error ? error.message : String(error),
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    if (
      pathname.startsWith("/livestore") &&
      request.headers.get("upgrade") === "websocket"
    ) {
      console.log("🔄 Routing to LiveStore sync handler on", request.url);
      return syncHandler.fetch(
        request as unknown as Request,
        env,
        ctx
      ) as unknown as WorkerResponse;
    }

    // Route 3: API routes → Hono app
    if (
      pathname.startsWith("/api/") ||
      pathname === "/health" ||
      (allowLocalAuth && pathname.startsWith("/local_oidc"))
    ) {
      console.log("🛠️  Routing to Hono API");
      try {
        const response = await honoApp.fetch(request as any, env, ctx);

        // Add no-cache headers to API responses
        response.headers.set(
          "Cache-Control",
          "no-cache, no-store, must-revalidate"
        );
        response.headers.set("Pragma", "no-cache");
        response.headers.set("Expires", "0");

        console.log("✅ Hono API response:", response.status);
        return response as unknown as WorkerResponse;
      } catch (error) {
        console.error("❌ Hono API error:", error);
        throw error;
      }
    }

    if (env.ASSETS) {
      try {
        const hasFileExtension =
          pathname.includes(".") && !pathname.endsWith("/");

        let assetRequest;
        if (hasFileExtension || pathname === "/") {
          // Direct asset request or root path
          assetRequest = request;
        } else {
          // SPA route - serve index.html
          const indexUrl = new URL("/", url.origin);
          assetRequest = new workerGlobals.Request(indexUrl.toString(), {
            method: request.method,
            headers: request.headers,
          });
        }

        const assetResponse = await env.ASSETS.fetch(assetRequest as any);

        if (assetResponse.status < 400) {
          return assetResponse;
        }
      } catch (error) {
        console.warn("❌ ASSETS fetch failed:", error);
      }
    }

    // Fallback: Development page when ASSETS not available
    console.log("📄 Fallback - serving development page");

    if (!env.ASSETS) {
      return new workerGlobals.Response(
        `
<!DOCTYPE html>
<html>
<head>
  <title>In the Loop Local Development</title>
  <style>
    body { font-family: system-ui; margin: 40px; line-height: 1.6; }
    .code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
  </style>
</head>
<body>
  <h1>In the Loop Backend Worker</h1>
  <p>The backend API is running at <span class="code">${url.origin}</span></p>
  <p>For the web client, run <span class="code">pnpm dev</span> in a separate terminal.</p>
  <h2>Available Endpoints:</h2>
  <ul>
    <li><a href="/health">GET /health</a> - Health check</li>
    <li><span class="code">WS /livestore</span> - LiveStore sync</li>
  </ul>
  ${!allowLocalAuth ? '<p><em>Local OIDC endpoints are disabled. Set ALLOW_LOCAL_AUTH="true" to enable them.</em></p>' : ""}
</body>
</html>
        `.trim(),
        {
          status: 200,
          headers: {
            "Content-Type": "text/html",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // If ASSETS exists but we got here, return 404
    return new workerGlobals.Response(
      JSON.stringify({
        error: "Not Found",
        message: `Path ${pathname} not found`,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  },
};
