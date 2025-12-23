import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { authMiddleware, type RequestContext } from "./middleware.ts";
import { type Env } from "./types.ts";

// Import unified API key routes
import apiKeyRoutes from "./api-key-routes.ts";
import {
  isUsingLocalProvider,
  validateProviderConfig,
} from "./providers/api-key-factory.ts";

// Import notebook utilities
import { createNotebookId } from "./utils/notebook-id";
import {
  createNotebook,
  getNotebookById,
  createTag,
  getTagByName,
  assignTagToNotebook,
  getNotebookTags,
  invalidateNotebookCache,
} from "./trpc/db";
import { createPermissionsProvider } from "./notebook-permissions/factory.ts";
import type { TagColor } from "./trpc/types.ts";
import { getBearerToken } from "./utils/request-utils.ts";
import { createProjectIfNeeded, getProjectIdForNotebook } from "./utils/projects-utils.ts";
import { projectsClientMiddleware } from "./middleware.ts";

const api = new Hono<{ Bindings: Env; Variables: RequestContext }>();

// Health endpoint - no auth required
api.get("/health", (c) => {
  // Validate provider configuration
  const providerValidation = validateProviderConfig(c.env);

  return c.json({
    status: "healthy",
    deployment_env: c.env.DEPLOYMENT_ENV,
    timestamp: new Date().toISOString(),
    framework: "hono",
    config: {
      has_auth_issuer: Boolean(c.env.AUTH_ISSUER),
      deployment_env: c.env.DEPLOYMENT_ENV,
      service_provider: c.env.SERVICE_PROVIDER || "local",
      using_local_provider: isUsingLocalProvider(c.env),
    },
    api_keys: {
      provider: providerValidation.provider,
      provider_valid: providerValidation.valid,
      provider_errors: providerValidation.errors,
    },
  });
});

// Me endpoint - returns authenticated user info
api.get("/me", authMiddleware, (c) => {
  const passport = c.get("passport");
  if (!passport) {
    return c.json({ error: "Authentication failed" }, 401);
  }
  return c.json({
    id: passport.user.id,
    email: passport.user.email,
    name: passport.user.name,
    givenName: passport.user.givenName,
    familyName: passport.user.familyName,
    isAnonymous: passport.user.isAnonymous,
  });
});

// Request body validation schema for notebook creation
const createNotebookSchema = z.object({
  title: z.string().min(1).max(255).trim(),
  tags: z.array(z.string().min(1).max(50).trim()).optional(),
});

/**
 * POST /notebooks - Create a new notebook
 *
 * Creates a new notebook with the authenticated user as owner.
 * Designed for external clients using API keys.
 *
 * @param title - Required notebook title (1-255 characters)
 * @param tags - Optional array of tag names to assign to notebook
 * @returns Created notebook with ID, title, owner, and timestamps
 */
api.post("/notebooks", authMiddleware, projectsClientMiddleware, async (c) => {
  const passport = c.get("passport");
  if (!passport) {
    return c.json({ error: "Authentication failed" }, 401);
  }

  try {
    const body = await c.req.json();

    // Validate request body with Zod
    const parseResult = createNotebookSchema.safeParse(body);
    if (!parseResult.success) {
      return c.json(
        {
          error: "Bad Request",
          message: "Invalid request body",
          details: parseResult.error.format(),
        },
        400
      );
    }

    const { title, tags } = parseResult.data;

    // Generate notebook ID
    const notebookId = createNotebookId();
    const projectsClient = c.get("projectsClient");
    let projectId: string | null = await createProjectIfNeeded(
      c.env,
      getBearerToken(c.req),
      projectsClient
    );
    if (projectId) {
      console.log(`✅ Created project ${projectId} for notebook ${notebookId}`);
    }

    // Create notebook in database - ownership is established through owner_id field
    const success = await createNotebook(c.env.DB, {
      id: notebookId,
      ownerId: passport.user.id,
      title: title,
      projectId: projectId,
    });

    if (!success) {
      return c.json(
        {
          error: "Internal Server Error",
          message: "Failed to create notebook",
        },
        500
      );
    }

    // Retrieve the created notebook
    const notebook = await getNotebookById(c.env.DB, notebookId);

    if (!notebook) {
      return c.json(
        {
          error: "Internal Server Error",
          message: "Notebook created but could not be retrieved",
        },
        500
      );
    }

    // Invalidate cache for this user since we created a new notebook
    await invalidateNotebookCache(passport.user.id);

    // Handle tags if provided
    if (tags && tags.length > 0) {
      try {
        for (const tagName of tags) {
          // Check if tag already exists for this user
          let tag = await getTagByName(c.env.DB, tagName, passport.user.id);

          // Create tag if it doesn't exist
          if (!tag) {
            tag = await createTag(c.env.DB, {
              name: tagName,
              color: "#3B82F6" as TagColor, // Default blue color
              user_id: passport.user.id,
            });
          }

          // Assign tag to notebook if creation was successful
          if (tag) {
            await assignTagToNotebook(c.env.DB, notebookId, tag.id);
          }
        }
      } catch (tagError) {
        console.warn("❌ Tag assignment failed:", tagError);
        // Don't fail the entire request if tag assignment fails
      }
    }

    return c.json({
      id: notebook.id,
      title: notebook.title,
      ownerId: notebook.owner_id,
      createdAt: notebook.created_at,
      updatedAt: notebook.updated_at,
    });
  } catch (error) {
    console.error("❌ Notebook creation failed:", error);

    if (error instanceof SyntaxError) {
      return c.json(
        {
          error: "Bad Request",
          message: "Invalid JSON in request body",
        },
        400
      );
    }

    return c.json(
      {
        error: "Internal Server Error",
        message: "Failed to create notebook",
      },
      500
    );
  }
});

/**
 * GET /notebooks/:id - Get specific notebook by ID
 *
 * Returns notebook details if the authenticated user has access.
 * Designed for external clients using API keys.
 *
 * @param id - Notebook ID
 * @returns Notebook details with metadata
 */
api.get("/notebooks/:id", authMiddleware, async (c) => {
  const passport = c.get("passport");
  if (!passport) {
    return c.json({ error: "Authentication failed" }, 401);
  }

  const notebookId = c.req.param("id");
  if (!notebookId) {
    return c.json(
      {
        error: "Bad Request",
        message: "Notebook ID is required",
      },
      400
    );
  }

  try {
    // Create permissions provider (reuse scoped client if available)
    const projectsClient = c.get("projectsClient");
    const permissionsProvider = createPermissionsProvider(
      c.env,
      getBearerToken(c.req),
      projectsClient
    );

    // Check if user has access to this notebook
    const permissionResult = await permissionsProvider.checkPermission(
      passport.user.id,
      notebookId
    );

    if (!permissionResult.hasAccess) {
      return c.json(
        {
          error: "Not Found",
          message: "Notebook not found or access denied",
        },
        404
      );
    }

    // Get notebook from database
    const notebook = await getNotebookById(c.env.DB, notebookId);

    if (!notebook) {
      return c.json(
        {
          error: "Not Found",
          message: "Notebook not found",
        },
        404
      );
    }

    // Get notebook tags
    const tags = await getNotebookTags(c.env.DB, notebookId, passport.user.id);

    return c.json({
      id: notebook.id,
      title: notebook.title,
      ownerId: notebook.owner_id,
      createdAt: notebook.created_at,
      updatedAt: notebook.updated_at,
      tags: tags,
    });
  } catch (error) {
    console.error("❌ Failed to get notebook:", error);
    return c.json(
      {
        error: "Internal Server Error",
        message: "Failed to retrieve notebook",
      },
      500
    );
  }
});

// Mount unified API key routes
api.route("/api-keys", apiKeyRoutes);

// Artifact routes - Auth applied per route - uploads need auth, downloads are public
//
// Three-step artifact upload using Anaconda Projects Service:
//
// 1. Client calls POST /artifacts/:file_name/init (no file payload)
//    - Backend:
//      * Validates user + notebook access
//      * Looks up notebook.project_id
//      * Calls ProjectsClient.preloadFile(project_id, file_name)
//      * Returns { uploadUrl, fileUrl, fileVersionId }
//
// 2. Client uploads binary directly to uploadUrl (PUT) – no backend involvement
//
// 3. Client calls POST /artifacts/:file_name/commit with { fileVersionId }
//    - Backend:
//      * Validates user + notebook access
//      * Calls ProjectsClient.commitFileVersion(project_id, fileVersionId)
//      * Returns simple success payload
//
// These routes are only active when PERMISSIONS_PROVIDER is "anaconda";
// existing R2-based /artifacts routes are kept for backward compatibility.

api.post("/artifacts/:file_name/init", authMiddleware, projectsClientMiddleware, async (c) => {
  const passport = c.get("passport");
  if (!passport) {
    return c.json({ error: "Authentication failed" }, 401);
  }

  if (c.env.PERMISSIONS_PROVIDER !== "anaconda") {
    return c.redirect("/artifacts", 307);
  }

  const notebookId = c.req.header("x-notebook-id");
  if (!notebookId) {
    return c.json(
      {
        error: "Bad Request",
        message: "x-notebook-id header is required",
      },
      400
    );
  }

  const fileName = c.req.param("file_name");
  if (!fileName) {
    return c.json(
      {
        error: "Bad Request",
        message: "file_name path parameter is required",
      },
      400
    );
  }

  try {
    const bearerToken = getBearerToken(c.req);

    // Ensure the user has access to this notebook (reuse scoped client if available)
    const projectsClient = c.get("projectsClient");
    const permissionsProvider = createPermissionsProvider(
      c.env,
      bearerToken,
      projectsClient
    );
    const permissionResult = await permissionsProvider.checkPermission(
      passport.user.id,
      notebookId
    );

    if (!permissionResult.hasAccess) {
      return c.json(
        {
          error: "Not Found",
          message: "Notebook not found or access denied",
        },
        404
      );
    }

    // Look up project_id for this notebook
    const projectId = await getProjectIdForNotebook(c.env.DB, notebookId);
    if (!projectId) {
      return c.json(
        {
          error: "Bad Request",
          message:
            "Notebook is not associated with a project",
        },
        404
      );
    }
    
    if (!projectsClient) {
      return c.json(
        {
          error: "Internal Server Error",
          message: "Projects client not available",
        },
        500
      );
    }

    // Make the project public
    // Done here because setting this during project creation sometimes returns 403
    // Workaround until we can authenticate artifact reads
    await projectsClient.setPermissions(projectId, {
      is_public: true,
    }); 

    const preload = await projectsClient.preloadFile(projectId, fileName);

    // Normalize keys for the client.
    return c.json({
      uploadUrl: preload.signed_url,
      fileUrl: preload.url,
      fileVersionId: preload.file_version_id,
    });
  } catch (error) {
    console.error("❌ Artifact init via Projects service failed:", error);
    return c.json(
      {
        error: "Internal Server Error",
        message: "Failed to initialize artifact upload",
      },
      500
    );
  }
});

api.post("/artifacts/:file_name/commit", authMiddleware, projectsClientMiddleware, async (c) => {
  const passport = c.get("passport");
  if (!passport) {
    return c.json({ error: "Authentication failed" }, 401);
  }

  if (c.env.PERMISSIONS_PROVIDER !== "anaconda") {
    return c.json(
      {
        error: "Not Implemented",
        message:
          "Multi-step artifact uploads are not supported for this provider",
      },
      400
    );
  }

  const notebookId = c.req.header("x-notebook-id");
  if (!notebookId) {
    return c.json(
      {
        error: "Bad Request",
        message: "x-notebook-id header is required",
      },
      400
    );
  }

  const body = await c.req.json();

  const { fileVersionId } = body;

  try {
    const bearerToken = getBearerToken(c.req);

    // Ensure the user has access to this notebook (reuse scoped client if available)
    const projectsClient = c.get("projectsClient");
    const permissionsProvider = createPermissionsProvider(
      c.env,
      bearerToken,
      projectsClient
    );
    const permissionResult = await permissionsProvider.checkPermission(
      passport.user.id,
      notebookId
    );

    if (!permissionResult.hasAccess) {
      return c.json(
        {
          error: "Not Found",
          message: "Notebook not found or access denied",
        },
        404
      );
    }

    const projectId = await getProjectIdForNotebook(c.env.DB, notebookId);

    if (!projectId) {
      return c.json(
        {
          error: "Bad Request",
          message:
            "Notebook is not associated with a project",
        },
        404
      );
    }

    if (!projectsClient) {
      return c.json(
        {
          error: "Internal Server Error",
          message: "Projects client not available",
        },
        500
      );
    }

    await projectsClient.commitFileVersion(projectId, fileVersionId);

    return c.json({
      status: "ok",
      notebookId,
      fileName: c.req.param("file_name"),
      fileVersionId,
    });
  } catch (error) {
    console.error("❌ Artifact commit via Projects service failed:", error);
    return c.json(
      {
        error: "Internal Server Error",
        message: "Failed to finalize artifact upload",
      },
      500
    );
  }
});

// Legacy R2-based artifact upload (kept for backward compatibility)
// POST /artifacts - Upload artifact (requires auth)
api.post("/artifacts", authMiddleware, async (c) => {
  const notebookId = c.req.header("x-notebook-id");
  const mimeType = c.req.header("content-type") || "application/octet-stream";

  if (!notebookId) {
    return c.json(
      {
        error: "Bad Request",
        message: "x-notebook-id header is required",
      },
      400
    );
  }

  try {
    const artifactId = `${notebookId}/${uuidv4()}`;
    await c.env.ARTIFACT_BUCKET.put(artifactId, await c.req.arrayBuffer(), {
      httpMetadata: {
        contentType: mimeType,
      },
    });

    return c.json({ artifactId });
  } catch (error) {
    console.error("❌ Artifact upload failed:", error);
    return c.json(
      {
        error: "Internal Server Error",
        message: "Failed to store artifact",
      },
      500
    );
  }
});

// GET /artifacts/* - Download artifact (public, no auth required)
// Handle any path after /artifacts/ to support compound IDs like notebookId/uuid
api.get("/artifacts/*", async (c) => {
  const url = new URL(c.req.url);
  // Extract the artifact ID from the path after /artifacts/
  const pathMatch = url.pathname.match(/\/artifacts\/(.+)$/);
  const artifactId = pathMatch ? pathMatch[1] : "";

  if (!artifactId) {
    return c.json(
      {
        error: "Bad Request",
        message: "Artifact ID is required",
      },
      400
    );
  }

  try {
    const artifact = await c.env.ARTIFACT_BUCKET.get(artifactId);
    if (!artifact) {
      return c.json(
        {
          error: "Not Found",
          message: "Artifact not found",
        },
        404
      );
    }

    const contentType =
      artifact.httpMetadata?.contentType || "application/octet-stream";

    return new Response(await artifact.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("❌ Artifact retrieval failed:", error);
    return c.json(
      {
        error: "Internal Server Error",
        message: "Failed to retrieve artifact",
      },
      500
    );
  }
});

// OPTIONS - Handle CORS preflight requests for artifacts
api.options("/artifacts/*", () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
});

// DELETE method not allowed for artifacts
api.delete("/artifacts/*", (c) => {
  return c.json({ error: "Method Not Allowed" }, 405);
});

// All other artifact methods not allowed
api.all("/artifacts/*", (c) => {
  return c.json({ error: "Unknown Method" }, 405);
});

export default api;
