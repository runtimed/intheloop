import { initTRPC, TRPCError } from "@trpc/server";
import { ValidatedUser } from "backend/auth";
import { Env } from "backend/types";
import { PermissionsProvider } from "backend/notebook-permissions/types";

export type TrcpContext = {
  env: Env;
  user: ValidatedUser | null;
  permissionsProvider: PermissionsProvider;
  bearerToken: string | null;
};

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
const t = initTRPC.context<TrcpContext>().create();

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(async function isAuthed(opts) {
  const { ctx } = opts;
  // `ctx.user` is nullable
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return opts.next({
    ctx: {
      // ✅ user value is known to be non-null now
      user: ctx.user,
    },
  });
});
