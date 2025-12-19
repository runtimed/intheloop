import * as jose from "jose";
import {
  shouldAuthenticate,
  authenticate,
  createGetJWKS,
} from "@japikey/authenticate";
import {
  CreateApiKeyOptions,
  CreateApiKeyResult,
  MalformedTokenError,
  createApiKey,
  SigningError,
  type ApiKeyRow,
} from "@japikey/japikey";
import { D1Driver } from "@japikey/cloudflare";

import type {
  ApiKeyProvider,
  ProviderContext,
  AuthenticatedProviderContext,
  CreateApiKeyRequest,
  ApiKey,
  ListApiKeysRequest,
  Scope,
  Resource,
} from "../api-key-provider.ts";
import { ApiKeyCapabilities } from "../api-key-provider.ts";
import { RuntError, ErrorType, type Env } from "../types.ts";
import { type Passport, type ValidatedUser } from "../auth.ts";

const getBaseIssuer = (context: ProviderContext): URL => {
  // TODO
  return new URL(`http://localhost:8787/api/api-keys`);
};

const claimToMaybeString = (item: unknown): string | undefined => {
  if (typeof item === "string") {
    return item;
  }
  return undefined;
};

const convertRowToApiKey = (row: ApiKeyRow): ApiKey => {
  const key: ApiKey = {
    id: row.kid,
    userId: row.user_id,
    revoked: row.revoked,
    scopes: row.metadata.scopes as Scope[],
    expiresAt: row.metadata.expiresAt as string,
    userGenerated: row.metadata.userGenerated as boolean,
    name: row.metadata.name as string,
  };
  if (row.metadata.resources) {
    key.resources = row.metadata.resources as Resource[];
  }
  return key;
};

/**
 * Local API key provider for development environments
 * Uses japikey libraries directly for key management and validation
 */
export class LocalApiKeyProvider implements ApiKeyProvider {
  public capabilities = new Set([
    ApiKeyCapabilities.Revoke,
    ApiKeyCapabilities.CreateWithResources,
    ApiKeyCapabilities.ListKeysPaginated,
  ]);

  private db: D1Driver;

  constructor(env: Env) {
    this.db = new D1Driver(env.DB);
  }

  async ensureInitialized(): Promise<void> {
    await this.db.ensureTable();
  }

  /**
   * Check if a token appears to be an API key (vs OIDC token)
   */
  isApiKey(context: ProviderContext): boolean {
    if (!context.bearerToken) {
      return false;
    }
    const baseIssuer = getBaseIssuer(context);
    return shouldAuthenticate(context.bearerToken, baseIssuer);
  }

  /**
   * Validate an API key and return passport
   */
  async validateApiKey(context: ProviderContext): Promise<Passport> {
    if (!context.bearerToken) {
      throw new RuntError(ErrorType.MissingAuthToken);
    }

    const baseIssuer = getBaseIssuer(context);
    const getJWKS = createGetJWKS(baseIssuer);
    let payload: jose.JWTPayload;

    try {
      payload = await authenticate(context.bearerToken, {
        baseIssuer,
        getJWKS,
      });
    } catch (error) {
      if (error instanceof MalformedTokenError) {
        throw new RuntError(ErrorType.AuthTokenInvalid, { cause: error });
      }
      throw new RuntError(ErrorType.AuthTokenInvalid, {
        cause: error as Error,
      });
    }

    if (typeof payload.sub !== "string" || !payload.sub) {
      throw new RuntError(ErrorType.AuthTokenInvalid, {
        message: "The sub claim is required",
      });
    }

    if (typeof payload.email !== "string" || !payload.email) {
      throw new RuntError(ErrorType.AuthTokenInvalid, {
        message: "The email claim is required",
      });
    }

    const user: ValidatedUser = {
      id: payload.sub,
      email: payload.email,
      name: claimToMaybeString(payload.name) || payload.email,
      givenName: claimToMaybeString(payload.given_name),
      familyName: claimToMaybeString(payload.family_name),
      isAnonymous: false,
    };

    return {
      user,
      jwt: payload,
    };
  }

  /**
   * Create a new API key
   */
  async createApiKey(
    context: AuthenticatedProviderContext,
    request: CreateApiKeyRequest
  ): Promise<string> {
    await this.ensureInitialized();

    let result: CreateApiKeyResult;
    try {
      const claims: jose.JWTPayload = {
        scopes: request.scopes,
        resources: request.resources,
        email: context.passport.user.email,
      };
      const options: CreateApiKeyOptions = {
        sub: context.passport.user.id,
        iss: getBaseIssuer(context),
        aud: "api-keys",
        expiresAt: new Date(request.expiresAt),
      };

      result = await createApiKey(claims, options);
    } catch (error) {
      if (error instanceof SigningError) {
        throw new RuntError(ErrorType.InvalidRequest, {
          message: "Failed to create the api key",
          cause: error,
          debugPayload: {
            request,
          },
        });
      }
      throw new RuntError(ErrorType.Unknown, { cause: error as Error });
    }

    try {
      await this.db.insertApiKey({
        kid: result.kid,
        user_id: context.passport.user.id,
        revoked: false,
        jwk: result.jwk,
        metadata: {
          scopes: request.scopes,
          resources: request.resources,
          expiresAt: request.expiresAt,
          name: request.name,
          userGenerated: request.userGenerated,
        },
      });
    } catch (error) {
      throw new RuntError(ErrorType.Unknown, {
        message: "Failed to insert the api key into the database",
        cause: error as Error,
      });
    }

    return result.jwt;
  }

  /**
   * Get a specific API key by ID
   */
  async getApiKey(
    context: AuthenticatedProviderContext,
    id: string
  ): Promise<ApiKey> {
    await this.ensureInitialized();

    let row: ApiKeyRow | null;
    try {
      row = await this.db.getApiKey(id);
    } catch (error) {
      throw new RuntError(ErrorType.Unknown, {
        message: "Failed to get the api key from the database",
        cause: error as Error,
      });
    }

    if (!row || row.user_id !== context.passport.user.id) {
      throw new RuntError(ErrorType.NotFound, {
        message: "Api key not found",
        debugPayload: { keyId: id, userId: context.passport.user.id },
      });
    }

    return convertRowToApiKey(row);
  }

  /**
   * List all API keys for a user
   */
  async listApiKeys(
    context: AuthenticatedProviderContext,
    request: ListApiKeysRequest
  ): Promise<ApiKey[]> {
    await this.ensureInitialized();

    let rows: ApiKeyRow[];
    try {
      rows = await this.db.findApiKeys(
        context.passport.user.id,
        request.limit,
        request.offset
      );
    } catch (error) {
      throw new RuntError(ErrorType.Unknown, {
        message: "Failed to get the api keys from the database",
        cause: error as Error,
      });
    }

    return rows.map(convertRowToApiKey);
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(
    context: AuthenticatedProviderContext,
    id: string
  ): Promise<void> {
    await this.ensureInitialized();

    try {
      await this.db.revokeApiKey({
        user_id: context.passport.user.id,
        kid: id,
      });
    } catch (error) {
      throw new RuntError(ErrorType.Unknown, {
        message: "Failed to revoke the api key",
        cause: error as Error,
      });
    }
  }

  /**
   * Delete an API key (not supported)
   */
  async deleteApiKey(
    _context: AuthenticatedProviderContext,
    _id: string
  ): Promise<void> {
    throw new RuntError(ErrorType.CapabilityNotAvailable, {
      message: "delete capability is not supported",
    });
  }

  /**
   * Optional override handler for custom routes
   */
  async overrideHandler(
    _context: ProviderContext
  ): Promise<false | import("@cloudflare/workers-types").Response> {
    // Let the main handler process the request
    return false;
  }
}
