import type { D1Database } from "@cloudflare/workers-types";
import {
  NotebookPermissionRow,
  NotebookRow,
  TagRow,
  TagColor,
  SavedPromptRow,
} from "./types";
import { PermissionsProvider } from "backend/notebook-permissions/types";
import { ValidatedUser } from "backend/auth";
import {
  createFallbackUser,
  getUsersByIds,
  toPublicFacingUser,
  getUserById,
} from "backend/users/utils";
import { nanoid } from "nanoid";

export async function getNotebooks(
  ctx: {
    user: ValidatedUser;
    env: { DB: D1Database };
    permissionsProvider: PermissionsProvider;
  },
  options: {
    owned?: boolean;
    shared?: boolean;
    limit: number;
    offset: number;
  }
) {
  const { owned, shared, limit, offset } = options;
  const {
    user,
    env: { DB },
    permissionsProvider,
  } = ctx;

  let accessibleNotebookIds: string[];

  if (owned && !shared) {
    accessibleNotebookIds = await permissionsProvider.listAccessibleResources(
      user.id,
      "notebook",
      ["owner"]
    );
  } else if (shared && !owned) {
    const allAccessible = await permissionsProvider.listAccessibleResources(
      user.id,
      "notebook"
    );
    const ownedOnly = await permissionsProvider.listAccessibleResources(
      user.id,
      "notebook",
      ["owner"]
    );
    accessibleNotebookIds = allAccessible.filter(
      (id) => !ownedOnly.includes(id)
    );
  } else {
    // All accessible notebooks (default case and when both owned and shared are true)
    accessibleNotebookIds = await permissionsProvider.listAccessibleResources(
      user.id,
      "notebook"
    );
  }

  // Try efficient single-query approach first (works for local provider)
  if (permissionsProvider.fetchAccessibleResourcesWithData) {
    const efficientResult =
      await permissionsProvider.fetchAccessibleResourcesWithData(
        user.id,
        "notebook",
        { owned, shared, limit, offset }
      );

    if (efficientResult !== null) {
      return efficientResult;
    }
  }

  // Fall back to two-step approach for external providers
  if (accessibleNotebookIds.length === 0) {
    return [];
  }

  // Use chunked queries to avoid SQL parameter limits
  // SQLite has a limit around 999 parameters. Using 900 is well under the limit
  // and more efficient than smaller chunks like 100.
  const CHUNK_SIZE = 900;
  const allResults: NotebookRow[] = [];

  for (let i = 0; i < accessibleNotebookIds.length; i += CHUNK_SIZE) {
    const chunk = accessibleNotebookIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(",");
    const query = `
        SELECT id, owner_id, title,
               strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at,
               strftime('%Y-%m-%dT%H:%M:%SZ', updated_at) as updated_at
        FROM notebooks
        WHERE id IN (${placeholders})
        ORDER BY updated_at DESC
      `;

    const result = await DB.prepare(query)
      .bind(...chunk)
      .all<NotebookRow>();

    allResults.push(...result.results);
  }

  // Sort all results by updated_at DESC and apply pagination
  allResults.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  const finalResults = allResults.slice(offset, offset + limit);

  // Add collaborators and tags to each notebook
  const notebooksWithCollaboratorsAndTags = await Promise.all(
    finalResults.map(async (notebook) => ({
      ...notebook,
      collaborators: await getNotebookCollaborators(DB, notebook.id),
      tags: await getNotebookTags(DB, notebook.id, user.id),
    }))
  );

  return notebooksWithCollaboratorsAndTags;
}

// Helper function to invalidate notebook cache for a user
export async function invalidateNotebookCache(_userId: string): Promise<void> {
  // No-op: server-side caching disabled
}

// Helper function to get notebook collaborators
export async function getNotebookCollaborators(
  db: D1Database,
  notebookId: string
) {
  const query = `
    SELECT user_id FROM notebook_permissions
    WHERE notebook_id = ?
    AND permission = 'writer'
  `;

  const writers = await db
    .prepare(query)
    .bind(notebookId)
    .all<Pick<NotebookPermissionRow, "user_id">>();

  if (writers.results.length === 0) {
    return [];
  }

  const userIds = writers.results.map((w) => w.user_id);
  const userMap = await getUsersByIds(db, userIds);

  return userIds.map((userId: string) => {
    const userRecord = userMap.get(userId);
    if (userRecord) {
      return toPublicFacingUser(userRecord);
    } else {
      return createFallbackUser(userId);
    }
  });
}

// Get single notebook by ID
export async function getNotebookById(
  db: D1Database,
  notebookId: string
): Promise<NotebookRow | null> {
  const notebook = await db
    .prepare(
      `SELECT id, owner_id, title,
              strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at,
              strftime('%Y-%m-%dT%H:%M:%SZ', updated_at) as updated_at
              FROM notebooks WHERE id = ?`
    )
    .bind(notebookId)
    .first<NotebookRow>();

  return notebook || null;
}

// Create a new notebook
export async function createNotebook(
  db: D1Database,
  params: {
    id: string;
    ownerId: string;
    title: string;
    projectId?: string | null;
  }
): Promise<boolean> {
  const { id, ownerId, title, projectId } = params;

  const result = await db
    .prepare(
      `
      INSERT INTO notebooks (id, owner_id, title, project_id)
      VALUES (?, ?, ?, ?)
    `
    )
    .bind(id, ownerId, title, projectId || null)
    .run();

  return result.success;
}

// Update notebook metadata
export async function updateNotebook(
  db: D1Database,
  notebookId: string,
  updates: {
    title?: string;
  }
): Promise<boolean> {
  const { title } = updates;
  const updateFields: string[] = [];
  const bindings: unknown[] = [];

  if (title !== undefined) {
    updateFields.push("title = ?");
    bindings.push(title);
  }

  updateFields.push("updated_at = datetime('now')");
  bindings.push(notebookId);

  const result = await db
    .prepare(
      `
      UPDATE notebooks
      SET ${updateFields.join(", ")}
      WHERE id = ?
    `
    )
    .bind(...bindings)
    .run();

  return result.meta.changes > 0;
}

// Delete notebook
export async function deleteNotebook(
  db: D1Database,
  notebookId: string
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM notebooks WHERE id = ?")
    .bind(notebookId)
    .run();

  return result.meta.changes > 0;
}

// Get notebook owner ID
export async function getNotebookOwnerId(
  db: D1Database,
  notebookId: string
): Promise<string | null> {
  const notebook = await db
    .prepare("SELECT owner_id FROM notebooks WHERE id = ?")
    .bind(notebookId)
    .first<{ owner_id: string }>();

  return notebook?.owner_id || null;
}

// Get notebook owner user data
export async function getNotebookOwner(db: D1Database, notebookId: string) {
  const ownerId = await getNotebookOwnerId(db, notebookId);
  if (!ownerId) {
    return null;
  }

  const userRecord = await getUserById(db, ownerId);
  if (userRecord) {
    return toPublicFacingUser(userRecord);
  } else {
    return createFallbackUser(ownerId);
  }
}

// Tag-related functions

// Create a new tag
export async function createTag(
  db: D1Database,
  params: {
    name: string;
    color?: TagColor;
    user_id: string;
  }
): Promise<TagRow | null> {
  const { name, color, user_id } = params;
  const id = nanoid();
  const now = new Date().toISOString();

  try {
    const result = await db
      .prepare(
        `
        INSERT INTO tags (id, name, color, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .bind(id, name, color, user_id, now, now)
      .run();

    if (result.success) {
      return {
        id,
        name,
        color: color as TagColor,
        user_id,
        created_at: now,
        updated_at: now,
      };
    }
    return null;
  } catch (error) {
    // Handle unique constraint violation
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      return null;
    }
    throw error;
  }
}

// Update tag name and color
export async function updateTag(
  db: D1Database,
  tagId: string,
  params: {
    name?: string;
    color?: TagColor;
  }
): Promise<boolean> {
  const { name, color } = params;
  const now = new Date().toISOString();

  const updateFields: string[] = [];
  const bindings: unknown[] = [];

  if (name !== undefined) {
    updateFields.push("name = ?");
    bindings.push(name);
  }

  if (color !== undefined) {
    updateFields.push("color = ?");
    bindings.push(color);
  }

  updateFields.push("updated_at = ?");
  bindings.push(now);
  bindings.push(tagId);

  try {
    const result = await db
      .prepare(
        `
        UPDATE tags
        SET ${updateFields.join(", ")}
        WHERE id = ?
      `
      )
      .bind(...bindings)
      .run();

    return result.meta.changes > 0;
  } catch (error) {
    // Handle unique constraint violation
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      return false;
    }
    throw error;
  }
}

// Delete tag
export async function deleteTag(
  db: D1Database,
  tagId: string
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM tags WHERE id = ?")
    .bind(tagId)
    .run();

  return result.meta.changes > 0;
}

// Get tag by ID
export async function getTagById(
  db: D1Database,
  tagId: string
): Promise<TagRow | null> {
  const tag = await db
    .prepare(
      `SELECT id, name, color, user_id,
              strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at,
              strftime('%Y-%m-%dT%H:%M:%SZ', updated_at) as updated_at
              FROM tags WHERE id = ?`
    )
    .bind(tagId)
    .first<TagRow>();

  return tag || null;
}

// Check if user owns a tag
export async function checkTagOwnership(
  db: D1Database,
  tagId: string,
  user_id: string
): Promise<boolean> {
  const tag = await db
    .prepare("SELECT user_id FROM tags WHERE id = ?")
    .bind(tagId)
    .first<{ user_id: string }>();

  return tag?.user_id === user_id;
}

// Get tag by name and user
export async function getTagByName(
  db: D1Database,
  name: string,
  user_id: string
): Promise<TagRow | null> {
  const tag = await db
    .prepare(
      `SELECT id, name, color, user_id,
              strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at,
              strftime('%Y-%m-%dT%H:%M:%SZ', updated_at) as updated_at
              FROM tags WHERE name = ? AND user_id = ?`
    )
    .bind(name, user_id)
    .first<TagRow>();

  return tag || null;
}

// Get all tags for a user
export async function getUserTags(
  db: D1Database,
  user_id: string
): Promise<TagRow[]> {
  const result = await db
    .prepare(
      `SELECT id, name, color, user_id,
              strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at,
              strftime('%Y-%m-%dT%H:%M:%SZ', updated_at) as updated_at
              FROM tags WHERE user_id = ? ORDER BY created_at ASC`
    )
    .bind(user_id)
    .all<TagRow>();

  return result.results;
}

// Assign tag to notebook
export async function assignTagToNotebook(
  db: D1Database,
  notebookId: string,
  tagId: string
): Promise<boolean> {
  const now = new Date().toISOString();

  try {
    const result = await db
      .prepare(
        `
        INSERT INTO notebook_tags (notebook_id, tag_id, created_at)
        VALUES (?, ?, ?)
      `
      )
      .bind(notebookId, tagId, now)
      .run();

    return result.success;
  } catch (error) {
    // Handle unique constraint violation (tag already assigned)
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      return true; // Already assigned, consider it successful
    }
    throw error;
  }
}

// Remove tag from notebook
export async function removeTagFromNotebook(
  db: D1Database,
  notebookId: string,
  tagId: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `
        DELETE FROM notebook_tags
        WHERE notebook_id = ? AND tag_id = ?
      `
    )
    .bind(notebookId, tagId)
    .run();

  return result.meta.changes > 0;
}

// Get user's tags for a notebook
export async function getNotebookTags(
  db: D1Database,
  notebookId: string,
  userId: string
): Promise<TagRow[]> {
  const query = `
    SELECT t.id, t.name, t.color, t.user_id,
           strftime('%Y-%m-%dT%H:%M:%SZ', t.created_at) as created_at,
           strftime('%Y-%m-%dT%H:%M:%SZ', t.updated_at) as updated_at
    FROM tags t
    INNER JOIN notebook_tags nt ON t.id = nt.tag_id
    WHERE nt.notebook_id = ? AND t.user_id = ?
    ORDER BY t.name ASC
  `;

  const result = await db.prepare(query).bind(notebookId, userId).all<TagRow>();

  return result.results;
}

// Saved prompt-related functions

// Create or update saved prompt for user
export async function upsertSavedPrompt(
  db: D1Database,
  params: {
    user_id: string;
    prompt: string;
    ai_model?: string | null;
  }
): Promise<SavedPromptRow | null> {
  const { user_id, prompt, ai_model = null } = params;

  // First, try to get existing saved prompt for this user
  const existing = await db
    .prepare("SELECT id FROM saved_prompts WHERE user_id = ?")
    .bind(user_id)
    .first<{ id: string }>();

  if (existing) {
    // Update existing saved prompt
    const result = await db
      .prepare(
        `
        UPDATE saved_prompts
        SET prompt = ?, ai_model = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `
      )
      .bind(prompt, ai_model, user_id)
      .run();

    if (result.success) {
      // Return the updated saved prompt
      return await getSavedPrompt(db, user_id);
    }
    return null;
  } else {
    // Create new saved prompt
    const id = nanoid();
    const result = await db
      .prepare(
        `
        INSERT INTO saved_prompts (id, user_id, prompt, ai_model)
        VALUES (?, ?, ?, ?)
      `
      )
      .bind(id, user_id, prompt, ai_model)
      .run();

    if (result.success) {
      // Return the newly created saved prompt
      return await getSavedPrompt(db, user_id);
    }
    return null;
  }
}

// Get saved prompt for user
export async function getSavedPrompt(
  db: D1Database,
  user_id: string
): Promise<SavedPromptRow | null> {
  // Only return one saved prompt for the user for now
  const result = await db
    .prepare(
      `SELECT id, user_id, prompt, ai_model,
              strftime('%Y-%m-%dT%H:%M:%SZ', created_at) as created_at,
              strftime('%Y-%m-%dT%H:%M:%SZ', updated_at) as updated_at
              FROM saved_prompts WHERE user_id = ?`
    )
    .bind(user_id)
    .first<SavedPromptRow>();

  return result || null;
}

// Delete saved prompt for user
export async function deleteSavedPrompt(
  db: D1Database,
  user_id: string
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM saved_prompts WHERE user_id = ?")
    .bind(user_id)
    .run();

  return result.meta.changes > 0;
}
