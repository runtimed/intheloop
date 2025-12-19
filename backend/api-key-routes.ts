import { Hono } from "hono";
import { type Env } from "./types.ts";
import { authMiddleware, type AuthContext } from "./middleware.ts";
import {
  createApiKeyProvider,
  isUsingLocalProvider,
} from "./providers/api-key-factory.ts";
import {
  validateCreateApiKeyRequest,
  createProviderContext,
  createAuthenticatedProviderContext,
  type CreateApiKeyRequest,
  type ApiKey,
  type ListApiKeysRequest,
} from "./api-key-provider.ts";
import { RuntError, ErrorType } from "./types.ts";
import { D1Driver } from "@japikey/cloudflare";
import { JSONWebKeySet } from "jose";
import { getBearerToken } from "./utils/request-utils.ts";

const apiKeyRoutes = new Hono<{ Bindings: Env; Variables: AuthContext }>();

/**
 * Middleware to ensure OAuth authentication (not API key) for sensitive operations
 */
const oauthOnlyMiddleware = async (c: any, next: any) => {
  // First apply regular auth middleware
  await authMiddleware(c, () => Promise.resolve());

  const passport = c.get("passport");
  if (!passport) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Authentication required",
      },
      401
    );
  }

  // Check if this was authenticated via API key
  const authToken = getBearerToken(c.req);
  if (authToken) {
    const provider = createApiKeyProvider(c.env);
    const providerContext = createProviderContext(c.env, authToken);

    if (provider.isApiKey(providerContext)) {
      return c.json(
        {
          error: "Authentication method not allowed",
          message: "This operation requires OAuth authentication, not API key",
        },
        403
      );
    }
  }

  await next();
};

apiKeyRoutes.get("/:kid/.well-known/jwks.json", async (c) => {
  if (!isUsingLocalProvider(c.env)) {
    throw new RuntError(ErrorType.NotFound, {
      message: "The JWKS endpoint is not available for this provider",
    });
  }

  const db = new D1Driver(c.env.DB);
  await db.ensureTable();
  const kid = c.req.param("kid");
  const row = await db.getApiKey(kid);
  if (!row || row.revoked) {
    throw new RuntError(ErrorType.NotFound, {
      message: "API key not found",
      debugPayload: { kid, row },
    });
  }
  const jwks: JSONWebKeySet = {
    keys: [row.jwk],
  };
  return c.json(jwks);
});

/**
 * POST /api/api-keys - Create new API key (OAuth only)
 */
apiKeyRoutes.post("/", oauthOnlyMiddleware, async (c) => {
  const passport = c.get("passport");
  const authToken = getBearerToken(c.req);

  if (!passport || !authToken) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Authentication required",
      },
      401
    );
  }

  try {
    // Parse and validate request body
    const body = await c.req.json();
    const request: CreateApiKeyRequest = validateCreateApiKeyRequest(body);

    // Create provider and context
    const provider = createApiKeyProvider(c.env);
    const context = createAuthenticatedProviderContext(
      c.env,
      passport,
      authToken
    );

    // Create the API key
    const apiKey = await provider.createApiKey(context, request);

    return c.json({ api_key: apiKey });
  } catch (error) {
    if (error instanceof RuntError) {
      return c.json(
        error.getPayload(c.env.DEBUG || false),
        error.statusCode as any
      );
    }

    return c.json(
      {
        error: "Internal Server Error",
        message: "Failed to create API key",
      },
      500
    );
  }
});

/**
 * GET /api-keys/:id - Get specific API key (OAuth or API key auth)
 */
apiKeyRoutes.get("/:id", authMiddleware, async (c) => {
  const keyId = c.req.param("id");
  const passport = c.get("passport");
  const authToken = getBearerToken(c.req);

  if (!passport || !authToken) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Authentication required",
      },
      401
    );
  }

  try {
    const provider = createApiKeyProvider(c.env);
    const context = createAuthenticatedProviderContext(
      c.env,
      passport,
      authToken
    );

    // Get the API key
    const apiKey: ApiKey = await provider.getApiKey(context, keyId);

    // Verify ownership (additional security check)
    if (apiKey.userId !== passport.user.id) {
      throw new RuntError(ErrorType.AccessDenied, {
        message: "API key does not belong to authenticated user",
        debugPayload: { keyId, userId: passport.user.id },
      });
    }

    return c.json(apiKey);
  } catch (error) {
    if (error instanceof RuntError) {
      return c.json(
        error.getPayload(c.env.DEBUG || false),
        error.statusCode as any
      );
    }

    return c.json(
      {
        error: "Internal Server Error",
        message: "Failed to retrieve API key",
      },
      500
    );
  }
});

/**
 * GET /api-keys - List all API keys for user (OAuth or API key auth)
 */
apiKeyRoutes.get("/", authMiddleware, async (c) => {
  const passport = c.get("passport");
  const authToken = getBearerToken(c.req);

  if (!passport || !authToken) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Authentication required",
      },
      401
    );
  }

  try {
    // Parse optional query parameters
    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");

    const request: ListApiKeysRequest = {
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
      offset: offsetParam ? parseInt(offsetParam, 10) : undefined,
    };

    // Validate pagination parameters
    if (
      request.limit !== undefined &&
      (isNaN(request.limit) || request.limit < 1 || request.limit > 100)
    ) {
      throw new RuntError(ErrorType.InvalidRequest, {
        message: "limit must be a number between 1 and 100",
        debugPayload: { receivedLimit: limitParam },
      });
    }

    if (
      request.offset !== undefined &&
      (isNaN(request.offset) || request.offset < 0)
    ) {
      throw new RuntError(ErrorType.InvalidRequest, {
        message: "offset must be a non-negative number",
        debugPayload: { receivedOffset: offsetParam },
      });
    }

    const provider = createApiKeyProvider(c.env);
    const context = createAuthenticatedProviderContext(
      c.env,
      passport,
      authToken
    );

    // List API keys
    const apiKeys: ApiKey[] = await provider.listApiKeys(context, request);

    return c.json(apiKeys);
  } catch (error) {
    if (error instanceof RuntError) {
      return c.json(
        error.getPayload(c.env.DEBUG || false),
        error.statusCode as any
      );
    }

    return c.json(
      {
        error: "Internal Server Error",
        message: "Failed to list API keys",
      },
      500
    );
  }
});

/**
 * DELETE /api-keys/:id - Delete API key (OAuth or API key auth)
 */
apiKeyRoutes.delete("/:id", authMiddleware, async (c) => {
  const keyId = c.req.param("id");
  const passport = c.get("passport");
  const authToken = getBearerToken(c.req);

  if (!passport || !authToken) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Authentication required",
      },
      401
    );
  }

  try {
    const provider = createApiKeyProvider(c.env);
    const context = createAuthenticatedProviderContext(
      c.env,
      passport,
      authToken
    );

    // Verify ownership before deletion
    try {
      const existingKey = await provider.getApiKey(context, keyId);
      if (existingKey.userId !== passport.user.id) {
        throw new RuntError(ErrorType.AccessDenied, {
          message: "API key does not belong to authenticated user",
          debugPayload: { keyId, userId: passport.user.id },
        });
      }
    } catch (error) {
      // If getApiKey fails, let the deleteApiKey method handle it
      if (error instanceof RuntError && error.type === ErrorType.AccessDenied) {
        throw error;
      }
    }

    // Delete the API key
    await provider.deleteApiKey(context, keyId);

    return new Response("", { status: 204 });
  } catch (error) {
    if (error instanceof RuntError) {
      return c.json(
        error.getPayload(c.env.DEBUG || false),
        error.statusCode as any
      );
    }

    return c.json(
      {
        error: "Internal Server Error",
        message: "Failed to delete API key",
      },
      500
    );
  }
});

/**
 * PATCH /api-keys/:id - Revoke API key (if supported by provider)
 */
apiKeyRoutes.patch("/:id", authMiddleware, async (c) => {
  const keyId = c.req.param("id");
  const passport = c.get("passport");
  const authToken = getBearerToken(c.req);

  if (!passport || !authToken) {
    return c.json(
      {
        error: "Unauthorized",
        message: "Authentication required",
      },
      401
    );
  }

  try {
    // Parse request body
    const body = await c.req.json();

    if (!body || typeof body !== "object" || body.revoked !== true) {
      throw new RuntError(ErrorType.InvalidRequest, {
        message: "Request body must contain { revoked: true }",
        debugPayload: { receivedBody: body },
      });
    }

    const provider = createApiKeyProvider(c.env);
    const context = createAuthenticatedProviderContext(
      c.env,
      passport,
      authToken
    );

    // Verify ownership before revocation
    const existingKey = await provider.getApiKey(context, keyId);
    if (existingKey.userId !== passport.user.id) {
      throw new RuntError(ErrorType.AccessDenied, {
        message: "API key does not belong to authenticated user",
        debugPayload: { keyId, userId: passport.user.id },
      });
    }

    // Attempt to revoke the API key
    await provider.revokeApiKey(context, keyId);

    // Return the updated key
    const updatedKey = await provider.getApiKey(context, keyId);

    return c.json(updatedKey);
  } catch (error) {
    if (error instanceof RuntError) {
      return c.json(
        error.getPayload(c.env.DEBUG || false),
        error.statusCode as any
      );
    }

    return c.json(
      {
        error: "Internal Server Error",
        message: "Failed to revoke API key",
      },
      500
    );
  }
});

/**
 * OPTIONS - Handle CORS preflight requests
 */
apiKeyRoutes.options("*", (_c) => {
  return new Response("", { status: 204 });
});

/**
 * Catch-all for unsupported methods
 */
apiKeyRoutes.all("*", (c) => {
  return c.json(
    {
      error: "Method Not Allowed",
      message: `${c.req.method} is not supported for this endpoint`,
    },
    405
  );
});

export default apiKeyRoutes;
