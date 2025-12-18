import { makeWorker } from "@livestore/adapter-web/worker";
import { makeCfSync } from "@livestore/sync-cf";

import { schema } from "@runtimed/schema";

function getLiveStoreUrl(): string {
  const syncUrl = import.meta.env.VITE_LIVESTORE_SYNC_URL;

  // If it's a relative path, construct the full WebSocket URL
  if (syncUrl.startsWith("/")) {
    // Validate that relative path ends with /livestore
    if (!syncUrl.endsWith("/livestore")) {
      throw new Error(
        `VITE_LIVESTORE_SYNC_URL must end with '/livestore', got: '${syncUrl}'`
      );
    }

    // In worker context, we need to use self.location instead of window.location
    const location =
      typeof window !== "undefined" ? window.location : self.location;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${location.host}${syncUrl}`;
  }

  // Otherwise use the provided full URL - validate it ends with /livestore
  try {
    const url = new URL(syncUrl);
    if (!url.pathname.endsWith("/livestore")) {
      throw new Error(
        `VITE_LIVESTORE_SYNC_URL must end with '/livestore', got pathname: '${url.pathname}'`
      );
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Invalid VITE_LIVESTORE_SYNC_URL format: '${syncUrl}'`);
    }
    throw error;
  }

  return syncUrl;
}

makeWorker({
  schema,
  sync: {
    backend: makeCfSync({ url: getLiveStoreUrl() }),
    initialSyncOptions: { _tag: "Blocking", timeout: 5000 },
    onSyncError: "shutdown",
  },
});
