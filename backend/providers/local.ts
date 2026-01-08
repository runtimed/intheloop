import * as jose from "jose";
import type {
  ApiKeyProvider,
  ApiKeyValidationResult,
  UserInfo,
} from "./types.ts";

/**
 * Local API key provider for development environments
 * Uses japikey for actual key management and validation
 */
export class LocalApiKeyProvider implements ApiKeyProvider {
  constructor() {}

  /**
   * Check if a token appears to be an API key (vs OIDC token)
   */
  isApiKey(token: string): boolean {
    try {
      const unverified = jose.decodeJwt(token);
      // japikey tokens have specific structure - check for key ID in subject and audience
      return Boolean(
        unverified.sub &&
          unverified.iss &&
          unverified.aud === "api-keys" &&
          typeof unverified.sub === "string" &&
          unverified.sub.match(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
          ) // UUID format
      );
    } catch {
      return false;
    }
  }

  /**
   * Validate an API key and return user information
   */
  async validateApiKey(token: string): Promise<ApiKeyValidationResult> {
    try {
      const unverified = jose.decodeJwt(token);

      if (!unverified.sub || !unverified.iss || unverified.aud !== "api-keys") {
        return { valid: false, error: "Invalid API key format" };
      }

      // Extract key ID from subject
      const keyId = unverified.sub as string;

      // Get JWKS URL from issuer
      const jwksUrl = `${unverified.iss}/${keyId}/.well-known/jwks.json`;

      try {
        // Fetch JWKS and verify signature
        const JWKS = jose.createRemoteJWKSet(new URL(jwksUrl));
        const { payload } = await jose.jwtVerify(token, JWKS, {
          issuer: unverified.iss as string,
          audience: "api-keys",
        });

        // Extract scopes from payload
        const scopes = Array.isArray(payload.scopes) ? payload.scopes : [];

        return {
          valid: true,
          userId: `local-${keyId}`, // Synthetic user ID for local development
          scopes: scopes.map(String),
          keyId,
        };
      } catch (verificationError) {
        if (verificationError instanceof jose.errors.JWTExpired) {
          return { valid: false, error: "API key expired" };
        }
        return { valid: false, error: "API key verification failed" };
      }
    } catch {
      return { valid: false, error: "Failed to parse API key" };
    }
  }

  /**
   * Get user information for debug purposes
   */
  async getUserInfo(
    result: ApiKeyValidationResult & { valid: true }
  ): Promise<UserInfo> {
    return {
      id: result.userId,
      email: `${result.userId}@local.dev`,
      givenName: "Local",
      familyName: "User",
      scopes: result.scopes,
    };
  }
}
