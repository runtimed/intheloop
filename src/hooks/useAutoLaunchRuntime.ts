/**
 * Auto-Launch Runtime Hook
 *
 * Automatically launches a local runtime when execution is attempted
 * with no active runtime available. Provides seamless runtime management
 * for users who just want to execute cells without manual setup.
 */

import { useCallback, useState, useRef } from "react";
import { useRuntimeHealth } from "./useRuntimeHealth";
import { consoleLauncher } from "../runtime/console-launcher";
import { useStore } from "@livestore/react";
import { useAuthenticatedUser, useAuth } from "../auth";

export type AutoLaunchRuntimeType = "html" | "python";

export interface AutoLaunchConfig {
  /** Which runtime to auto-launch (default: "html") */
  runtimeType: AutoLaunchRuntimeType;
  /** Whether auto-launch is enabled (default: true) */
  enabled: boolean;
  /** Timeout for runtime startup in ms (default: 10000) */
  startupTimeoutMs: number;
}

export interface AutoLaunchStatus {
  isLaunching: boolean;
  lastLaunchAttempt: Date | null;
  lastLaunchSuccess: boolean;
  lastError: string | null;
  launchCount: number;
}

interface UseAutoLaunchRuntimeResult {
  /** Current auto-launch status */
  status: AutoLaunchStatus;
  /** Configuration */
  config: AutoLaunchConfig;
  /** Update configuration */
  updateConfig: (updates: Partial<AutoLaunchConfig>) => void;
  /** Ensure runtime is available, launching if needed */
  ensureRuntime: () => Promise<boolean>;
  /** Manually trigger runtime launch */
  launchRuntime: (type?: AutoLaunchRuntimeType) => Promise<boolean>;
  /** Reset error state */
  clearError: () => void;
}

const DEFAULT_CONFIG: AutoLaunchConfig = {
  runtimeType: "python",
  enabled: true,
  startupTimeoutMs: 10000,
};

export function useAutoLaunchRuntime(
  initialConfig: Partial<AutoLaunchConfig> = {}
): UseAutoLaunchRuntimeResult {
  const { store } = useStore();
  const { isAuthenticated, accessToken } = useAuth();
  const userId = useAuthenticatedUser();
  const { hasActiveRuntime } = useRuntimeHealth();

  // Configuration state
  const [config, setConfig] = useState<AutoLaunchConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });

  // Status tracking
  const [status, setStatus] = useState<AutoLaunchStatus>({
    isLaunching: false,
    lastLaunchAttempt: null,
    lastLaunchSuccess: false,
    lastError: null,
    launchCount: 0,
  });

  // Prevent multiple concurrent launches
  const launchInProgress = useRef(false);

  const updateConfig = useCallback((updates: Partial<AutoLaunchConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const clearError = useCallback(() => {
    setStatus((prev) => ({ ...prev, lastError: null }));
  }, []);

  const launchRuntime = useCallback(
    async (
      type: AutoLaunchRuntimeType = config.runtimeType
    ): Promise<boolean> => {
      // Prevent concurrent launches
      if (launchInProgress.current) {
        console.log("🚫 Runtime launch already in progress, skipping");
        return false;
      }

      if (!isAuthenticated || !userId) {
        const error = "Authentication required for runtime launch";
        setStatus((prev) => ({
          ...prev,
          lastError: error,
          lastLaunchSuccess: false,
        }));
        console.error("❌ Auto-launch failed: " + error);
        return false;
      }

      launchInProgress.current = true;

      setStatus((prev) => ({
        ...prev,
        isLaunching: true,
        lastLaunchAttempt: new Date(),
        lastError: null,
        launchCount: prev.launchCount + 1,
      }));

      try {
        console.log(`🚀 Auto-launching ${type} runtime...`);

        // Setup console launcher if not already configured
        consoleLauncher.setStore(store as any);
        consoleLauncher.setAuth(userId, accessToken);

        // Use existing store connection
        consoleLauncher.useExistingStore(store);

        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                `Runtime launch timed out after ${config.startupTimeoutMs}ms`
              )
            );
          }, config.startupTimeoutMs);
        });

        // Launch the appropriate runtime type
        const launchPromise =
          type === "python"
            ? consoleLauncher.launchPythonAgent()
            : consoleLauncher.launchHtmlAgent();

        // Race between launch and timeout
        const agent = await Promise.race([launchPromise, timeoutPromise]);

        console.log(`✅ Auto-launched ${type} runtime successfully!`);
        console.log(`   Runtime ID: ${agent.config.runtimeId}`);
        console.log(`   Session ID: ${agent.config.sessionId}`);

        setStatus((prev) => ({
          ...prev,
          isLaunching: false,
          lastLaunchSuccess: true,
          lastError: null,
        }));

        return true;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        console.error(`❌ Auto-launch ${type} runtime failed:`, error);

        setStatus((prev) => ({
          ...prev,
          isLaunching: false,
          lastLaunchSuccess: false,
          lastError: errorMessage,
        }));

        return false;
      } finally {
        launchInProgress.current = false;
      }
    },
    [
      config.runtimeType,
      config.startupTimeoutMs,
      isAuthenticated,
      userId,
      accessToken,
      store,
    ]
  );

  const ensureRuntime = useCallback(async (): Promise<boolean> => {
    // If auto-launch is disabled, don't launch
    if (!config.enabled) {
      return hasActiveRuntime;
    }

    // If we already have an active runtime, we're good
    if (hasActiveRuntime) {
      return true;
    }

    // If launch is already in progress, wait and return current runtime status
    if (launchInProgress.current) {
      console.log("⏳ Runtime launch in progress, waiting...");
      return hasActiveRuntime;
    }

    console.log("🔍 No active runtime detected, auto-launching...");
    return await launchRuntime();
  }, [config.enabled, hasActiveRuntime, launchRuntime]);

  return {
    status,
    config,
    updateConfig,
    ensureRuntime,
    launchRuntime,
    clearError,
  };
}
