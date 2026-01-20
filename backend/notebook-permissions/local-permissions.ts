import type { D1Database } from "@cloudflare/workers-types";
import type {
  PermissionsProvider,
  PermissionResult,
  GrantPermissionInput,
  RevokePermissionInput,
  UserPermission,
} from "./types.ts";
import {
  createFallbackUser,
  getUsersByIds,
  toPublicFacingUser,
} from "../users/utils.ts";
import { NotebookRow, TagColor } from "backend/trpc/types.ts";

/**
 * Local permissions provider using D1 database
 */
export class LocalPermissionsProvider implements PermissionsProvider {
  constructor(private db: D1Database) {}

  async checkPermission(
    userId: string,
    notebookId: string
  ): Promise<PermissionResult> {
    try {
      // First check if user is the owner
      const ownerCheck = await this.db
        .prepare("SELECT owner_id FROM notebooks WHERE id = ?")
        .bind(notebookId)
        .first<{ owner_id: string }>();

      if (!ownerCheck) {
        return {
          hasAccess: false,
          error: "Notebook not found",
        };
      }

      if (ownerCheck.owner_id === userId) {
        return {
          hasAccess: true,
          level: "owner",
        };
      }

      // Check if user has writer permission
      const writerCheck = await this.db
        .prepare(
          "SELECT permission FROM notebook_permissions WHERE notebook_id = ? AND user_id = ?"
        )
        .bind(notebookId, userId)
        .first<{ permission: string }>();

      if (writerCheck && writerCheck.permission === "writer") {
        return {
          hasAccess: true,
          level: "writer",
        };
      }

      return {
        hasAccess: false,
      };
    } catch (error) {
      return {
        hasAccess: false,
        error: `Permission check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  async grantPermission(input: GrantPermissionInput): Promise<void> {
    const { notebookId, userId, grantedBy } = input;

    // Verify that grantedBy is the owner
    const isGranterOwner = await this.isOwner(grantedBy, notebookId);
    if (!isGranterOwner) {
      throw new Error("Only the owner can grant permissions");
    }

    // Check if user is already the owner
    const isAlreadyOwner = await this.isOwner(userId, notebookId);
    if (isAlreadyOwner) {
      throw new Error("Cannot grant permission to owner");
    }

    // Insert or update permission
    try {
      await this.db
        .prepare(
          `
          INSERT INTO notebook_permissions (notebook_id, user_id, permission)
          VALUES (?, ?, 'writer')
          ON CONFLICT (notebook_id, user_id)
          DO UPDATE SET granted_at = CURRENT_TIMESTAMP
        `
        )
        .bind(notebookId, userId)
        .run();
    } catch (error) {
      throw new Error(
        `Failed to grant permission: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async revokePermission(input: RevokePermissionInput): Promise<void> {
    const { notebookId, userId, revokedBy } = input;

    // Verify that revokedBy is the owner
    const isRevokerOwner = await this.isOwner(revokedBy, notebookId);
    if (!isRevokerOwner) {
      throw new Error("Only the owner can revoke permissions");
    }

    // Cannot revoke owner's permissions
    const isTargetOwner = await this.isOwner(userId, notebookId);
    if (isTargetOwner) {
      throw new Error("Cannot revoke owner's permissions");
    }

    try {
      const result = await this.db
        .prepare(
          "DELETE FROM notebook_permissions WHERE notebook_id = ? AND user_id = ?"
        )
        .bind(notebookId, userId)
        .run();

      if (result.meta.changes === 0) {
        throw new Error("Permission not found or already revoked");
      }
    } catch (error) {
      throw new Error(
        `Failed to revoke permission: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async listPermissions(notebookId: string): Promise<UserPermission[]> {
    try {
      const permissions: UserPermission[] = [];

      // Get owner
      const owner = await this.db
        .prepare("SELECT owner_id, created_at FROM notebooks WHERE id = ?")
        .bind(notebookId)
        .first<{ owner_id: string; created_at: string }>();

      if (!owner) {
        throw new Error("Notebook not found");
      }

      permissions.push({
        userId: owner.owner_id,
        level: "owner",
        grantedAt: owner.created_at,
      });

      // Get writers
      const writers = await this.db
        .prepare(
          "SELECT user_id, granted_at FROM notebook_permissions WHERE notebook_id = ?"
        )
        .bind(notebookId)
        .all<{ user_id: string; granted_at: string }>();

      for (const writer of writers.results) {
        permissions.push({
          userId: writer.user_id,
          level: "writer",
          grantedAt: writer.granted_at,
        });
      }

      return permissions;
    } catch (error) {
      throw new Error(
        `Failed to list permissions: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async isOwner(userId: string, notebookId: string): Promise<boolean> {
    try {
      const result = await this.db
        .prepare("SELECT 1 FROM notebooks WHERE id = ? AND owner_id = ?")
        .bind(notebookId, userId)
        .first();

      return !!result;
    } catch {
      return false;
    }
  }

  async listAccessibleResources(
    userId: string,
    resourceType: "notebook",
    permissions?: ("owner" | "writer")[]
  ): Promise<string[]> {
    // Currently only supports notebook resources
    if (resourceType !== "notebook") {
      throw new Error(`Unsupported resource type: ${resourceType}`);
    }

    try {
      const accessibleIds: string[] = [];

      // Always include owned notebooks (owner implies all permissions)
      if (!permissions || permissions.includes("owner")) {
        const ownedNotebooks = await this.db
          .prepare("SELECT id FROM notebooks WHERE owner_id = ?")
          .bind(userId)
          .all<{ id: string }>();

        accessibleIds.push(...ownedNotebooks.results.map((r) => r.id));
      }

      // Include notebooks with writer permissions if requested
      if (!permissions || permissions.includes("writer")) {
        const sharedNotebooks = await this.db
          .prepare(
            "SELECT notebook_id FROM notebook_permissions WHERE user_id = ? AND permission = 'writer'"
          )
          .bind(userId)
          .all<{ notebook_id: string }>();

        accessibleIds.push(
          ...sharedNotebooks.results.map((r) => r.notebook_id)
        );
      }

      // Remove duplicates (user could be owner and have explicit writer permission)
      return [...new Set(accessibleIds)];
    } catch (error) {
      throw new Error(
        `Failed to list accessible resources: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  async filterAccessibleResources(
    userId: string,
    resourceIds: string[]
  ): Promise<string[]> {
    if (resourceIds.length === 0) {
      return [];
    }

    try {
      const accessibleIds: string[] = [];

      // Check owned notebooks
      const placeholders = resourceIds.map(() => "?").join(",");
      const ownedNotebooks = await this.db
        .prepare(
          `SELECT id FROM notebooks WHERE owner_id = ? AND id IN (${placeholders})`
        )
        .bind(userId, ...resourceIds)
        .all<{ id: string }>();

      accessibleIds.push(...ownedNotebooks.results.map((r) => r.id));

      // Check notebooks with writer permissions
      const sharedNotebooks = await this.db
        .prepare(
          `SELECT notebook_id FROM notebook_permissions
           WHERE user_id = ? AND permission = 'writer' AND notebook_id IN (${placeholders})`
        )
        .bind(userId, ...resourceIds)
        .all<{ notebook_id: string }>();

      accessibleIds.push(...sharedNotebooks.results.map((r) => r.notebook_id));

      // Remove duplicates and maintain original order
      const uniqueAccessibleIds = [...new Set(accessibleIds)];
      return resourceIds.filter((id) => uniqueAccessibleIds.includes(id));
    } catch (error) {
      throw new Error(
        `Failed to filter accessible resources: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  // Helper function to get notebook collaborators
  private async getNotebookCollaborators(notebookId: string) {
    const query = `
      SELECT user_id FROM notebook_permissions
      WHERE notebook_id = ?
      AND permission = 'writer'
    `;

    const writers = await this.db
      .prepare(query)
      .bind(notebookId)
      .all<{ user_id: string }>();

    if (writers.results.length === 0) {
      return [];
    }

    const userIds = writers.results.map((w) => w.user_id);
    const userMap = await getUsersByIds(this.db, userIds);

    return userIds.map((userId) => {
      const userRecord = userMap.get(userId);
      if (userRecord) {
        return toPublicFacingUser(userRecord);
      } else {
        return createFallbackUser(userId);
      }
    });
  }

  // Helper function to get notebook tags for a specific user
  private async getNotebookTags(notebookId: string, userId: string) {
    const query = `
      SELECT t.id, t.name, t.color, t.user_id, t.created_at, t.updated_at
      FROM tags t
      INNER JOIN notebook_tags nt ON t.id = nt.tag_id
      WHERE nt.notebook_id = ? AND t.user_id = ?
      ORDER BY t.name ASC
    `;

    const result = await this.db.prepare(query).bind(notebookId, userId).all<{
      id: string;
      name: string;
      color: string;
      user_id: string;
      created_at: string;
      updated_at: string;
    }>();

    return result.results;
  }

  async fetchAccessibleResourcesWithData(
    userId: string,
    resourceType: "notebook",
    options: {
      owned?: boolean;
      shared?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<NotebookRow[] | null> {
    if (resourceType !== "notebook") {
      return null;
    }

    const { owned, shared, limit = 50, offset = 0 } = options;

    try {
      let query: string;
      let bindings: any[];

      if (owned && !shared) {
        // Only owned notebooks
        query = `
          SELECT id, owner_id, title,
            strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at,
            strftime('%Y-%m-%dT%H:%M:%SZ', updated_at) as updated_at
          FROM notebooks
          WHERE owner_id = ?
          ORDER BY updated_at DESC
          LIMIT ? OFFSET ?
        `;
        bindings = [userId, limit, offset];
      } else if (shared && !owned) {
        // Only shared notebooks (writer permissions)
        query = `
          SELECT n.id, n.owner_id, n.title,
            strftime('%Y-%m-%dT%H:%M:%SZ', n.created_at) as created_at,
            strftime('%Y-%m-%dT%H:%M:%SZ', n.updated_at) as updated_at
          FROM notebooks n
          INNER JOIN notebook_permissions np ON n.id = np.notebook_id
          WHERE np.user_id = ? AND np.permission = 'writer'
          ORDER BY n.updated_at DESC
          LIMIT ? OFFSET ?
        `;
        bindings = [userId, limit, offset];
      } else {
        // All accessible notebooks (owned + shared)
        query = `
          SELECT DISTINCT n.id, n.owner_id, n.title,
            strftime('%Y-%m-%dT%H:%M:%SZ', n.created_at) as created_at,
            strftime('%Y-%m-%dT%H:%M:%SZ', n.updated_at) as updated_at
          FROM notebooks n
          LEFT JOIN notebook_permissions np ON n.id = np.notebook_id
          WHERE n.owner_id = ? OR (np.user_id = ? AND np.permission = 'writer')
          ORDER BY n.updated_at DESC
          LIMIT ? OFFSET ?
        `;
        bindings = [userId, userId, limit, offset];
      }

      const result = await this.db
        .prepare(query)
        .bind(...bindings)
        .all<NotebookRow>();

      // Add collaborators and tags to each notebook
      const notebooksWithCollaboratorsAndTags = await Promise.all(
        result.results.map(async (notebook) => {
          try {
            const [collaborators, tags] = await Promise.all([
              this.getNotebookCollaborators(notebook.id),
              this.getNotebookTags(notebook.id, userId),
            ]);

            return {
              ...notebook,
              collaborators: collaborators.map((user) => ({
                id: user.id,
                givenName: user.givenName ?? "",
                familyName: user.familyName ?? "",
              })),
              tags: tags.map((tag) => ({
                ...tag,
                color: tag.color as TagColor,
              })),
            };
          } catch (error) {
            console.error(
              `Error fetching data for notebook ${notebook.id}:`,
              error
            );
            // Return notebook with empty arrays if there's an error
            return {
              ...notebook,
              collaborators: [],
              tags: [],
            };
          }
        })
      );

      return notebooksWithCollaboratorsAndTags;
    } catch (error) {
      // Fall back to null to indicate the two-step approach should be used
      console.error("Failed to fetch accessible resources with data:", error);
      return null;
    }
  }
}
