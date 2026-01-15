/**
 * Projects Service Client
 *
 * This client handles all interactions with the Anaconda Projects Service for:
 * - Managing notebook collections/projects
 * - Handling permissions via SpiceDB
 * - Managing file uploads and downloads
 */

export interface ProjectsConfig {
  baseUrl: string;
  bearerToken: string;
}

class ProjectsError extends Error {
  statusCode: number | undefined;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Project creation request
 */
export interface CreateProjectRequest {
  name: string; // Can be "<random>" to auto-generate
  title?: string; // Display name, auto-generated from name if not provided
  description?: string;
  metadata?: ProjectMetadata;
  owner?: {
    type: "user" | "organization";
    id?: string;
    name?: string;
  };
}

export interface ProjectMetadata {
  hidden?: boolean;
  tags?: ("notebook" | "data" | "pyscript" | "code_snippet")[];
  user_client?: "excel" | "notebook" | "python" | "pyscript" | "unknown";
}

/**
 * Project response from the service
 */
export interface ProjectSchema {
  id: string;
  name: string;
  title: string;
  description?: string;
  metadata: ProjectMetadata;
  owner?: {
    type: "user" | "organization";
    id?: string;
    name?: string;
  };
  created_at: string;
  updated_at: string;
}

/**
 * Project list response with pagination
 */
export interface ProjectListResponse {
  items: ProjectSchema[];
  total_count: number;
  num_items: number;
  next_page_url?: string;
  prev_page_url?: string;
}

/**
 * Update project request
 */
export interface UpdateProjectRequest {
  name?: string;
  title?: string;
  description?: string;
  metadata?: ProjectMetadata;
}

// ============================================================
// Permission Types
// ============================================================

/**
 * Subject type for permissions
 */
export type SubjectType = "user_id" | "org_id" | "org_name";

/**
 * Permission relation/role
 */
export type PermissionRelation = "owner" | "writer" | "reader" | "finder";

/**
 * Permission item for request
 */
export interface PermissionItem {
  type: SubjectType;
  relation: PermissionRelation;
  id: string;
  action: "add" | "remove";
}

/**
 * Permission response item
 */
export interface PermissionResponseItem {
  type: SubjectType;
  relation: PermissionRelation;
  id: string;
}

/**
 * List of permissions response
 */
export interface ListPermissionsResponse {
  items: PermissionResponseItem[];
  num_items: number;
}

/**
 * My permissions response - permissions for the current user
 */
export interface MyPermissionResponseItem {
  delete: boolean;
  find: boolean;
  modify: boolean;
  own: boolean;
  read: boolean;
  share: boolean;
}

/**
 * Set project permissions request
 */
export interface SetProjectPermissionsRequest {
  permissions?: PermissionItem[];
  is_public?: boolean;
}

// ============================================================
// File & Artifact Types
// ============================================================

/**
 * Request body for file preload / metadata update.
 *
 * Matches UpdateFileBody in the Projects service swagger:
 * - description?: string | null
 * - metadata?: object | null
 */
export interface UpdateFileBody {
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Response from the file preload endpoint.
 *
 * The swagger spec currently declares an empty schema for the response,
 * but the projects_planning doc specifies that the backend should
 * receive:
 * - signed_url: pre-signed PUT URL for binary upload
 * - url: authenticated URL for reading the file
 * - file_version_id: identifier for the file version to commit
 */
export interface FilePreloadResponse {
  signed_url: string;
  url: string;
  file_version_id: string;
}

// ============================================================
// Main Projects Service Client
// ============================================================

/**
 * Main Projects Service Client
 */
export class ProjectsClient {
  private config: ProjectsConfig;

  constructor(config: ProjectsConfig) {
    this.config = config;
  }

  /**
   * Make an authenticated request to the projects service
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { expectEmpty?: boolean },
    maxRetries: number = 3,
    retryDelay: number = 100
  ): Promise<T> {
    let responseVal: T | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      console.log(
        `ProjectsClient request attempt ${attempt + 1} for ${method} ${this.config.baseUrl}${path}`
      );
      try {
        const url = `${this.config.baseUrl}${path}`;

        const response = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.bearerToken}`,
            "User-Agent": "intheloop",
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        console.log(
          `ProjectsClient response status: ${response.status} for ${method} ${this.config.baseUrl}${path}`
        );

        if (!response.ok) {
          const error = await response.text();
          throw new ProjectsError(
            `Projects service error [${response.status}]: ${error}`,
            response.status
          );
        }

        if (options?.expectEmpty || response.status === 204) {
          return undefined as T;
        }

        responseVal = (await response.json()) as T;
        break; // Success, exit the retry loop
      } catch (error) {
        // If it's the last attempt or not a 5xx error, throw
        if (
          attempt === maxRetries - 1 ||
          !(
            error instanceof ProjectsError &&
            error.statusCode &&
            error.statusCode >= 500
          )
        ) {
          throw error;
        }

        // Wait before retrying
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay * (attempt + 1))
        );
      }
    }

    return responseVal as T;
  }

  // ============================================================
  // Project Management
  // ============================================================

  /**
   * Create a new project/collection for a notebook
   *
   * @param request - Project creation details
   * @returns The created project with its ID
   *
   * @example
   * const project = await client.createProject({
   *   name: "<random>",
   *   title: "My Notebook",
   *   metadata: {
   *     tags: ["notebook"],
   *     user_client: "notebook"
   *   }
   * });
   */
  async createProject(request: CreateProjectRequest): Promise<ProjectSchema> {
    return this.request<ProjectSchema>("POST", "/", request);
  }

  async createRandomlyNamedProject(): Promise<ProjectSchema> {
    return this.createProject({
      name: "<random>",
    });
  }

  /**
   * Get project details
   *
   * @param projectId - The project ID
   * @returns Project information
   */
  async getProject(projectId: string): Promise<ProjectSchema> {
    return this.request<ProjectSchema>("GET", `/${projectId}`);
  }

  /**
   * Delete a project
   *
   * Swagger path: /{project_id} (DELETE)
   * Returns 204 on success (no content)
   *
   * @param projectId - The project ID to delete
   * @returns Promise that resolves when deletion is complete
   */
  async deleteProject(projectId: string): Promise<void> {
    await this.request<void>("DELETE", `/${projectId}`, undefined, {
      expectEmpty: true,
    });
  }

  async listProjects(options?: {
    owner?: string; // "me", UUID, or null for all
  }): Promise<ProjectSchema[]> {
    let projects: ProjectSchema[] = [];
    let nextPageUrl: string | undefined = undefined;

    while (true) {
      let url = "/";

      // Build query parameters for the first request
      if (!nextPageUrl) {
        const params = new URLSearchParams();
        if (options?.owner) params.append("owner", options.owner);

        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;
      } else {
        url = nextPageUrl.replace(this.config.baseUrl, "");
      }

      let listResponse: ProjectListResponse =
        await this.request<ProjectListResponse>("GET", url);
      projects = projects.concat(listResponse.items);
      nextPageUrl = listResponse.next_page_url;
      if (!nextPageUrl) break;
    }
    return projects;
  }

  // ============================================================
  // Permissions Management (via SpiceDB)
  // ============================================================

  /**
   * Get project permissions
   *
   * @param projectId - The project ID
   * @returns List of permissions for the project
   */
  async getPermissions(projectId: string): Promise<ListPermissionsResponse> {
    return this.request<ListPermissionsResponse>(
      "GET",
      `/${projectId}/permissions`
    );
  }

  /**
   * Set project permissions
   *
   * Supports adding and removing permissions for users.
   * Add a user as a writer to grant them access to the collection.
   *
   * @param projectId - The project ID
   * @param request - Permissions to add/remove
   * @returns Updated permissions list
   *
   * @example
   * // Grant write access to a collaborator
   * await client.setPermissions(projectId, {
   *   permissions: [
   *     {
   *       type: "user_id",
   *       relation: "writer",
   *       id: "user-uuid",
   *       action: "add"
   *     }
   *   ]
   * });
   */
  async setPermissions(
    projectId: string,
    request: SetProjectPermissionsRequest
  ): Promise<ListPermissionsResponse> {
    return this.request<ListPermissionsResponse>(
      "POST",
      `/${projectId}/permissions`,
      request
    );
  }

  /**
   * Get my permissions for a project
   *
   * Swagger path: /{project_id}/permissions/my (GET)
   * Returns the permissions for the current authenticated user.
   *
   * @param projectId - The project ID
   * @returns Permissions for the current user
   */
  async getMyPermissions(projectId: string): Promise<MyPermissionResponseItem> {
    return this.request<MyPermissionResponseItem>(
      "GET",
      `/${projectId}/permissions/my`
    );
  }

  // ============================================================
  // File Uploads & Artifacts
  // ============================================================

  /**
   * Initialize a file upload for a project.
   *
   * Swagger path: /{project_id}/file-preload/{filename} (PUT)
   * planning doc: returns upload_url, file_url, file_version_id.
   *
   * @param projectId - Project UUID
   * @param filename - Logical filename within project, assumed to be URL-encoded
   * @param body - Optional file metadata (description, metadata)
   */
  async preloadFile(
    projectId: string,
    filename: string,
    body?: UpdateFileBody
  ): Promise<FilePreloadResponse> {
    // Body is required by swagger but can be an empty object in our use case.
    return this.request<FilePreloadResponse>(
      "PUT",
      `/${projectId}/file-preload/${filename}`,
      body ?? {}
    );
  }

  /**
   * Commit a file version after successful binary upload.
   *
   * Swagger path: /{project_id}/file-versions/{file_version_id} (PATCH)
   * planning doc: no body needed, returns 204.
   *
   * @param projectId - Project UUID
   * @param fileVersionId - File version UUID returned from preloadFile
   */
  async commitFileVersion(
    projectId: string,
    fileVersionId: string
  ): Promise<void> {
    await this.request<void>(
      "PATCH",
      `/${projectId}/file-versions/${fileVersionId}`,
      undefined,
      { expectEmpty: true }
    );
  }
}
