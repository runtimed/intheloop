/**
 * Console Runtime Launcher
 *
 * Simple utility for launching runtime agents via Chrome DevTools console.
 * No registry, no providers - just direct RuntimeAgent creation for experimentation.
 *
 * Usage in Chrome DevTools:
 *   window.__RUNT_LAUNCHER__.launchHtmlAgent()
 *   window.__RUNT_LAUNCHER__.getStatus()
 *   window.__RUNT_LAUNCHER__.shutdown()
 */

import {
  RuntimeAgent,
  createStorePromise,
  createRuntimeSyncPayload,
} from "@runtimed/agent-core";

import type { Store } from "@runtimed/schema";
import { sharedLiveStoreAdapter } from "../livestore/adapter.js";
import { HtmlRuntimeAgent } from "./html-agent.js";
import type { LocalRuntimeConfig } from "./LocalRuntimeAgent.js";
import { PyodideRuntimeAgent } from "@runtimed/pyodide-runtime";
import { LogLevel, type LogLevelValue } from "@runtimed/agent-core";

// Global interface for console access
declare global {
  interface Window {
    __RUNT_LAUNCHER__?: {
      launchHtmlAgent: () => Promise<RuntimeAgent>;
      launchPythonAgent: () => Promise<RuntimeAgent>;
      getStatus: () => LauncherStatus;
      shutdown: () => Promise<void>;
      getCurrentNotebookId: () => string | null;
      setStore: (store: Store) => void;
      setAuth: (userId: string, authToken: string) => void;
      useExistingStore: (store: any) => void;
      createNewStore: (notebookId: string) => Promise<Store>;
    };
  }
}

interface LauncherStatus {
  hasAgent: boolean;
  agentType: string | null;
  sessionId: string | null;
  notebookId: string | null;
  storeConnected: boolean;
  authConfigured: boolean;
  error: string | null;
  sessionRenewalActive: boolean;
  lastRenewal: string | null;
  nextRenewal: string | null;
}

class ConsoleLauncher {
  private currentAgent: RuntimeAgent | null = null;
  private currentHtmlAgent: HtmlRuntimeAgent | null = null;
  private currentPyodideAgent: PyodideRuntimeAgent | null = null;
  private store: Store | null = null;
  private existingStore: any = null;
  private userId: string | null = null;
  private authToken: string | null = null;
  private lastError: string | null = null;

  constructor() {
    console.log("🚀 Runt Console Launcher initialized");
    console.log("📖 Usage Guide:");
    console.log("  • Check status: window.__RUNT_LAUNCHER__.getStatus()");
    console.log(
      "  • Launch HTML agent: await window.__RUNT_LAUNCHER__.launchHtmlAgent()"
    );
    console.log(
      "  • Shutdown agent: await window.__RUNT_LAUNCHER__.shutdown()"
    );
    console.log("  • Debug auth: window.__RUNT_DEBUG__.debugAuth()");
    console.log(
      "💡 Navigate to a notebook page first, then try launching an agent!"
    );
  }

  setStore(store: Store): void {
    this.store = store;
    console.log("📦 LiveStore instance connected");
  }

  setAuth(userId: string, authToken: string): void {
    this.userId = userId;
    this.authToken = authToken;
    console.log("🔐 Authentication configured");
  }

  useExistingStore(store: any): void {
    this.existingStore = store;
    console.log("📦 Using existing LiveStore instance directly");
    console.log("🎯 Now try: await window.__RUNT_LAUNCHER__.launchHtmlAgent()");
  }

  get currentUserId(): string | null {
    return this.userId;
  }

  get currentAuthToken(): string | null {
    return this.authToken;
  }

  getCurrentNotebookId(): string | null {
    // Extract notebook ID from current URL path like /nb/{id}
    const pathParts = window.location.pathname.split("/");
    const notebookIndex = pathParts.findIndex((part) => part === "nb");

    console.log("🔍 URL Debug:", {
      pathname: window.location.pathname,
      pathParts,
      notebookIndex,
      candidateId: pathParts[notebookIndex + 1],
    });

    if (notebookIndex !== -1 && pathParts[notebookIndex + 1]) {
      const notebookId = pathParts[notebookIndex + 1];
      console.log(`📝 Found notebook ID: ${notebookId}`);
      return notebookId;
    }

    console.log("❌ No notebook ID found in URL");
    return null;
  }

  private validatePrerequisites(): {
    notebookId: string;
    store: Store;
    userId: string;
    authToken: string;
  } {
    const notebookId = this.getCurrentNotebookId();
    if (!notebookId) {
      throw new Error(
        "No notebook ID found in URL. Navigate to a notebook first."
      );
    }

    if (!this.store) {
      throw new Error(
        "No LiveStore instance. Call setStore(store) first or ensure you are in a notebook page."
      );
    }

    if (!this.userId || !this.authToken) {
      throw new Error(
        "No authentication configured. Call setAuth(userId, authToken) first."
      );
    }

    return {
      notebookId,
      store: this.store,
      userId: this.userId,
      authToken: this.authToken,
    };
  }

  async launchHtmlAgent(): Promise<RuntimeAgent> {
    try {
      this.lastError = null;

      // Shutdown existing agents
      if (this.currentHtmlAgent) {
        console.log("🔄 Shutting down existing HTML agent...");
        await this.currentHtmlAgent.stop();
        this.currentHtmlAgent = null;
      }
      if (this.currentAgent) {
        console.log("🔄 Shutting down existing agent...");
        await this.softShutdownAgent(this.currentAgent);
        this.currentAgent = null;
      }

      const { notebookId, userId, authToken } = this.validatePrerequisites();

      console.log(
        `🚀 Launching HTML runtime agent for notebook: ${notebookId}`
      );

      // Use existing store or create a new one
      let store: Store;
      if (this.existingStore) {
        console.log("🔄 Using existing store instance");
        store = this.existingStore;
      } else {
        console.log("🏗️ Creating new store instance");
        store = await this.createNewStore(notebookId, userId, authToken);
      }

      // Create HTML agent with new dedicated class
      const envValue = String(
        import.meta.env.VITE_USE_PROJECTS_ARTIFACTS || ""
      );
      const useProjectsArtifacts = envValue === "true";
      const htmlConfig: LocalRuntimeConfig = {
        store,
        authToken,
        notebookId,
        userId,
        syncUrl: "ws://localhost:8787",
        useProjectsArtifacts,
      };

      this.currentHtmlAgent = new HtmlRuntimeAgent(htmlConfig);

      const agent = await this.currentHtmlAgent.start();
      this.currentAgent = agent;

      console.log(`✅ HTML runtime agent started successfully!`);
      console.log(`   Runtime ID: ${agent.config.runtimeId}`);
      console.log(`   Session ID: ${agent.config.sessionId}`);
      console.log(`   Notebook ID: ${notebookId}`);

      return agent;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error("❌ Failed to launch HTML agent:", error);
      throw error;
    }
  }

  async launchPythonAgent(): Promise<RuntimeAgent> {
    try {
      this.lastError = null;

      // Shutdown existing agents
      if (this.currentPyodideAgent) {
        console.log("🔄 Shutting down existing Pyodide agent...");
        await this.currentPyodideAgent.stop();
        this.currentPyodideAgent = null;
      }
      if (this.currentHtmlAgent) {
        console.log("🔄 Shutting down existing HTML agent...");
        await this.currentHtmlAgent.stop();
        this.currentHtmlAgent = null;
      }
      if (this.currentAgent) {
        console.log("🔄 Shutting down existing agent...");
        await this.softShutdownAgent(this.currentAgent);
        this.currentAgent = null;
      }

      const { notebookId, userId, authToken } = this.validatePrerequisites();

      console.log(
        `🚀 Launching Pyodide runtime agent for notebook: ${notebookId}`
      );

      // Use existing store or create a new one
      let store: Store;
      if (this.existingStore) {
        console.log("🔄 Using existing store instance");
        store = this.existingStore;
      } else {
        console.log("🏗️ Creating new store instance");
        store = await this.createNewStore(notebookId, userId, authToken);
      }

      // Configure logging based on environment variable
      const getLogLevelFromEnv = (): LogLevelValue => {
        const envLevel = import.meta.env.VITE_RUNT_LOG_LEVEL?.toUpperCase();
        switch (envLevel) {
          case "DEBUG":
            return LogLevel.DEBUG;
          case "INFO":
            return LogLevel.INFO;
          case "WARN":
            return LogLevel.WARN;
          case "ERROR":
            return LogLevel.ERROR;
          default:
            return LogLevel.ERROR; // Default to ERROR (quiet)
        }
      };

      const logLevel = getLogLevelFromEnv();
      const enableConsoleLogging = logLevel <= LogLevel.INFO;

      // Create Pyodide agent with new dedicated class
      const envValue = String(
        import.meta.env.VITE_USE_PROJECTS_ARTIFACTS || ""
      );
      const useProjectsArtifacts = envValue === "true";
      const pyodideConfig: LocalRuntimeConfig = {
        store,
        authToken,
        notebookId,
        userId,
        syncUrl: "ws://localhost:8787",
        logging: {
          level: logLevel,
          console: enableConsoleLogging,
        },
        useProjectsArtifacts,
      };

      this.currentPyodideAgent = new PyodideRuntimeAgent(pyodideConfig);

      const agent = await this.currentPyodideAgent.start();
      this.currentAgent = agent;

      console.log(`✅ Pyodide runtime agent started successfully!`);
      console.log(`   Runtime ID: ${agent.config.runtimeId}`);
      console.log(`   Session ID: ${agent.config.sessionId}`);
      console.log(`   Notebook ID: ${notebookId}`);

      return agent;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error("❌ Failed to launch Pyodide agent:", error);
      throw error;
    }
  }

  getStatus(): LauncherStatus {
    const hasRenewalInterval =
      this.currentAgent && !!this.currentAgent.renewalInterval;

    return {
      hasAgent: !!this.currentAgent,
      agentType: this.currentAgent?.config.runtimeType || null,
      sessionId: this.currentAgent?.config.sessionId || null,
      notebookId: this.getCurrentNotebookId(),
      storeConnected: !!this.store,
      authConfigured: !!(this.userId && this.authToken),
      error: this.lastError,
      sessionRenewalActive: !!hasRenewalInterval,
      lastRenewal: this.currentAgent ? "Active (every 15s)" : null,
      nextRenewal: hasRenewalInterval ? "Within 15 seconds" : null,
    };
  }

  async createNewStore(
    notebookId: string,
    userId: string,
    authToken: string
  ): Promise<Store> {
    const runtimeId = `console-${crypto.randomUUID()}`;
    const sessionId = `${runtimeId}-${Date.now()}`;

    const syncPayload = createRuntimeSyncPayload({
      authToken,
      runtimeId,
      sessionId,
      userId,
    });

    return await createStorePromise({
      adapter: sharedLiveStoreAdapter,
      notebookId,
      syncPayload,
    });
  }

  async shutdown(): Promise<void> {
    if (this.currentPyodideAgent) {
      console.log("🛑 Shutting down Pyodide runtime agent...");
      await this.currentPyodideAgent.stop();
      this.currentPyodideAgent = null;
      this.currentAgent = null;
      console.log("✅ Pyodide runtime agent shut down (store preserved)");
    } else if (this.currentHtmlAgent) {
      console.log("🛑 Shutting down HTML runtime agent...");
      await this.currentHtmlAgent.stop();
      this.currentHtmlAgent = null;
      this.currentAgent = null;
      console.log("✅ HTML runtime agent shut down (store preserved)");
    } else if (this.currentAgent) {
      console.log("🛑 Shutting down runtime agent...");
      await this.softShutdownAgent(this.currentAgent);
      this.currentAgent = null;
      console.log("✅ Runtime agent shut down (store preserved)");
    } else {
      console.log("ℹ️ No active runtime agent to shutdown");
    }
  }

  /**
   * Soft shutdown that preserves the LiveStore instance
   * This is needed for local runtimes that share the store with the UI
   */
  private async softShutdownAgent(agent: RuntimeAgent): Promise<void> {
    try {
      // Call onShutdown handler if present
      await agent.handlers?.onShutdown?.();

      // Unsubscribe from all reactive queries
      const subscriptions = agent.subscriptions || [];
      subscriptions.forEach((unsubscribe: () => void) => unsubscribe());
      agent.subscriptions = [];

      // Mark session as terminated
      try {
        agent.store.commit(
          (await import("@runtimed/schema")).events.runtimeSessionTerminated({
            sessionId: agent.config.sessionId,
            reason: "shutdown",
          })
        );
      } catch (error) {
        console.warn("Failed to mark session as terminated:", error);
      }

      // Stop session renewal
      const renewalInterval = agent.renewalInterval;
      if (renewalInterval) {
        clearInterval(renewalInterval);
        agent.renewalInterval = undefined;
      }

      // Clean up shutdown handlers
      agent.cleanupShutdownHandlers?.();

      // Mark as shutting down
      agent.isShuttingDown = true;

      // NOTE: We deliberately do NOT call agent.store.shutdown()
      // because local runtimes share the store with the UI
    } catch (error) {
      console.error("Error during soft shutdown:", error);
    }
  }
}

// Create singleton instance and expose on window
const launcher = new ConsoleLauncher();

if (typeof window !== "undefined") {
  window.__RUNT_LAUNCHER__ = {
    launchHtmlAgent: () => launcher.launchHtmlAgent(),
    launchPythonAgent: () => launcher.launchPythonAgent(),
    getStatus: () => launcher.getStatus(),
    shutdown: () => launcher.shutdown(),
    getCurrentNotebookId: () => launcher.getCurrentNotebookId(),
    setStore: (store: Store) => launcher.setStore(store),
    setAuth: (userId: string, authToken: string) =>
      launcher.setAuth(userId, authToken),
    useExistingStore: (store: any) => launcher.useExistingStore(store),
    createNewStore: (notebookId: string) =>
      launcher.createNewStore(
        notebookId,
        launcher.currentUserId || "unknown",
        launcher.currentAuthToken || "unknown"
      ),
  };
}

export { launcher as consoleLauncher };
