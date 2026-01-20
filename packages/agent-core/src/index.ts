// @runt/lib - Core library for building Anode runtime agents

export { RuntimeAgent } from "./runtime-agent.ts";
export { DEFAULT_CONFIG, RuntimeConfig } from "./config.ts";
export { logger, LogLevel, withQuietLogging } from "./logging.ts";
export type {
  AiModel,
  CancellationHandler,
  ExecutionContext,
  ExecutionHandler,
  ExecutionResult,
  ModelCapability,
  RawOutputData,
  RuntimeAgentEventHandlers,
  RuntimeAgentOptions,
  RuntimeCapabilities,
} from "./types.ts";

export type { LoggerConfig, LogLevelValue } from "./logging.ts";

// Artifact service client for submitting artifacts to anode
export {
  ArtifactClient,
  createArtifactClient,
  PngProcessor,
} from "./artifact-client.ts";
export {
  uploadArtifactViaProjects,
  type ProjectsArtifactUploadParams,
  type ProjectsArtifactUploadResult,
} from "./projects-artifacts.ts";

export type {
  ArtifactSubmissionOptions,
  ArtifactSubmissionResult,
} from "./types.ts";

// Store factory for creating LiveStore instances
export { createStorePromise } from "./store-factory.ts";
export type { CreateStoreConfig } from "./store-factory.ts";

// Sync payload types for LiveStore connections
export type {
  SyncPayload,
  RuntimeSyncPayload,
  UserSyncPayload,
  BaseSyncPayload,
} from "./sync-types.ts";
export {
  isRuntimeSyncPayload,
  isUserSyncPayload,
  createRuntimeSyncPayload,
  createUserSyncPayload,
} from "./sync-types.ts";
