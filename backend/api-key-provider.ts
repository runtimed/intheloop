import type { Response as WorkerResponse } from "@cloudflare/workers-types";
import type { Passport } from "./auth.ts";
import { RuntError, ErrorType, type Env } from "./types.ts";

// Re-export types for convenience
export { RuntError, ErrorType, type Env } from "./types.ts";

// Core types for API keys
export enum Scope {
  RuntRead = "runt:read",
  RuntExecute = "runt:execute",
}

export type Resource = {
  id: string;
  type: string;
};

export type CreateApiKeyRequest = {
  scopes: Scope[];
  resources?: Resource[];
  expiresAt: string;
  name?: string;
  userGenerated: boolean;
};

export type ApiKey = CreateApiKeyRequest & {
  id: string;
  userId: string;
  revoked: boolean;
};

export type ListApiKeysRequest = {
  limit?: number;
  offset?: number;
};

export enum ApiKeyCapabilities {
  Revoke = "revoke",
  Delete = "delete",
  CreateWithResources = "create_with_resources",
  ListKeysPaginated = "list_keys_paginated",
}

// Provider context types
export type ProviderContext = {
  env: Env;
  bearerToken?: string;
};

export type AuthenticatedProviderContext = ProviderContext & {
  passport: Passport;
  bearerToken: string;
};

// Main ApiKeyProvider interface matching Anil's design
export type ApiKeyProvider = {
  capabilities: Set<ApiKeyCapabilities>;

  // Optional handler for custom routes
  overrideHandler?: (
    context: ProviderContext
  ) => Promise<false | WorkerResponse>;

  // Check if a token appears to be an API key (not OIDC token)
  isApiKey(context: ProviderContext): boolean;

  // Validate an API key and return passport
  validateApiKey(context: ProviderContext): Promise<Passport>;

  // CRUD operations
  createApiKey: (
    context: AuthenticatedProviderContext,
    request: CreateApiKeyRequest
  ) => Promise<string>;
  getApiKey: (
    context: AuthenticatedProviderContext,
    id: string
  ) => Promise<ApiKey>;
  listApiKeys: (
    context: AuthenticatedProviderContext,
    request: ListApiKeysRequest
  ) => Promise<ApiKey[]>;
  revokeApiKey: (
    context: AuthenticatedProviderContext,
    id: string
  ) => Promise<void>;
  deleteApiKey: (
    context: AuthenticatedProviderContext,
    id: string
  ) => Promise<void>;
};

// Validation helpers
export function validateCreateApiKeyRequest(body: any): CreateApiKeyRequest {
  if (!body || typeof body !== "object") {
    throw new RuntError(ErrorType.InvalidRequest, {
      message: "Request body must be a valid JSON object",
      debugPayload: { receivedBody: body },
    });
  }

  // Validate scopes
  if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
    throw new RuntError(ErrorType.InvalidRequest, {
      message: "scopes is required and must be a non-empty array",
      debugPayload: { receivedScopes: body.scopes },
    });
  }

  for (const scope of body.scopes) {
    if (!Object.values(Scope).includes(scope)) {
      throw new RuntError(ErrorType.InvalidRequest, {
        message: `Invalid scope: ${scope}. Valid scopes are: ${Object.values(Scope).join(", ")}`,
        debugPayload: {
          receivedScope: scope,
          validScopes: Object.values(Scope),
        },
      });
    }
  }

  // Validate expiresAt
  if (!body.expiresAt || typeof body.expiresAt !== "string") {
    throw new RuntError(ErrorType.InvalidRequest, {
      message: "expiresAt is required and must be a valid ISO 8601 date string",
      debugPayload: { receivedExpiresAt: body.expiresAt },
    });
  }

  try {
    const expiresAt = new Date(body.expiresAt);
    if (isNaN(expiresAt.getTime())) {
      throw new Error("Invalid date");
    }
    if (expiresAt <= new Date()) {
      throw new RuntError(ErrorType.InvalidRequest, {
        message: "expiresAt must be in the future",
        debugPayload: { receivedExpiresAt: body.expiresAt },
      });
    }
  } catch (error) {
    throw new RuntError(ErrorType.InvalidRequest, {
      message: "expiresAt must be a valid ISO 8601 date string in the future",
      debugPayload: { receivedExpiresAt: body.expiresAt },
      cause: error as Error,
    });
  }

  // Validate userGenerated
  if (typeof body.userGenerated !== "boolean") {
    throw new RuntError(ErrorType.InvalidRequest, {
      message: "userGenerated is required and must be a boolean",
      debugPayload: { receivedUserGenerated: body.userGenerated },
    });
  }

  // Validate optional fields
  if (body.name !== undefined && typeof body.name !== "string") {
    throw new RuntError(ErrorType.InvalidRequest, {
      message: "name must be a string if provided",
      debugPayload: { receivedName: body.name },
    });
  }

  if (body.resources !== undefined) {
    if (!Array.isArray(body.resources)) {
      throw new RuntError(ErrorType.InvalidRequest, {
        message: "resources must be an array if provided",
        debugPayload: { receivedResources: body.resources },
      });
    }

    for (const resource of body.resources) {
      if (
        !resource ||
        typeof resource !== "object" ||
        typeof resource.id !== "string" ||
        typeof resource.type !== "string"
      ) {
        throw new RuntError(ErrorType.InvalidRequest, {
          message: "Each resource must have id and type string properties",
          debugPayload: { receivedResource: resource },
        });
      }
    }
  }

  return {
    scopes: body.scopes,
    resources: body.resources || undefined,
    expiresAt: body.expiresAt,
    name: body.name || undefined,
    userGenerated: body.userGenerated,
  };
}

// Helper to create provider context
export function createProviderContext(
  env: Env,
  bearerToken?: string
): ProviderContext {
  return {
    env,
    bearerToken,
  };
}

// Helper to create authenticated provider context
export function createAuthenticatedProviderContext(
  env: Env,
  passport: Passport,
  bearerToken: string
): AuthenticatedProviderContext {
  return {
    env,
    passport,
    bearerToken,
  };
}

// Scope mapping utilities for different providers
export const scopeMapping = {
  // Convert internal scopes to external provider scopes
  toExternal: (scope: Scope, provider: "anaconda" | "local"): string => {
    if (provider === "anaconda") {
      switch (scope) {
        case Scope.RuntRead:
          return "cloud:read";
        case Scope.RuntExecute:
          return "cloud:write";
        default:
          throw new Error(`Unknown scope: ${scope}`);
      }
    }
    // For local provider, use scopes as-is
    return scope;
  },

  // Convert external provider scopes to internal scopes
  fromExternal: (scope: string, provider: "anaconda" | "local"): Scope => {
    if (provider === "anaconda") {
      switch (scope) {
        case "cloud:read":
          return Scope.RuntRead;
        case "cloud:write":
          return Scope.RuntExecute;
        default:
          throw new Error(`Unknown external scope: ${scope}`);
      }
    }
    // For local provider, assume scopes are already in internal format
    if (Object.values(Scope).includes(scope as Scope)) {
      return scope as Scope;
    }
    throw new Error(`Unknown local scope: ${scope}`);
  },
};

// Export re-usable error handling function
export function createFailureHandler(url: string) {
  return (err: unknown) => {
    throw new RuntError(ErrorType.Unknown, {
      message: `Failed to fetch from ${url}`,
      cause: err as Error,
    });
  };
}

// Handle provider API responses with proper error mapping
export async function handleProviderResponse<T>(
  response: Response
): Promise<T> {
  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    throw new RuntError(ErrorType.Unknown, {
      message: `Failed to get the body from ${response.url}`,
      cause: error as Error,
    });
  }

  if (response.status === 400) {
    throw new RuntError(ErrorType.InvalidRequest, {
      message: "Invalid request",
      responsePayload: {
        upstreamCode: response.status,
      },
      debugPayload: {
        upstreamBody: body,
      },
    });
  }
  if (response.status === 401) {
    throw new RuntError(ErrorType.AuthTokenInvalid, {
      responsePayload: {
        upstreamCode: response.status,
      },
      debugPayload: {
        upstreamBody: body,
      },
    });
  }
  if (response.status === 403) {
    throw new RuntError(ErrorType.AccessDenied, {
      responsePayload: {
        upstreamCode: response.status,
      },
      debugPayload: {
        upstreamBody: body,
      },
    });
  }
  if (response.status === 404) {
    throw new RuntError(ErrorType.NotFound, {
      responsePayload: {
        upstreamCode: response.status,
      },
      debugPayload: {
        upstreamBody: body,
      },
    });
  }
  if (!response.ok) {
    throw new RuntError(ErrorType.Unknown, {
      responsePayload: {
        upstreamCode: response.status,
      },
      debugPayload: {
        upstreamBody: body,
      },
    });
  }
  if (response.status === 204) {
    return undefined as T;
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new RuntError(ErrorType.Unknown, {
      message: "Invalid JSON response",
      responsePayload: {
        upstreamCode: response.status,
      },
      debugPayload: {
        upstreamBody: body,
      },
    });
  }
}
