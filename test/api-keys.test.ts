import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import apiKeyRoutes from "../backend/api-key-routes";
import { createApiKeyProvider } from "../backend/providers/api-key-factory";
import { LocalApiKeyProvider } from "../backend/providers/local-api-key";
import { AnacondaApiKeyProvider } from "../backend/providers/anaconda-api-key";
import { RuntError, ErrorType } from "../backend/types";
import {
  validateCreateApiKeyRequest,
  Scope,
  scopeMapping,
  type CreateApiKeyRequest,
} from "../backend/api-key-provider";
import { getProviderCapabilities } from "../backend/providers/api-key-factory";

// Mock JWT validation to avoid network calls
vi.mock("jose", () => ({
  decodeJwt: vi.fn().mockReturnValue({
    iss: "http://localhost:8787/local_oidc",
    sub: "test-user",
  }),
  createRemoteJWKSet: vi.fn().mockReturnValue(async () => ({
    keys: [{ kty: "RSA", use: "sig" }],
  })),
  jwtVerify: vi.fn().mockResolvedValue({
    payload: { sub: "test-user", iss: "http://localhost:8787/local_oidc" },
  }),
  errors: {
    JWTInvalid: Error,
  },
  customFetch: Symbol("customFetch"),
}));

// Mock environment for testing
const mockEnv = {
  SERVICE_PROVIDER: "local",
  DEPLOYMENT_ENV: "development",
  AUTH_ISSUER: "http://localhost:8787/local_oidc",
  ALLOW_LOCAL_AUTH: "true",
  DB: {
    prepare: vi.fn(),
  },
  DEBUG: true,
  customFetch: vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ keys: [] }))),
  // Add any additional required environment variables
  OAUTH_CLIENT_ID: "test-client-id",
  OAUTH_CLIENT_SECRET: "test-client-secret",
} as any;

// Mock passport for authenticated requests
const mockPassport = {
  user: {
    id: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    isAnonymous: false,
  },
  jwt: { sub: "test-user-123" },
};

describe("API Key System", () => {
  describe("Provider Factory", () => {
    it("should create local provider by default", () => {
      const env = { ...mockEnv, SERVICE_PROVIDER: undefined };
      const provider = createApiKeyProvider(env);
      expect(provider).toBeInstanceOf(LocalApiKeyProvider);
    });

    it("should create local provider when explicitly set", () => {
      const env = { ...mockEnv, SERVICE_PROVIDER: "local" };
      const provider = createApiKeyProvider(env);
      expect(provider).toBeInstanceOf(LocalApiKeyProvider);
    });

    it("should create anaconda provider when configured", () => {
      const env = {
        ...mockEnv,
        SERVICE_PROVIDER: "anaconda",
        EXTENSION_CONFIG: JSON.stringify({
          apiKeyUrl: "https://api.anaconda.com/v2/api-keys",
          userinfoUrl: "https://api.anaconda.com/v2/whoami",
        }),
      };
      const provider = createApiKeyProvider(env);
      expect(provider).toBeInstanceOf(AnacondaApiKeyProvider);
    });

    it("should throw error for anaconda provider without config", () => {
      const env = { ...mockEnv, SERVICE_PROVIDER: "anaconda" };
      expect(() => createApiKeyProvider(env)).toThrow(RuntError);
    });
  });

  describe("Request Validation", () => {
    it("should validate valid create request", () => {
      const validRequest = {
        scopes: [Scope.RuntExecute],
        expiresAt: "2027-12-31T23:59:59Z",
        userGenerated: true,
        name: "Test Key",
      };

      const result = validateCreateApiKeyRequest(validRequest);
      expect(result).toEqual(validRequest);
    });

    it("should reject request without scopes", () => {
      const invalidRequest = {
        expiresAt: "2025-12-31T23:59:59Z",
        userGenerated: true,
      };

      expect(() => validateCreateApiKeyRequest(invalidRequest)).toThrow(
        RuntError
      );
    });

    it("should reject request with empty scopes array", () => {
      const invalidRequest = {
        scopes: [],
        expiresAt: "2025-12-31T23:59:59Z",
        userGenerated: true,
      };

      expect(() => validateCreateApiKeyRequest(invalidRequest)).toThrow(
        RuntError
      );
    });

    it("should reject request with invalid scope", () => {
      const invalidRequest = {
        scopes: ["invalid:scope"],
        expiresAt: "2025-12-31T23:59:59Z",
        userGenerated: true,
      };

      expect(() => validateCreateApiKeyRequest(invalidRequest)).toThrow(
        RuntError
      );
    });

    it("should reject request without expiresAt", () => {
      const invalidRequest = {
        scopes: [Scope.RuntRead],
        userGenerated: true,
      };

      expect(() => validateCreateApiKeyRequest(invalidRequest)).toThrow(
        RuntError
      );
    });

    it("should reject request with past expiration date", () => {
      const invalidRequest = {
        scopes: [Scope.RuntRead],
        expiresAt: "2020-01-01T00:00:00Z",
        userGenerated: true,
      };

      expect(() => validateCreateApiKeyRequest(invalidRequest)).toThrow(
        RuntError
      );
    });

    it("should reject request without userGenerated flag", () => {
      const invalidRequest = {
        scopes: [Scope.RuntRead],
        expiresAt: "2025-12-31T23:59:59Z",
      };

      expect(() => validateCreateApiKeyRequest(invalidRequest)).toThrow(
        RuntError
      );
    });

    it("should accept request with optional resources", () => {
      const validRequest = {
        scopes: [Scope.RuntExecute],
        expiresAt: "2027-12-31T23:59:59Z",
        userGenerated: true,
        resources: [{ id: "notebook-123", type: "notebook" }],
      };

      const result = validateCreateApiKeyRequest(validRequest);
      expect(result.resources).toEqual([
        { id: "notebook-123", type: "notebook" },
      ]);
    });

    it("should reject request with invalid resource format", () => {
      const invalidRequest = {
        scopes: [Scope.RuntRead],
        expiresAt: "2025-12-31T23:59:59Z",
        userGenerated: true,
        resources: [{ id: "notebook-123" }], // missing type
      };

      expect(() => validateCreateApiKeyRequest(invalidRequest)).toThrow(
        RuntError
      );
    });
  });

  describe("Local API Key Provider", () => {
    let provider: LocalApiKeyProvider;
    let mockDb: any;

    beforeEach(() => {
      mockDb = {
        db: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({
              run: vi.fn().mockResolvedValue({ success: true, changes: 1 }),
              all: vi.fn().mockResolvedValue({ results: [] }),
            }),
          }),
        },
        ensureTable: vi.fn().mockResolvedValue(undefined),
        getApiKey: vi.fn(),
      };

      const env = { ...mockEnv, DB: mockDb };
      provider = new LocalApiKeyProvider(env);
    });

    it.skip("should detect API keys correctly", () => {
      const apiKeyToken =
        "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0Ojg3ODcvYXBpLWtleXMiLCJhdWQiOiJhcGkta2V5cyJ9.signature";
      const oauthToken =
        "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlzcyI6Imh0dHA6Ly9sb2NhbGhvc3Q6ODc4Ny9sb2NhbF9vaWRjIiwiYXVkIjoibG9jYWwtYW5vZGUtY2xpZW50In0.signature";

      const context1 = { env: mockEnv, bearerToken: apiKeyToken };
      const context2 = { env: mockEnv, bearerToken: oauthToken };

      expect(provider.isApiKey(context1)).toBe(true);
      expect(provider.isApiKey(context2)).toBe(false);
    });

    it("should return false for malformed tokens", () => {
      const context = { env: mockEnv, bearerToken: "not-a-jwt" };
      expect(provider.isApiKey(context)).toBe(false);
    });

    it("should return false when no token provided", () => {
      const context = { env: mockEnv };
      expect(provider.isApiKey(context)).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should create RuntError with proper type and message", () => {
      const error = new RuntError(ErrorType.InvalidRequest, {
        message: "Test error",
        debugPayload: { field: "value" },
      });

      expect(error.type).toBe(ErrorType.InvalidRequest);
      expect(error.message).toBe("Test error");
      expect(error.statusCode).toBe(400);
    });

    it("should include debug payload in debug mode", () => {
      const error = new RuntError(ErrorType.InvalidRequest, {
        message: "Test error",
        debugPayload: { field: "value" },
      });

      const payload = error.getPayload(true);
      expect(payload.debug).toBeDefined();
      expect(payload.debug?.field).toBe("value");
    });

    it("should exclude debug payload in production mode", () => {
      const error = new RuntError(ErrorType.InvalidRequest, {
        message: "Test error",
        debugPayload: { field: "value" },
      });

      const payload = error.getPayload(false);
      expect(payload.debug).toBeUndefined();
    });
  });

  describe("Scope Mapping", () => {
    it("should map internal scopes to anaconda scopes", () => {
      expect(scopeMapping.toExternal(Scope.RuntRead, "anaconda")).toBe(
        "cloud:read"
      );
      expect(scopeMapping.toExternal(Scope.RuntExecute, "anaconda")).toBe(
        "cloud:write"
      );
    });

    it("should map anaconda scopes to internal scopes", () => {
      expect(scopeMapping.fromExternal("cloud:read", "anaconda")).toBe(
        Scope.RuntRead
      );
      expect(scopeMapping.fromExternal("cloud:write", "anaconda")).toBe(
        Scope.RuntExecute
      );
    });

    it("should pass through local scopes unchanged", () => {
      expect(scopeMapping.toExternal(Scope.RuntRead, "local")).toBe(
        Scope.RuntRead
      );
      expect(scopeMapping.toExternal(Scope.RuntExecute, "local")).toBe(
        Scope.RuntExecute
      );
    });

    it("should throw error for unknown scopes", () => {
      expect(() =>
        scopeMapping.toExternal("unknown" as any, "anaconda")
      ).toThrow();
      expect(() =>
        scopeMapping.fromExternal("unknown:scope", "anaconda")
      ).toThrow();
    });
  });

  describe("API Routes Integration", () => {
    let app: Hono;
    let mockRequest: Request;

    beforeEach(() => {
      app = new Hono();
      app.route("/api-keys", apiKeyRoutes);

      // Mock authenticated request
      vi.mocked(mockEnv.DB.prepare).mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true, changes: 1 }),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
        }),
      });
    });

    it("should reject unauthenticated requests", async () => {
      mockRequest = new Request("http://localhost/api-keys", {
        method: "GET",
      });

      const response = await app.request(mockRequest, mockEnv);
      expect(response.status).toBe(401);
    });

    it.skip("should reject API key creation with API key auth", async () => {
      const apiKeyToken =
        "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJpc3MiOiJodHRwOi8vbG9jYWxob3N0Ojg3ODcvYXBpLWtleXMiLCJhdWQiOiJhcGkta2V5cyJ9.signature";

      mockRequest = new Request("http://localhost/api-keys", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKeyToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scopes: [Scope.RuntExecute],
          expiresAt: "2025-12-31T23:59:59Z",
          userGenerated: true,
        }),
      });

      const response = await app.request(mockRequest, mockEnv);
      expect(response.status).toBe(403);

      const body = await response.json();
      expect(body.message).toContain("OAuth authentication");
    });

    it.skip("should validate request body for API key creation", async () => {
      mockRequest = new Request("http://localhost/api-keys", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-oauth-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Missing required fields
        }),
      });

      const response = await app.request(mockRequest, mockEnv);
      expect(response.status).toBe(400);
    });
  });

  describe("Provider Capabilities", () => {
    it("should report correct capabilities for local provider", () => {
      const capabilities = getProviderCapabilities(mockEnv);

      expect(capabilities.provider).toBe("local");
      expect(capabilities.hasDelete).toBe(false);
      expect(capabilities.hasCreateWithResources).toBe(true);
      expect(capabilities.hasListPaginated).toBe(true);
      expect(capabilities.hasRevoke).toBe(true);
    });

    it("should report correct capabilities for anaconda provider", () => {
      const env = {
        ...mockEnv,
        SERVICE_PROVIDER: "anaconda",
        EXTENSION_CONFIG: JSON.stringify({
          apiKeyUrl: "https://api.anaconda.com/v2/api-keys",
          userinfoUrl: "https://api.anaconda.com/v2/whoami",
        }),
      };

      const capabilities = getProviderCapabilities(env);

      expect(capabilities.provider).toBe("anaconda");
      expect(capabilities.hasDelete).toBe(true);
      expect(capabilities.hasRevoke).toBe(false);
      expect(capabilities.hasCreateWithResources).toBe(false);
      expect(capabilities.hasListPaginated).toBe(false);
    });
  });
});

// Helper function to create mock D1 result
function createMockD1Result(results: any[] = [], success = true, changes = 0) {
  return {
    results,
    success,
    changes,
    meta: {},
  };
}

// Helper function to create mock JWT token
function createMockJWT(
  payload: any,
  header: any = { typ: "JWT", alg: "RS256" }
) {
  const encodedHeader = btoa(JSON.stringify(header)).replace(/[+/=]/g, (m) => {
    return { "+": "-", "/": "_", "=": "" }[m] || m;
  });

  const encodedPayload = btoa(JSON.stringify(payload)).replace(
    /[+/=]/g,
    (m) => {
      return { "+": "-", "/": "_", "=": "" }[m] || m;
    }
  );
  return `${encodedHeader}.${encodedPayload}.mock-signature`;
}

// Export helpers for other test files
export { createMockD1Result, createMockJWT, mockEnv, mockPassport };
