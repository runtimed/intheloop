import { describe, it, expect, beforeEach, vi, Mock } from "vitest";
import { Hono } from "hono";
import apiRoutes from "../backend/routes";
import { type Env } from "../backend/types";

// Mock the auth middleware
vi.mock("../backend/middleware", () => ({
  authMiddleware: vi.fn((c, next) => {
    // Mock successful auth
    c.set("passport", { user: { id: "test-user" } });
    c.set("userId", "test-user");
    c.set("isRuntime", false);
    return next();
  }),
  projectsClientMiddleware: vi.fn((c, next) => {
    // Mock projects client middleware (no-op for tests)
    return next();
  }),
}));

// Mock auth validation
vi.mock("../backend/auth", () => ({
  validateAuthPayload: vi.fn().mockResolvedValue({ user: { id: "test-user" } }),
}));

// Mock all extension-related imports to avoid module issues

describe("Hono API Routes", () => {
  let mockEnv: Env;
  let mockR2Bucket: {
    put: Mock;
    get: Mock;
  };
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();

    mockR2Bucket = {
      put: vi.fn(),
      get: vi.fn(),
    };

    mockEnv = {
      DEPLOYMENT_ENV: "development",
      ARTIFACT_BUCKET: mockR2Bucket as any,
    } as Env;

    // Create a test app with our routes
    app = new Hono();
    app.route("/api", apiRoutes);
  });

  describe("Health Endpoint", () => {
    it("should return health status", async () => {
      const res = await app.request("/api/health", {}, mockEnv);
      const result = await res.json();

      expect(res.status).toBe(200);
      expect(result).toEqual({
        status: "healthy",
        deployment_env: "development",
        timestamp: expect.any(String),
        framework: "hono",
        config: {
          has_auth_issuer: false,
          deployment_env: "development",
          service_provider: "local",
          using_local_provider: true,
        },
        api_keys: {
          provider: "local",
          provider_valid: false,
          provider_errors: ["DB binding is required for local provider"],
        },
      });
    });
  });

  describe("Artifact Endpoints", () => {
    it("should upload artifact successfully", async () => {
      mockR2Bucket.put.mockResolvedValue(undefined);

      const res = await app.request(
        "/api/artifacts",
        {
          method: "POST",
          body: "test-data",
          headers: {
            "x-notebook-id": "test-notebook",
            "content-type": "image/png",
          },
        },
        mockEnv
      );

      const result = await res.json();
      expect(res.status).toBe(200);
      expect(result.artifactId).toMatch(/^test-notebook\/[a-f0-9-]+$/);
      expect(mockR2Bucket.put).toHaveBeenCalledWith(
        result.artifactId,
        expect.any(ArrayBuffer),
        { httpMetadata: { contentType: "image/png" } }
      );
    });

    it("should reject upload without notebook ID", async () => {
      const res = await app.request(
        "/api/artifacts",
        {
          method: "POST",
          body: "test-data",
          headers: { "content-type": "image/png" },
        },
        mockEnv
      );

      const result = await res.json();
      expect(res.status).toBe(400);
      expect(result).toEqual({
        error: "Bad Request",
        message: "x-notebook-id header is required",
      });
    });

    it("should download artifact successfully", async () => {
      const mockArtifact = {
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        httpMetadata: { contentType: "image/png" },
      };
      mockR2Bucket.get.mockResolvedValue(mockArtifact);

      const res = await app.request(
        "/api/artifacts/test-notebook/uuid-123",
        {},
        mockEnv
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/png");
      expect(mockR2Bucket.get).toHaveBeenCalledWith("test-notebook/uuid-123");
    });

    it("should return 404 for missing artifact", async () => {
      mockR2Bucket.get.mockResolvedValue(null);

      const res = await app.request(
        "/api/artifacts/missing-artifact",
        {},
        mockEnv
      );
      const result = await res.json();

      expect(res.status).toBe(404);
      expect(result).toEqual({
        error: "Not Found",
        message: "Artifact not found",
      });
    });

    it("should handle CORS preflight", async () => {
      const res = await app.request(
        "/api/artifacts/test",
        { method: "OPTIONS" },
        mockEnv
      );

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
        "GET, POST, OPTIONS"
      );
    });
  });

  describe("Error Handling", () => {
    it("should return 405 for DELETE on artifacts", async () => {
      const res = await app.request(
        "/api/artifacts/test",
        { method: "DELETE" },
        mockEnv
      );
      const result = await res.json();

      expect(res.status).toBe(405);
      expect(result.error).toBe("Method Not Allowed");
    });
  });
});
