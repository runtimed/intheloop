import { useQuery, useStore } from "@livestore/react";
import { queryDb, RUNTIME_SESSION_TIMEOUT_MS, events } from "@runtimed/schema";
import { RuntimeSessionData, tables } from "@runtimed/schema";
import { useCallback, useEffect } from "react";

export type RuntimeHealth =
  | "healthy"
  | "warning"
  | "connecting"
  | "disconnected"
  | "unknown";

export type RuntimeHealthState = {
  activeRuntime: RuntimeSessionData | undefined;
  hasActiveRuntime: boolean;
  runtimeHealth: RuntimeHealth;
  runtimeStatus: string;
  runningExecutions: any[];
  executionQueue: any[];
};

export function useActiveRuntime(): RuntimeSessionData | undefined {
  const runtimeSessions = useQuery(
    queryDb(tables.runtimeSessions.select().where({ isActive: true }))
  );

  return runtimeSessions.find(
    (session: RuntimeSessionData) =>
      session.status === "ready" || session.status === "busy"
  );
}

export const useRuntimeHealth = (): RuntimeHealthState => {
  const runtimeSessions = useQuery(
    queryDb(tables.runtimeSessions.select().where({ isActive: true }))
  );

  // Get execution queue for runtime health monitoring
  const executionQueue = useQuery(
    queryDb(tables.executionQueue.select().orderBy("id", "desc"))
  ) as any[];

  // Get running executions with SQL filtering for better performance
  const runningExecutions = useQuery(
    queryDb(
      tables.executionQueue
        .select()
        .where({
          status: { op: "IN", value: ["executing", "pending", "assigned"] },
        })
        .orderBy("id", "desc")
    )
  ) as any[];

  // Check runtime status with session expiry logic
  const getRuntimeHealth = useCallback(
    (session: RuntimeSessionData): RuntimeHealth => {
      const now = new Date();

      // Check session expiry first (most important for browser runtimes)
      if (session.lastRenewedAt) {
        const timeSinceRenewal =
          now.getTime() - session.lastRenewedAt.getTime();
        const toleranceMs = 15000; // 15s tolerance for clock skew/network delays
        const maxAllowedGap = RUNTIME_SESSION_TIMEOUT_MS + toleranceMs; // 45s total

        if (timeSinceRenewal > maxAllowedGap) {
          return "disconnected";
        }

        // Warning if getting close to expiry
        if (timeSinceRenewal > RUNTIME_SESSION_TIMEOUT_MS) {
          return "warning";
        }
      }

      // Alternative check using expiresAt if available
      if (session.expiresAt && now > session.expiresAt) {
        // Add small tolerance for clock skew
        const toleranceMs = 15000;
        if (now.getTime() - session.expiresAt.getTime() > toleranceMs) {
          return "disconnected";
        }
      }

      if (session.status === "starting") {
        // If session is starting, it's connecting
        return session.isActive ? "connecting" : "unknown";
      }
      if (!session.isActive) {
        return "disconnected";
      }
      // For active sessions, use status to determine health
      switch (session.status) {
        case "ready":
        case "busy":
          return "healthy";
        case "restarting":
          return "warning";
        case "terminated":
          return "disconnected";
        default:
          return "unknown";
      }
    },
    []
  );

  const activeRuntime = runtimeSessions.find(
    (session: RuntimeSessionData) =>
      session.status === "ready" || session.status === "busy"
  );

  const hasActiveRuntime = Boolean(
    activeRuntime &&
      ["healthy", "warning", "connecting"].includes(
        getRuntimeHealth(activeRuntime)
      )
  );

  const runtimeHealth = activeRuntime
    ? getRuntimeHealth(activeRuntime)
    : "disconnected";

  const runtimeStatus =
    activeRuntime?.status ||
    (runtimeSessions.length > 0 ? runtimeSessions[0].status : "disconnected");

  return {
    activeRuntime,
    hasActiveRuntime,
    runtimeHealth,
    runtimeStatus,
    runningExecutions,
    executionQueue,
  };
};

/**
 * Enhanced runtime health hook with automatic cleanup of expired sessions
 */
export const useRuntimeHealthWithCleanup = (): RuntimeHealthState => {
  const health = useRuntimeHealth();
  const { store } = useStore();

  // Get runtime sessions directly for cleanup logic
  const runtimeSessions = useQuery(
    queryDb(tables.runtimeSessions.select().where({ isActive: true }))
  );

  useEffect(() => {
    // Clean up expired sessions every 30 seconds
    const cleanup = setInterval(() => {
      const now = new Date();
      const toleranceMs = 15000; // 15s tolerance for clock skew

      runtimeSessions?.forEach((session: RuntimeSessionData) => {
        let shouldCleanup = false;

        // Check if session has expired using lastRenewedAt
        if (session.lastRenewedAt) {
          const timeSinceRenewal =
            now.getTime() - session.lastRenewedAt.getTime();
          const maxAllowedGap = RUNTIME_SESSION_TIMEOUT_MS + toleranceMs;

          if (timeSinceRenewal > maxAllowedGap) {
            shouldCleanup = true;
          }
        }

        // Alternative check using expiresAt
        if (session.expiresAt && now > session.expiresAt) {
          if (now.getTime() - session.expiresAt.getTime() > toleranceMs) {
            shouldCleanup = true;
          }
        }

        // Clean up expired but still active sessions
        if (shouldCleanup && session.isActive) {
          console.log(`🧹 Cleaning up expired session: ${session.sessionId}`);

          store.commit(
            events.runtimeSessionTerminated({
              sessionId: session.sessionId,
              reason: "timeout",
            })
          );
        }
      });
    }, 30000); // Every 30 seconds

    return () => clearInterval(cleanup);
  }, [runtimeSessions, store]);

  return health;
};
