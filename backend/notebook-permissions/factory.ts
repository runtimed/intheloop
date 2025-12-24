import { LocalPermissionsProvider } from "./local-permissions.ts";
import { NoPermissionsProvider } from "./no-permissions.ts";
import type { PermissionsProvider } from "./types.ts";
import { RuntError, ErrorType, type Env } from "../types.ts";
import { AnacondaPermissionsProvider } from "./anaconda-permissions.ts";
import { ProjectsClient } from "backend/clients/projects-client.ts";

// Re-export providers and types for convenience
export { LocalPermissionsProvider } from "./local-permissions.ts";
export { NoPermissionsProvider } from "./no-permissions.ts";
export type { PermissionsProvider } from "./types.ts";

/**
 * Factory function to create the appropriate permissions provider based on environment
 * @param projectsClient Optional ProjectsClient to reuse (for request-scoped clients)
 */
export function createPermissionsProvider(
  env: Env,
  bearerToken: string,
  projectsClient?: ProjectsClient
): PermissionsProvider {
  const serviceProvider = env.PERMISSIONS_PROVIDER?.toLowerCase();

  switch (serviceProvider) {
    case "anaconda":
      try {
        const client =
          projectsClient ||
          new ProjectsClient({
            baseUrl: env.ANACONDA_PROJECTS_URL,
            bearerToken: bearerToken,
          });
        return new AnacondaPermissionsProvider(client, env.DB);
      } catch (error) {
        throw new RuntError(ErrorType.ServerMisconfigured, {
          message: "Failed to initialize anaconda permissions provider",
          cause: error as Error,
        });
      }

    case "local":
      // Local development with D1 database
      try {
        return new LocalPermissionsProvider(env.DB);
      } catch (error) {
        throw new RuntError(ErrorType.ServerMisconfigured, {
          message: "Failed to initialize local permissions provider",
          cause: error as Error,
        });
      }

    case "none":
      // Explicitly disabled permissions (for introspection, testing, etc.)
      console.log("Using NoPermissionsProvider (explicitly disabled)");
      return new NoPermissionsProvider();

    case undefined:
    case "":
      // Unspecified service provider is an error - must be explicit
      throw new RuntError(ErrorType.ServerMisconfigured, {
        message:
          "SERVICE_PROVIDER must be explicitly set to 'local', 'anaconda', or 'none'",
      });

    default:
      // Unknown service provider - warn but provide no permissions for safety
      console.warn(
        `Unknown SERVICE_PROVIDER: ${serviceProvider}, using NoPermissionsProvider for safety`
      );
      return new NoPermissionsProvider();
  }
}

/**
 * Utility to check if we're using the Anaconda provider
 */
export function isUsingAnacondaProvider(env: Env): boolean {
  return env.SERVICE_PROVIDER?.toLowerCase() === "anaconda";
}

/**
 * Utility to check if we're using the local provider
 */
export function isUsingLocalProvider(env: Env): boolean {
  return !isUsingAnacondaProvider(env);
}

/**
 * Get provider name for logging/debugging
 */
export function getProviderName(env: Env): string {
  const serviceProvider = env.SERVICE_PROVIDER?.toLowerCase();

  switch (serviceProvider) {
    case "anaconda":
      return "anaconda";
    case "local":
      return "local";
    case "none":
      return "none";
    case undefined:
    case "":
      return "unspecified";
    default:
      return "unknown";
  }
}

/**
 * Validate provider configuration without creating provider instance
 */
export function validatePermissionsProviderConfig(env: Env): {
  valid: boolean;
  provider: string;
  errors: string[];
} {
  const provider = getProviderName(env);
  const errors: string[] = [];

  if (provider === "anaconda") {
    // TODO: Add anaconda-specific validation when implemented
    errors.push("Anaconda permissions provider not yet implemented");
  } else if (provider === "local") {
    // Local provider validation
    if (!env.DB) {
      errors.push("DB binding is required for local permissions provider");
    }
  } else if (provider === "none") {
    // NoPermissionsProvider - no validation needed
  } else if (provider === "unspecified") {
    errors.push("SERVICE_PROVIDER must be explicitly set");
  } else if (provider === "unknown") {
    errors.push(`Unknown SERVICE_PROVIDER: ${env.SERVICE_PROVIDER}`);
  }

  return {
    valid: errors.length === 0,
    provider,
    errors,
  };
}
