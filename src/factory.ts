// ---------------------------------------------------------------------------
// Thin entry point — re-exports everything from the decomposed factory modules
// so that `import ... from "khotan-data/factory"` continues to work unchanged.
// ---------------------------------------------------------------------------

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
  RunSource,
  FlowHookContext,
  RunSummary,
  FlowHook,
  FlowVariant,
  FlowRegistration,
  WireSubscribeContext,
  WireUnsubscribeContext,
  WireVerifyContext,
  WireRenewContext,
  WireSubscribeResult,
  WireRenewResult,
  WireRegistration,
  WebhookEventSchema,
  WebhookEventFromSchema,
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
} from "./factory/types.js";

export {
  bindWorkflowPlug,
  khotanCache,
  khotanMappings,
  khotanRuntimeRegistry,
} from "./factory/types.js";
export type {
  WorkflowGetRunFn,
  WorkflowGetWritableFn,
  WorkflowRuntimeConfig,
  WorkflowStartFn,
} from "./factory/workflow.js";
export { deriveCliToken } from "./factory/cli-auth.js";
export { drizzleAdapter } from "./factory/drizzle-adapter.js";
export { verifyHmacSha256 } from "./factory/crypto.js";
export type { VerifyHmacSha256Options } from "./factory/crypto.js";
export {
  configureWorkflowRuntime,
  __setWorkflowStartForTests,
  __setWorkflowGetRunForTests,
  __setWorkflowGetWritableForTests,
  sendUpdate,
} from "./factory/workflow.js";
export { khotan, toNextJsHandler } from "./factory/runtime.js";
export { slackNotifier } from "./factory/notifiers.js";
