/**
 * LocalRuntimeAgent - Base class for local runtime agents
 *
 * Provides shared functionality for runtime agents that execute in the browser
 * and share the LiveStore instance with the UI. Handles common concerns like
 * configuration, lifecycle management, and soft shutdown.
 *
 * Specific runtime implementations (HTML, Pyodide) extend this class and
 * implement the execution-specific logic.
 */

import {
  RuntimeAgent,
  RuntimeConfig,
  type ExecutionHandler,
  type RuntimeCapabilities,
  type LoggerConfig,
} from "@runtimed/agent-core";
import type { Store } from "@runtimed/schema";
import { events } from "@runtimed/schema";

/**
 * Configuration for local runtime agents
 */
export interface LocalRuntimeConfig {
  /** LiveStore instance to use for synchronization */
  store: Store;
  /** Authentication token for API access */
  authToken: string;
  /** Notebook ID this agent will work with */
  notebookId: string;
  /** User ID for session identification */
  userId: string;
  /** Optional custom runtime ID (auto-generated if not provided) */
  runtimeId?: string;
  /** Optional sync URL (defaults to localhost:8787 for dev) */
  syncUrl?: string;
  /** Optional logger configuration */
  logging?: Partial<LoggerConfig>;
  /** Use Projects service for artifact uploads instead of legacy R2 flow */
  useProjectsArtifacts?: boolean;
}

/**
 * Status information for local runtime agents
 */
export interface LocalRuntimeStatus {
  running: boolean;
  runtimeId: string | null;
  sessionId: string | null;
  runtimeType: string;
}

/**
 * Abstract base class for local runtime agents
 *
 * Handles the common patterns for local runtime agents while allowing
 * subclasses to focus on execution-specific logic.
 */
export abstract class LocalRuntimeAgent {
  protected agent: RuntimeAgent | null = null;
  protected config: LocalRuntimeConfig;

  constructor(config: LocalRuntimeConfig) {
    this.config = config;
  }

  /**
   * Start the runtime agent
   */
  async start(): Promise<RuntimeAgent> {
    if (this.agent) {
      throw new Error(`${this.getRuntimeType()} agent is already running`);
    }

    const useProjectsArtifacts: boolean = this.config.useProjectsArtifacts ??
      (String(import.meta.env.VITE_USE_PROJECTS_ARTIFACTS || "") === "true");

    const runtimeConfig = new RuntimeConfig({
      runtimeId: this.config.runtimeId || this.generateRuntimeId(),
      runtimeType: this.getRuntimeType(),
      capabilities: this.getCapabilities(),
      syncUrl: this.config.syncUrl || "ws://localhost:8787",
      authToken: this.config.authToken,
      notebookId: this.config.notebookId,
      store: this.config.store,
      userId: this.config.userId,
      useProjectsArtifacts: useProjectsArtifacts,
    });

    this.agent = new RuntimeAgent(runtimeConfig, this.getCapabilities());

    // Register the execution handler from subclass
    this.agent.onExecution(this.createExecutionHandler());

    // Allow subclasses to perform additional setup
    await this.onBeforeStart?.(this.agent);

    // Start the agent
    await this.agent.start();

    // Set notebook metadata to indicate which runtime type is active
    this.agent.store.commit(
      events.notebookMetadataSet({
        key: "runtimeType",
        value: this.getRuntimeType(),
      })
    );

    this.agent.store.commit(
      events.notebookMetadataSet({
        key: "lastUsedRuntimeType",
        value: this.getRuntimeType(),
      })
    );

    this.agent.store.commit(
      events.notebookMetadataSet({
        key: "runtimeStartedAt",
        value: new Date().toISOString(),
      })
    );

    // Allow subclasses to perform post-start actions
    await this.onAfterStart?.(this.agent);

    console.log(
      `${this.getLogIcon()} ${this.getRuntimeType()} runtime agent started successfully!`
    );
    console.log(`   Runtime ID: ${runtimeConfig.runtimeId}`);
    console.log(`   Session ID: ${this.agent.config.sessionId}`);

    return this.agent;
  }

  /**
   * Stop the runtime agent with soft shutdown (preserves LiveStore)
   */
  async stop(): Promise<void> {
    if (!this.agent) {
      throw new Error(`${this.getRuntimeType()} agent is not running`);
    }

    await this.onBeforeStop?.(this.agent);
    await this.performSoftShutdown(this.agent);
    await this.onAfterStop?.();

    this.agent = null;

    console.log(
      `🛑 ${this.getRuntimeType()} runtime agent stopped (store preserved)`
    );
  }

  /**
   * Get the current runtime agent instance
   */
  getAgent(): RuntimeAgent | null {
    return this.agent;
  }

  /**
   * Check if the agent is currently running
   */
  isRunning(): boolean {
    return this.agent !== null;
  }

  /**
   * Get status information about the agent
   */
  getStatus(): LocalRuntimeStatus {
    if (!this.agent) {
      return {
        running: false,
        runtimeId: null,
        sessionId: null,
        runtimeType: this.getRuntimeType(),
      };
    }

    return {
      running: true,
      runtimeId: this.agent.config.runtimeId,
      sessionId: this.agent.config.sessionId,
      runtimeType: this.agent.config.runtimeType,
    };
  }

  /**
   * Generate a unique runtime ID based on the runtime type
   */
  protected generateRuntimeId(): string {
    return `${this.getRuntimeType()}-local-${crypto.randomUUID()}`;
  }

  /**
   * Get the log icon for this runtime type
   */
  protected getLogIcon(): string {
    // Subclasses can override for custom icons
    return "🔧";
  }

  /**
   * Soft shutdown that preserves the LiveStore instance
   * This is needed for local runtimes that share the store with the UI
   */
  protected async performSoftShutdown(agent: RuntimeAgent): Promise<void> {
    try {
      // Call onShutdown handler if present
      await agent.handlers?.onShutdown?.();

      // Unsubscribe from all reactive queries
      agent.subscriptions?.forEach((unsubscribe: () => void) => unsubscribe());
      agent.subscriptions = [];

      // Mark session as terminated
      try {
        const { events } = await import("@runtimed/schema");
        agent.store.commit(
          events.runtimeSessionTerminated({
            sessionId: agent.config.sessionId,
            reason: "shutdown",
          })
        );
      } catch (error) {
        console.warn("Failed to mark session as terminated:", error);
      }

      // Stop session renewal
      if (agent.renewalInterval) {
        clearInterval(agent.renewalInterval);
        agent.renewalInterval = undefined;
      }

      // Clean up shutdown handlers
      agent.cleanupShutdownHandlers?.();

      // Mark as shutting down
      agent.isShuttingDown = true;

      // NOTE: We deliberately do NOT call agent.store.shutdown()
      // because local runtimes share the store with the UI
    } catch (error) {
      console.error(
        `Error during ${this.getRuntimeType()} agent soft shutdown:`,
        error
      );
      throw error;
    }
  }

  // Abstract methods that subclasses must implement

  /**
   * Get the runtime type identifier (e.g., "html", "python")
   */
  protected abstract getRuntimeType(): string;

  /**
   * Get the capabilities this runtime supports
   */
  protected abstract getCapabilities(): RuntimeCapabilities;

  /**
   * Create the execution handler for this runtime
   */
  protected abstract createExecutionHandler(): ExecutionHandler;

  // Optional lifecycle hooks for subclasses

  /**
   * Called before the agent starts (after RuntimeAgent creation)
   */
  protected async onBeforeStart?(agent: RuntimeAgent): Promise<void>;

  /**
   * Called after the agent starts successfully
   */
  protected async onAfterStart?(agent: RuntimeAgent): Promise<void>;

  /**
   * Called before the agent stops
   */
  protected async onBeforeStop?(agent: RuntimeAgent): Promise<void>;

  /**
   * Called after the agent stops successfully
   */
  protected async onAfterStop?(): Promise<void>;
}

/**
 * Factory function type for creating local runtime agents
 */
export type LocalRuntimeFactory<T extends LocalRuntimeAgent> = (
  config: LocalRuntimeConfig
) => Promise<T>;

/**
 * Helper function to create and start a local runtime agent
 */
export async function createLocalRuntimeAgent<T extends LocalRuntimeAgent>(
  AgentClass: new (config: LocalRuntimeConfig) => T,
  config: LocalRuntimeConfig
): Promise<T> {
  const agent = new AgentClass(config);
  await agent.start();
  return agent;
}

/**
 * Type guard to check if an object is a LocalRuntimeAgent
 */
export function isLocalRuntimeAgent(obj: any): obj is LocalRuntimeAgent {
  return obj instanceof LocalRuntimeAgent;
}
