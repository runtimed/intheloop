import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createFallbackUser,
  getPrivateUserById,
  getUserByEmail,
  getUsersByIds,
  toPublicFacingUser,
} from "../users/utils.ts";
import { createNotebookId } from "../utils/notebook-id.ts";
import {
  assignTagToNotebook,
  checkTagOwnership,
  createNotebook,
  createTag,
  deleteNotebook,
  deleteTag,
  getUserTags,
  getNotebookById,
  getNotebookOwner,
  getNotebooks,
  getNotebookTags,
  removeTagFromNotebook,
  updateNotebook,
  updateTag,
  getNotebookCollaborators,
  upsertSavedPrompt,
  getSavedPrompt,
  deleteSavedPrompt,
} from "./db.ts";
import { authedProcedure, publicProcedure, router } from "./trpc";
import { NotebookPermission, TagColor } from "./types.ts";
import { createProjectIfNeeded } from "backend/utils/projects-utils.ts";

// Create the tRPC router
export const appRouter = router({
  // Debug endpoint
  debug: publicProcedure.query(async () => {
    return "Hello, world!";
  }),

  // Context endpoint
  context: publicProcedure.query(async (opts) => {
    const { ctx } = opts;
    return ctx;
  }),

  // Get current user (private data)
  me: authedProcedure.query(async (opts) => {
    const { ctx } = opts;
    return ctx.user;
  }),

  // Get user by email (public data only)
  userByEmail: authedProcedure
    .input(z.object({ email: z.string() }))
    .query(async (opts) => {
      const { ctx, input } = opts;
      const { email } = input;

      try {
        const userRecord = await getUserByEmail(ctx.env.DB, email);
        if (userRecord) {
          return toPublicFacingUser(userRecord);
        }
        return null;
      } catch (error) {
        console.error("Failed to fetch user by email:", error);
        return null;
      }
    }),

  // Get notebooks with filtering
  notebooks: authedProcedure
    .input(
      z.object({
        owned: z.boolean().optional(),
        shared: z.boolean().optional(),
        limit: z.number().min(1).max(100).default(5000),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async (opts) => {
      try {
        const { ctx, input } = opts;
        const { owned, shared, limit, offset } = input;

        return await getNotebooks(ctx, {
          owned,
          shared,
          limit,
          offset,
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch notebooks: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Get single notebook
  notebook: authedProcedure
    .input(z.object({ id: z.string() }))
    .query(async (opts) => {
      const { ctx, input } = opts;
      const { id: nbId } = input;
      const {
        user,
        env: { DB },
        permissionsProvider,
      } = ctx;

      try {
        const permissionResult = await permissionsProvider.checkPermission(
          user.id,
          nbId
        );
        if (!permissionResult.hasAccess) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Notebook not found or access denied",
          });
        }

        const notebook = await getNotebookById(DB, nbId);

        const collaborators = await getNotebookCollaborators(DB, nbId);
        const tags = await getNotebookTags(DB, nbId, user.id);

        if (!notebook) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Notebook not found",
          });
        }

        return { ...notebook, collaborators, tags };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch notebook: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Create notebook
  createNotebook: authedProcedure
    .input(
      z.object({
        title: z.string(),
      })
    )
    .mutation(async (opts) => {
      const { ctx, input } = opts;
      const {
        user,
        env: { DB },
        bearerToken,
      } = ctx;

      try {
        const nbId = createNotebookId();
        let projectId: string | null = await createProjectIfNeeded(ctx.env, bearerToken || "");
        if (projectId) {
          console.log(`✅ Created project ${projectId} for notebook ${nbId}`);
        }

        const success = await createNotebook(DB, {
          id: nbId,
          ownerId: user.id,
          title: input.title,
          projectId: projectId,
        });

        if (!success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create notebook",
          });
        }

        const notebook = await getNotebookById(DB, nbId);

        return notebook;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create notebook: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Update notebook
  updateNotebook: authedProcedure
    .input(
      z.object({
        id: z.string(),
        input: z.object({
          title: z.string().optional(),
        }),
      })
    )
    .mutation(async (opts) => {
      const { ctx, input } = opts;
      const { id: nbId, input: updateInput } = input;
      const {
        user,
        env: { DB },
        permissionsProvider,
      } = ctx;

      try {
        const isOwner = await permissionsProvider.isOwner(user.id, nbId);
        if (!isOwner) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the owner can update notebook metadata",
          });
        }

        if (updateInput.title === undefined) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No updates provided",
          });
        }

        const success = await updateNotebook(DB, nbId, {
          title: updateInput.title,
        });

        if (!success) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Notebook not found or no changes made",
          });
        }

        // Return updated notebook
        const notebook = await getNotebookById(DB, nbId);

        return notebook;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update notebook: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Delete notebook
  deleteNotebook: authedProcedure
    .input(z.object({ nbId: z.string() }))
    .mutation(async (opts) => {
      const { ctx, input } = opts;
      const { nbId } = input;
      const {
        user,
        env: { DB },
        permissionsProvider,
      } = ctx;

      try {
        // Check if user is owner
        const isOwner = await permissionsProvider.isOwner(user.id, nbId);
        if (!isOwner) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the owner can delete a notebook",
          });
        }

        // Delete notebook (CASCADE will handle permissions)
        const success = await deleteNotebook(DB, nbId);

        if (!success) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Notebook not found",
          });
        }

        return true;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete notebook: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Share notebook
  shareNotebook: authedProcedure
    .input(
      z.object({
        nbId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async (opts) => {
      const { ctx, input } = opts;
      const { user, permissionsProvider } = ctx;

      try {
        await permissionsProvider.grantPermission({
          notebookId: input.nbId,
          userId: input.userId,
          grantedBy: user.id,
        });

        return true;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to share notebook: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Unshare notebook
  unshareNotebook: authedProcedure
    .input(
      z.object({
        nbId: z.string(),
        userId: z.string(),
      })
    )
    .mutation(async (opts) => {
      const { ctx, input } = opts;
      const { user, permissionsProvider } = ctx;

      try {
        await permissionsProvider.revokePermission({
          notebookId: input.nbId,
          userId: input.userId,
          revokedBy: user.id,
        });

        return true;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to unshare notebook: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Get notebook owner
  notebookOwner: authedProcedure
    .input(z.object({ nbId: z.string() }))
    .query(async (opts) => {
      const { ctx, input } = opts;
      const { nbId } = input;
      const {
        env: { DB },
      } = ctx;

      try {
        const owner = await getNotebookOwner(DB, nbId);

        if (!owner) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Notebook not found",
          });
        }

        return owner;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("Failed to fetch owner:", error);
        return null;
      }
    }),

  // Get notebook collaborators
  notebookCollaborators: authedProcedure
    .input(z.object({ nbId: z.string() }))
    .query(async (opts) => {
      const { ctx, input } = opts;
      const { nbId } = input;
      const {
        env: { DB },
        permissionsProvider,
      } = ctx;

      try {
        // Use the permissions provider to list all users with "writer" permission for this notebook
        const writers = (
          await permissionsProvider.listPermissions(nbId)
        ).filter((u) => u.level === "writer");

        if (writers.length === 0) {
          return [];
        }

        const userIds = writers.map((w) => w.userId);

        // Get user data for all writers
        const userMap = await getUsersByIds(DB, userIds);

        // Convert to public User objects
        return userIds.map((userId) => {
          const userRecord = userMap.get(userId);
          if (userRecord) {
            return toPublicFacingUser(userRecord);
          } else {
            return createFallbackUser(userId);
          }
        });
      } catch (error) {
        console.error("Failed to fetch collaborators:", error);
        return [];
      }
    }),

  // Get user's permission level for a notebook
  myNotebookPermission: authedProcedure
    .input(z.object({ nbId: z.string() }))
    .query(async (opts): Promise<NotebookPermission> => {
      const { ctx, input } = opts;
      const { nbId } = input;
      const { user, permissionsProvider } = ctx;

      try {
        const result = await permissionsProvider.checkPermission(user.id, nbId);
        if (!result.hasAccess) return "NONE";
        if (!result.level) return "NONE";
        return result.level?.toUpperCase() as Uppercase<typeof result.level>;
      } catch (error) {
        console.error("Failed to check permission:", error);
        return "NONE";
      }
    }),

  // Tag-related endpoints

  // Get all tags
  tags: authedProcedure.query(async (opts) => {
    const { ctx } = opts;
    const {
      env: { DB },
    } = ctx;
    const user_id = ctx.user.id;

    try {
      return await getUserTags(DB, user_id);
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to fetch tags: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }),

  // Create a new tag
  createTag: authedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(50),
        color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional(),
      })
    )
    .mutation(async (opts) => {
      const { ctx, input } = opts;
      const { name, color } = input;
      const {
        env: { DB },
      } = ctx;
      const user_id = ctx.user.id;

      try {
        const tag = await createTag(DB, {
          name,
          // we know it's a hex color because of the regex
          color: color as TagColor,
          user_id,
        });
        if (!tag) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Tag with this name already exists",
          });
        }
        return tag;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create tag: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Update tag name
  updateTag: authedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(50),
        color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional(),
      })
    )
    .mutation(async (opts) => {
      const { ctx, input } = opts;
      const { id, name, color } = input;
      const {
        env: { DB },
      } = ctx;
      const user_id = ctx.user.id;

      if (!user_id) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      try {
        // Check if user owns the tag
        const ownsTag = await checkTagOwnership(DB, id, user_id);
        if (!ownsTag) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only modify your own tags",
          });
        }

        const success = await updateTag(DB, id, {
          name,
          color: color as TagColor,
        });
        if (!success) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Tag with this name already exists",
          });
        }
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update tag: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Delete tag
  deleteTag: authedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async (opts) => {
      const { ctx, input } = opts;
      const { id } = input;
      const {
        env: { DB },
      } = ctx;
      const user_id = ctx.user.id;

      try {
        // Check if user owns the tag
        const ownsTag = await checkTagOwnership(DB, id, user_id);
        if (!ownsTag) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only delete your own tags",
          });
        }

        const success = await deleteTag(DB, id);
        if (!success) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Tag not found",
          });
        }
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete tag: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Get notebook tags
  notebookTags: authedProcedure
    .input(z.object({ nbId: z.string() }))
    .query(async (opts) => {
      const { ctx, input } = opts;
      const { nbId } = input;
      const {
        env: { DB },
        permissionsProvider,
      } = ctx;

      try {
        const permissionResult = await permissionsProvider.checkPermission(
          ctx.user.id,
          nbId
        );
        if (!permissionResult.hasAccess) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Notebook not found or access denied",
          });
        }

        return await getNotebookTags(DB, nbId, ctx.user.id);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch notebook tags: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Assign tag to notebook
  assignTagToNotebook: authedProcedure
    .input(z.object({ nbId: z.string(), tagId: z.string() }))
    .mutation(async (opts) => {
      const { ctx, input } = opts;
      const { nbId, tagId } = input;
      const {
        env: { DB },
        permissionsProvider,
      } = ctx;

      try {
        // Check if user has write access to the notebook
        const permissionResult = await permissionsProvider.checkPermission(
          ctx.user.id,
          nbId
        );
        if (!permissionResult.hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to modify this notebook",
          });
        }

        const success = await assignTagToNotebook(DB, nbId, tagId);
        return { success };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to assign tag: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Remove tag from notebook
  removeTagFromNotebook: authedProcedure
    .input(z.object({ nbId: z.string(), tagId: z.string() }))
    .mutation(async (opts) => {
      const { ctx, input } = opts;
      const { nbId, tagId } = input;
      const {
        env: { DB },
        permissionsProvider,
      } = ctx;

      try {
        // Check if user has write access to the notebook
        const permissionResult = await permissionsProvider.checkPermission(
          ctx.user.id,
          nbId
        );
        if (!permissionResult.hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have permission to modify this notebook",
          });
        }

        const success = await removeTagFromNotebook(DB, nbId, tagId);
        return { success };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to remove tag: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  // Saved prompt endpoints
  getSavedPrompt: authedProcedure.query(async (opts) => {
    const { ctx } = opts;
    const {
      user,
      env: { DB },
    } = ctx;

    try {
      const prompt = await getSavedPrompt(DB, user.id);
      return prompt;
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to get saved prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }),

  upsertSavedPrompt: authedProcedure
    .input(
      z.object({
        prompt: z.string(),
        ai_model: z.string().nullable().optional(),
      })
    )
    .mutation(async (opts) => {
      const { ctx, input } = opts;
      const {
        user,
        env: { DB },
      } = ctx;
      const { prompt, ai_model } = input;

      try {
        const result = await upsertSavedPrompt(DB, {
          user_id: user.id,
          prompt,
          ai_model,
        });

        if (!result) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update saved prompt",
          });
        }

        return result;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update saved prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),

  deleteSavedPrompt: authedProcedure.mutation(async (opts) => {
    const { ctx } = opts;
    const {
      user,
      env: { DB },
    } = ctx;

    try {
      const success = await deleteSavedPrompt(DB, user.id);
      return { success };
    } catch (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to delete saved prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }),

  // Legacy endpoint for backward compatibility
  user: authedProcedure.query(async (opts) => {
    const { ctx } = opts;
    const {
      user,
      env: { DB },
    } = ctx;

    console.log("🚨", { ctx });

    const userRecord = await getPrivateUserById(DB, user.id);
    return userRecord;
  }),
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;
