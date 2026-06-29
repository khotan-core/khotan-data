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
  InflowContext,
  OutflowContext,
  RelayContext,
  InflowWorkflow,
  OutflowWorkflow,
  RelayWorkflow,
  InflowConfig,
  OutflowConfig,
  RelayConfig,
  CatchConfig,
  WireConfig,
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
} from "./factory/types.js";

export {
  inflow,
  outflow,
  relay,
  catchEvent,
  wire,
  bindWorkflowPlug,
  khotanCache,
  khotanMappings,
  khotanRuntimeRegistry,
} from "./factory/types.js";
export type { NextJsRequest, NextJsRouteHandlers } from "./factory/runtime.js";
export type {
  WorkflowGetRunFn,
  WorkflowGetWritableFn,
  WorkflowRuntimeConfig,
  WorkflowStartFn,
} from "./factory/workflow.js";
export { deriveCliToken } from "./factory/cli-auth.js";
export { drizzleAdapter } from "./factory/drizzle-adapter.js";
export {
  configureWorkflowRuntime,
  __setWorkflowStartForTests,
  __setWorkflowGetRunForTests,
  __setWorkflowGetWritableForTests,
  sendUpdate,
} from "./factory/workflow.js";
export { khotan, toNextJsHandler } from "./factory/runtime.js";
export { slackNotifier } from "./factory/notifiers.js";
