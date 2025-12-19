import type {
  PermissionsProvider,
  PermissionResult,
  GrantPermissionInput,
  RevokePermissionInput,
  UserPermission,
  PermissionLevel,
} from "./types.ts";
import { ListPermissionsResponse, ProjectsClient } from "backend/clients/projects-client.ts";
import { D1Database } from "@cloudflare/workers-types";
import { getProjectIdForNotebook } from "backend/utils/projects-utils.ts";


/**
 * Local permissions provider using D1 database
 */
export class AnacondaPermissionsProvider implements PermissionsProvider {
        constructor(private client: ProjectsClient,
            private db: D1Database
        ) {}

    async getNotebookIdsByProjectIds(projectIds: string[]): Promise<string[]> {
        if (projectIds.length === 0) {
            return [];
        }

        // Create placeholders for the SQL query
        const placeholders = projectIds.map(() => "?").join(",");
        const query = `SELECT id FROM notebooks WHERE project_id IN (${placeholders})`;
        
        const results = await this.db
            .prepare(query)
            .bind(...projectIds)
            .all<{ id: string }>();

        return results.results?.map(row => row.id) ?? [];
    }

    async checkPermission(userId: string, notebookId: string): Promise<PermissionResult> {
        let projectId = await getProjectIdForNotebook(this.db, notebookId);
        if (!projectId) {
            return { hasAccess: false, error: "Notebook not found" };
        }

        let permissions: ListPermissionsResponse | undefined = undefined;
        try {
            permissions = await this.client.getPermissions(projectId);
        }
        catch (error) {
            return {
                hasAccess: false, 
                error: error instanceof Error ? error.message : "Unknown error" 
            };
        }

        for (const item of permissions.items) {
            if (item.type === "user_id" && item.id === userId) {
                if (item.relation === "owner" || item.relation === "writer") {
                    return {
                        hasAccess: true,
                        level: item.relation === "owner" ? "owner" : "writer",
                    };
                }
            }
        }

        return { 
            hasAccess: false,
            error: "Permission not found" 
        };
        
    }
    async grantPermission(input: GrantPermissionInput): Promise<void> {
        if (!await this.isOwner(input.userId, input.notebookId)) {
            throw new Error("Only owners can grant permissions");
        }

        let projectId = await getProjectIdForNotebook(this.db, input.notebookId);

        if (!projectId) {
            throw new Error("notebook not found");
        }

        await this.client.setPermissions(projectId, {
            permissions: [{
                type: "user_id",
                relation: "writer",
                id: input.userId,
                action: "add",
            }]
        });
    }
    async revokePermission(input: RevokePermissionInput): Promise<void> {
        if (!await this.isOwner(input.userId, input.notebookId)) {
            throw new Error("Only owners can grant permissions");
        }

        let projectId = await getProjectIdForNotebook(this.db, input.notebookId);

        if (!projectId) {
            throw new Error("notebook not found");
        }

        await this.client.setPermissions(projectId, {
            permissions: [{
                type: "user_id",
                relation: "writer",
                id: input.userId,
                action: "remove",
            }]
        });
    }
    async listPermissions(notebookId: string): Promise<UserPermission[]> {
        let projectId = await getProjectIdForNotebook(this.db, notebookId);
        if (!projectId) {
            throw new Error("project not found");
        }

        
        let permissionsResponse: ListPermissionsResponse | undefined = undefined;
        let permissions: UserPermission[] = [];
        try {
            permissionsResponse = await this.client.getPermissions(projectId);
        }
        catch {
            return permissions;
        }

        for (const item of permissionsResponse.items) {
            if (item.type === "user_id" && item.id !== "*") {
                if (item.relation in ["owner", "writer"]) {
                    permissions.push({
                        userId: item.id,
                        level: item.relation === "owner" ? "owner" : "writer",
                    });
                }
            }
        }
        return permissions;
    }
    async isOwner(userId: string, notebookId: string): Promise<boolean> {
        let userPermission = await this.checkPermission(userId, notebookId);
        return userPermission.hasAccess && userPermission.level === "owner";
    }

    async listAccessibleResources(userId: string, resourceType: "notebook", permissions?: PermissionLevel[]): Promise<string[]> {
        if (resourceType !== "notebook") {
            throw new Error(`Unsupported resource type ${resourceType}`);
        }

        let options: any = {};
        if (permissions && permissions.includes("owner")) {
            options.owner = "me";
        }
        let projects = await this.client.listProjects(options);
        let projectIds = projects.map(proj => proj.id);
        let notebookIds = await this.getNotebookIdsByProjectIds(projectIds);
        return notebookIds;
        
    }
    async filterAccessibleResources(userId: string, resourceIds: string[]): Promise<string[]> {
        // Method not used for now. Not implemented yet.
        throw new Error("Method not implemented.");
    }
    /*
    async fetchAccessibleResourcesWithData?(userId: string, resourceType: "notebook", options: { owned?: boolean; shared?: boolean; limit?: number; offset?: number; }): Promise<any[] | null> {
        if (resourceType !== "notebook") {
            throw new Error(`Unsupported resource type ${resourceType}`);
        }

        let fetchOwned = options.owned ?? true;
        let fetchShared = options.shared ?? true;

        let projectOptions: any = {};
        if (fetchOwned && !fetchShared) {
            projectOptions.owner = "me";
        }

        let projects = await this.client.listProjects(projectOptions);
        if (fetchShared && !fetchOwned) {
            // Filter out owned projects
            projects = projects.filter(proj =>
                proj.owner?.type !== "user" || proj.owner?.id !== userId);
        }
        let projectIds = projects.map(proj => proj.id);
        let notebookIds = await this.getNotebookIdsByProjectIds(projectIds);
        return notebookIds;
    }
    */
}
