

import { ProjectsClient } from "backend/clients/projects-client";
import type { Env } from "../types.ts";
import { D1Database } from "@cloudflare/workers-types";

export async function createProjectIfNeeded(
  env: Env,
  bearerToken: string
): Promise<string | null> {
  let projectId: string | null = null;
  let useProjectsService = env.PERMISSIONS_PROVIDER === "anaconda";
  if (useProjectsService) {
    try {
      const projectsClient = new ProjectsClient({
        baseUrl: env.ANACONDA_PROJECTS_URL,
        bearerToken: bearerToken,
      });

      const project = await projectsClient.createProject({
        name: "<random>",
      });

      projectId = project.id;
    } catch (error) {
      console.error("Error creating project:", error);
      throw error;
    }
  }

  return projectId;
}

export async function getProjectIdForNotebook(db: D1Database, notebookId: string): Promise<string | null> {
  const query = `SELECT project_id FROM notebooks WHERE id = ? LIMIT 1`;
  const result = await db.prepare(query).bind(notebookId).first<{ project_id: string }>();
  return result ? result.project_id : null;
}