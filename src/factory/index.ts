// ---------------------------------------------------------------------------
// Factory barrel — re-exports all public symbols from the decomposed modules.
// ---------------------------------------------------------------------------

// Types
export type {
  ResourceConnectField,
  ResourcePlugParticipation,
  ResourceMappingRegistration,
  ResourceRegistration,
  FlowType,
  KhotanRunStatus,
  KhotanTerminalRunStatus,
  FlowRunResult,
  BoundPlug,
  BindablePlug,
  FlowRunContext,
  FlowWorkflowContext,
  KhotanRunUpdate,
  FlowRegistration,
  WireSubscribeContext,
  WireUnsubscribeContext,
  WireVerifyContext,
  WireRegistration,
  CatchRegistration,
  PassRegistration,
  WebhookRegistration,
  CacheScope,
  CacheRegistration,
  CacheEntryRecord,
  CacheInstance,
  CatchWorkflowContext,
  PassWorkflowContext,
  KhotanWorkflowContextRef,
  KhotanWorkflowRuntimeHelpers,
  VarField,
  PlugRegistration,
  KhotanAdapter,
  KhotanAuthorize,
  KhotanConfig,
  KhotanHandler,
  WireInstance,
  FlowStartOptions,
  FlowSelectorOptions,
  FlowInstance,
  KhotanInstance,
} from "./types.js";

// Runtime helpers exported for workflow consumers
export { bindWorkflowPlug, khotanCache, khotanMappings } from "./types.js";

// CLI auth (deriveCliToken is used by the CLI package)
export { deriveCliToken } from "./cli-auth.js";

// Drizzle adapter
export { drizzleAdapter } from "./drizzle-adapter.js";

// Workflow test seams + sendUpdate
export {
  __setWorkflowStartForTests,
  __setWorkflowGetRunForTests,
  __setWorkflowGetWritableForTests,
  sendUpdate,
} from "./workflow.js";

// Core factory
export { khotan, toNextJsHandler } from "./runtime.js";
