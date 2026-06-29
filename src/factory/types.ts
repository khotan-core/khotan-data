// ---------------------------------------------------------------------------
// Public types — all exported interfaces and type aliases for the factory.
// ---------------------------------------------------------------------------

export type ResourceConnectField = string | [string, ...string[]];

export interface ResourcePlugParticipation {
  uniqueIdentifier: string;
}

export interface ResourceMappingRegistration {
  connectField: ResourceConnectField;
  plugs?: Record<string, ResourcePlugParticipation>;
}

export interface ResourceRegistration {
  name: string;
  description?: string;
  mapping: ResourceMappingRegistration;
}

export type FlowType = "inflow" | "outflow" | "relay" | "webhook";

export type KhotanRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";
export type KhotanTerminalRunStatus =
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export interface FlowRunResult {
  status?: KhotanTerminalRunStatus;
  extracted?: number;
  transformed?: number;
  created?: number;
  updated?: number;
  deleted?: number;
  failed?: number;
  skipped?: number;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface BoundPlug {
  get<T>(
    path: string,
    options?: {
      params?: Record<string, unknown>;
      headers?: Record<string, string>;
    },
  ): Promise<T>;
  post<T>(
    path: string,
    options?: { body?: unknown; headers?: Record<string, string> },
  ): Promise<T>;
  put<T>(
    path: string,
    options?: { body?: unknown; headers?: Record<string, string> },
  ): Promise<T>;
  patch<T>(
    path: string,
    options?: { body?: unknown; headers?: Record<string, string> },
  ): Promise<T>;
  delete<T>(
    path: string,
    options?: { body?: unknown; headers?: Record<string, string> },
  ): Promise<T>;
}

export interface BindablePlug {
  get<T>(
    path: string,
    options?: {
      params?: Record<string, unknown>;
      headers?: Record<string, string>;
      vars?: Record<string, string>;
      _setVars?: (updates: Record<string, string>) => Promise<void>;
    },
  ): Promise<T>;
  post<T>(
    path: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
      vars?: Record<string, string>;
      _setVars?: (updates: Record<string, string>) => Promise<void>;
    },
  ): Promise<T>;
  put<T>(
    path: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
      vars?: Record<string, string>;
      _setVars?: (updates: Record<string, string>) => Promise<void>;
    },
  ): Promise<T>;
  patch<T>(
    path: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
      vars?: Record<string, string>;
      _setVars?: (updates: Record<string, string>) => Promise<void>;
    },
  ): Promise<T>;
  delete<T>(
    path: string,
    options?: {
      body?: unknown;
      headers?: Record<string, string>;
      vars?: Record<string, string>;
      _setVars?: (updates: Record<string, string>) => Promise<void>;
    },
  ): Promise<T>;
}

/** How a run was triggered. Distinguishes inbound webhook runs and scheduled
 *  cron runs from manual/programmatic ones. */
export type RunSource = "scheduled" | "manual" | "webhook";

export interface FlowHookContext {
  flow: {
    id: string;
    name: string;
    plugName: string;
    type: FlowType;
    resource?: string | null;
    to?: string | null;
  };
  /** The active variant for the finished run. */
  variant: string;
}

/** Compact summary of a finished run, passed to variant lifecycle hooks. */
export interface RunSummary {
  id: string;
  status: KhotanTerminalRunStatus;
  variant: string;
  source: RunSource;
  durationMs: number;
  extracted: number;
  transformed: number;
  created: number;
  updated: number;
  deleted: number;
  failed: number;
  skipped: number;
  error: string | null;
}

/** Lifecycle hook invoked when a run reaches a terminal state. Receives the
 *  flow/variant context and a summary of the finished run. Hook errors are
 *  caught and logged — they never change the recorded run status. */
export type FlowHook = (
  ctx: FlowHookContext,
  run: RunSummary,
) => void | Promise<void>;

/** A named run mode for a flow. The variant name *is* the mode — flow code
 *  branches on `ctx.variant`. Each variant may carry its own `schedule` and
 *  terminal-state hooks. */
export interface FlowVariant {
  /** Optional cron schedule. Variants without a schedule are manual-only. */
  schedule?: string;
  /** Invoked when a run for this variant ends `failed` or `partial`. */
  onError?: FlowHook;
  /** Invoked when a run for this variant ends successfully. */
  onComplete?: FlowHook;
}

export interface FlowRunContext {
  plug: BoundPlug;
  flow: {
    id: string;
    name: string;
    plugName: string;
    type: FlowType;
    resource?: string | null;
    to?: string | null;
  };
  /** The active variant for this run. The variant name is the run mode — flow
   *  code branches on this (e.g. "default", "delta", "full", "healthcheck"). */
  variant: string;
  body?: unknown;
  vars: Record<string, string>;
  setVars(updates: Record<string, string>): Promise<void>;
  cache(cacheName: string): CacheInstance;
  /**
   * Explicitly finalize the current run using the same lifecycle write path as
   * returning a FlowRunResult. Prefer returning a FlowRunResult from flow code;
   * use this in inline run handlers only when returning a final result is not
   * practical.
   */
  finalize(result?: FlowRunResult): Promise<void>;
}

export interface FlowWorkflowContext {
  flow: {
    id: string;
    name: string;
    plugName: string;
    type: FlowType;
    resource?: string | null;
    to?: string | null;
  };
  /** The active variant for this run. The variant name is the run mode — flow
   *  code branches on this (e.g. "default", "delta", "full", "healthcheck"). */
  variant: string;
  body?: unknown;
  vars: Record<string, string>;
  plugVarsByName?: Record<string, Record<string, string>>;
  khotanRunId: string;
  khotanInstanceId: string;
}

export interface KhotanRunUpdate {
  type?: "progress" | "log" | "metric" | "error";
  message: string;
  progress?: number;
  extracted?: number;
  transformed?: number;
  created?: number;
  updated?: number;
  deleted?: number;
  failed?: number;
  metadata?: Record<string, unknown>;
}

export interface FlowRegistration {
  name: string;
  type: FlowType;
  /** Single cron schedule. Mutually exclusive with `variants`: a flow declares
   *  either a top-level `schedule` (implicit `default` variant) OR a `variants`
   *  map, never both. */
  schedule?: string;
  /** Named run modes for this flow. Each variant may carry its own `schedule`
   *  and lifecycle hooks. When omitted, the flow is normalized to a single
   *  `default` variant carrying the top-level `schedule`. */
  variants?: Record<string, FlowVariant>;
  resource?: string;
  to?: string;
  workflow?: (ctx: FlowWorkflowContext) => Promise<FlowRunResult | undefined>;
  run?: (ctx: FlowRunContext) => Promise<FlowRunResult | undefined>;
}

export interface WireSubscribeContext {
  plug: {
    get<T>(
      path: string,
      options?: {
        params?: Record<string, unknown>;
        headers?: Record<string, string>;
      },
    ): Promise<T>;
    post<T>(
      path: string,
      options?: { body?: unknown; headers?: Record<string, string> },
    ): Promise<T>;
    put<T>(
      path: string,
      options?: { body?: unknown; headers?: Record<string, string> },
    ): Promise<T>;
    patch<T>(
      path: string,
      options?: { body?: unknown; headers?: Record<string, string> },
    ): Promise<T>;
    delete<T>(
      path: string,
      options?: { headers?: Record<string, string> },
    ): Promise<T>;
  };
  callbackUrl: string;
  events: string[];
  wireVars: Record<string, string>;
  setWireVars(updates: Record<string, string>): Promise<void>;
}

export interface WireUnsubscribeContext {
  plug: {
    get<T>(
      path: string,
      options?: {
        params?: Record<string, unknown>;
        headers?: Record<string, string>;
      },
    ): Promise<T>;
    post<T>(
      path: string,
      options?: { body?: unknown; headers?: Record<string, string> },
    ): Promise<T>;
    put<T>(
      path: string,
      options?: { body?: unknown; headers?: Record<string, string> },
    ): Promise<T>;
    patch<T>(
      path: string,
      options?: { body?: unknown; headers?: Record<string, string> },
    ): Promise<T>;
    delete<T>(
      path: string,
      options?: { headers?: Record<string, string> },
    ): Promise<T>;
  };
  remoteId: string;
  wireVars: Record<string, string>;
  setWireVars(updates: Record<string, string>): Promise<void>;
}

export interface WireVerifyContext {
  headers: Record<string, string>;
  body: string;
  wireVars: Record<string, string>;
}

export interface WireRegistration {
  events: string[];
  onSubscribe(ctx: WireSubscribeContext): Promise<{ remoteId: string }>;
  onUnsubscribe(ctx: WireUnsubscribeContext): Promise<void>;
  onVerify?(ctx: WireVerifyContext): Promise<boolean>;
}

export interface CatchRegistration {
  type: "catch";
  name: string;
  events?: string[];
  workflow: (ctx: CatchWorkflowContext) => Promise<void>;
}

export interface PassRegistration {
  type: "pass";
  name: string;
  to: string;
  events?: string[];
  workflow: (ctx: PassWorkflowContext) => Promise<void>;
}

export type WebhookRegistration = CatchRegistration | PassRegistration;

export interface CacheScope {
  plug?: string;
  resource?: string;
  flow?: string;
}

export interface CacheRegistration {
  name: string;
  scope?: CacheScope;
  ttl?: string | number;
}

export interface CacheEntryRecord {
  id: string;
  cacheId: string;
  key: string;
  value: unknown;
  expiresAt: Date | null;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface CacheInstance {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<T>;
  delete(key: string): Promise<void>;
}

export interface CatchWorkflowContext {
  event: Record<string, unknown>;
  eventType: string;
  headers: Record<string, string>;
  khotanRunId: string;
  khotanInstanceId: string;
}

export interface PassWorkflowContext {
  event: Record<string, unknown>;
  eventType: string;
  headers: Record<string, string>;
  destVars: Record<string, string>;
  khotanRunId: string;
  khotanInstanceId: string;
}

export interface KhotanWorkflowContextRef {
  khotanInstanceId: string;
}

export interface KhotanWorkflowRuntimeHelpers {
  cache(cacheName: string): CacheInstance;
  listMappings: KhotanInstance["listMappings"];
  lookupMapping: KhotanInstance["lookupMapping"];
  upsertMapping: KhotanInstance["upsertMapping"];
  updateMapping: KhotanInstance["updateMapping"];
  deleteMapping: KhotanInstance["deleteMapping"];
}

export interface VarField {
  readonly key: string;
  label: string;
  type: "text" | "password" | "url";
  secret?: boolean;
  hidden?: boolean;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}

export interface PlugRegistration {
  name: string;
  plug: {
    baseUrl: string;
    authType: string;
    varFields?: readonly VarField[];
    endpoints?: Record<
      string,
      {
        method: string;
        path: string;
        description?: string;
        body?: { _def?: unknown; shape?: Record<string, unknown> };
        query?: { _def?: unknown; shape?: Record<string, unknown> };
        responses?: Record<
          number,
          { _def?: unknown; shape?: Record<string, unknown> }
        >;
      }
    >;
    get<T>(
      path: string,
      options?: {
        params?: Record<string, unknown>;
        headers?: Record<string, string>;
        vars?: Record<string, string>;
        _setVars?: (updates: Record<string, string>) => Promise<void>;
        _skipHooks?: boolean;
      },
    ): Promise<T>;
    post<T>(
      path: string,
      options?: {
        body?: unknown;
        headers?: Record<string, string>;
        vars?: Record<string, string>;
        _setVars?: (updates: Record<string, string>) => Promise<void>;
        _skipHooks?: boolean;
      },
    ): Promise<T>;
    put<T>(
      path: string,
      options?: {
        body?: unknown;
        headers?: Record<string, string>;
        vars?: Record<string, string>;
        _setVars?: (updates: Record<string, string>) => Promise<void>;
        _skipHooks?: boolean;
      },
    ): Promise<T>;
    patch<T>(
      path: string,
      options?: {
        body?: unknown;
        headers?: Record<string, string>;
        vars?: Record<string, string>;
        _setVars?: (updates: Record<string, string>) => Promise<void>;
        _skipHooks?: boolean;
      },
    ): Promise<T>;
    delete<T>(
      path: string,
      options?: {
        headers?: Record<string, string>;
        vars?: Record<string, string>;
        _setVars?: (updates: Record<string, string>) => Promise<void>;
        _skipHooks?: boolean;
      },
    ): Promise<T>;
  };
  vars?: VarField[];
  flows?: FlowRegistration[];
  endpoints?: Record<string, { method: string; path: string }>;
  wires?: WireRegistration[];
  webhooks?: WebhookRegistration[];
  catches?: CatchRegistration[];
  passes?: PassRegistration[];
}

export interface KhotanAdapter {
  upsertPlug(plug: {
    name: string;
    baseUrl: string;
    authType: string;
  }): Promise<{ id: string }>;
  upsertFlow(flow: {
    plugId: string;
    name: string;
    type: string;
    schedule?: string | null;
  }): Promise<{ id: string }>;
  listPlugs(): Promise<Record<string, unknown>[]>;
  getPlug(id: string): Promise<Record<string, unknown> | null>;
  getPlugFlows(plugId: string): Promise<Record<string, unknown>[]>;
  getFlow(flowId: string): Promise<Record<string, unknown> | null>;
  listFlows(): Promise<Record<string, unknown>[]>;
  getRun(runId: string): Promise<Record<string, unknown> | null>;
  listRuns(flowId: string): Promise<Record<string, unknown>[]>;
  listRunsPage(params: {
    limit: number;
    offset: number;
  }): Promise<{ items: Record<string, unknown>[]; hasMore: boolean }>;

  upsertResource(resource: {
    name: string;
    connectField: ResourceConnectField;
    description?: string | null;
  }): Promise<{ id: string }>;
  upsertCache(cache: {
    name: string;
    scope?: CacheScope | null;
    ttlSeconds?: number | null;
  }): Promise<{ id: string }>;
  getCacheByName(name: string): Promise<Record<string, unknown> | null>;
  getCacheEntry(
    cacheId: string,
    key: string,
  ): Promise<Record<string, unknown> | null>;
  upsertCacheEntry(entry: {
    cacheId: string;
    key: string;
    value: unknown;
    expiresAt?: Date | null;
  }): Promise<{ id: string; created: boolean }>;
  deleteCacheEntry(cacheId: string, key: string): Promise<void>;
  listResources(): Promise<Record<string, unknown>[]>;
  getResource(id: string): Promise<Record<string, unknown> | null>;
  getResourceFlows(resourceId: string): Promise<Record<string, unknown>[]>;

  upsertMapping(mapping: {
    id?: string;
    resourceId: string;
    connectValue: string;
    refs: Record<string, string>;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ id: string; created: boolean }>;
  getMapping(id: string): Promise<Record<string, unknown> | null>;
  listMappings(params: {
    resourceId: string;
    limit: number;
    offset: number;
    search?: string;
  }): Promise<{
    items: Record<string, unknown>[];
    hasMore: boolean;
    total: number;
  }>;
  deleteMapping(id: string): Promise<void>;
  lookupMapping(
    params:
      | {
          resourceId: string;
          connectValue: string;
        }
      | {
          resourceId: string;
          plugName: string;
          ref: string;
        },
  ): Promise<Record<string, unknown> | null>;

  updateFlowResourceId(flowId: string, resourceId: string): Promise<void>;
  togglePlugEnabled(plugId: string, enabled: boolean): Promise<void>;
  toggleFlowEnabled(flowId: string, enabled: boolean): Promise<void>;
  toggleWebhookHandlerEnabled(
    handlerId: string,
    enabled: boolean,
  ): Promise<void>;

  insertWire(wire: {
    plugId: string;
    remoteId: string;
    callbackUrl: string;
    eventTypes: string[];
  }): Promise<{ id: string }>;
  upsertWire(wire: { plugId: string }): Promise<{ id: string }>;
  getActiveWire(plugId: string): Promise<Record<string, unknown> | null>;
  getPlugWire(plugId: string): Promise<Record<string, unknown> | null>;
  getWire(wireId: string): Promise<Record<string, unknown> | null>;
  updateWireStatus(
    wireId: string,
    status: "active" | "disabled" | "pending",
  ): Promise<void>;
  updateWireDetails(
    wireId: string,
    details: {
      remoteId: string;
      callbackUrl: string;
      eventTypes: string[];
      status: "active";
    },
  ): Promise<void>;
  getWireMetadata(wireId: string): Promise<string | null>;
  updateWireMetadata(wireId: string, metadata: string): Promise<void>;
  getEncryptedVariables(plugId: string): Promise<string | null>;
  setEncryptedVariables(plugId: string, encrypted: string): Promise<void>;
  clearEncryptedVariables(plugId: string): Promise<void>;

  upsertWebhookHandler(handler: {
    wireId: string;
    name: string;
    type: "catch" | "pass";
    destinationPlugId?: string | null;
  }): Promise<{ id: string }>;
  listWebhookHandlers(wireId: string): Promise<Record<string, unknown>[]>;
  getLatestWebhookHandlerRun(
    handlerId: string,
  ): Promise<Record<string, unknown> | null>;

  insertRun(run: {
    flowId?: string | null;
    wireId?: string | null;
    webhookHandlerId?: string | null;
    workflowRunId?: string | null;
    variant: string;
    source: RunSource;
    status: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ id: string }>;
  updateRun(
    runId: string,
    updates: {
      status: KhotanRunStatus;
      workflowRunId?: string | null;
      completedAt?: Date;
      durationMs?: number;
      extracted?: number;
      transformed?: number;
      created?: number;
      updated?: number;
      deleted?: number;
      failed?: number;
      skipped?: number;
      error?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<void>;
  insertWebhookEvent(event: {
    wireId: string;
    webhookHandlerId: string;
    khotanRunId: string;
    eventType: string;
    payload: Record<string, unknown>;
    headers: Record<string, string>;
  }): Promise<{ id: string }>;
  listWebhookEventsPage(params: {
    limit: number;
    offset: number;
  }): Promise<{ items: Record<string, unknown>[]; hasMore: boolean }>;
  updateFlowLastRun(
    flowId: string,
    updates: {
      lastRunAt: Date;
      lastRunStatus: KhotanTerminalRunStatus;
    },
  ): Promise<void>;
}

/**
 * Authorize an incoming request to the khotan management API.
 *
 * Return `true` to allow the request, `false` to reject it with `401`.
 * The function receives the raw `Request`, so it composes directly with
 * session libraries such as better-auth:
 *
 * ```ts
 * authorize: async (request) => {
 *   const session = await auth.api.getSession({ headers: request.headers });
 *   return session?.user?.role === "admin";
 * }
 * ```
 *
 * Throwing is treated the same as returning `false`. A rejected request gets a
 * `401` whose JSON body includes `code: "authorize_rejected"` and a `hint`
 * describing the auth model (useful for programmatic callers).
 *
 * NOTE: `KHOTAN_SECRET` is an encryption key, NOT an HTTP credential. Sending it
 * as a `Bearer` token does not authenticate a request — only `authorize` (and
 * the dev-only `KhotanCLI` HMAC token used by the local CLI) can. To trigger a
 * flow from outside the app, either call `khotanData.flow(name).start()` from
 * server code, or send a credential your `authorize` hook accepts.
 *
 * The following routes are intentionally exempt and are NOT passed to
 * `authorize` (they have their own protection):
 * - Inbound webhooks (`POST .../webhook/:plug`) — verified per-plug via `onVerify`.
 * - The cron dispatcher (`.../cron`) — protected by `CRON_SECRET`.
 * - Debug routes (`.../debug...`) — gated by `KHOTAN_DEBUG` and disabled in production.
 */
export type KhotanAuthorize = (request: Request) => boolean | Promise<boolean>;

export interface KhotanConfig {
  adapter: KhotanAdapter;
  plugs: PlugRegistration[];
  resources?: ResourceRegistration[];
  caches?: CacheRegistration[];
  secret?: string;
  /**
   * Gate every management route (plugs, variables, flows, runs, wires,
   * mappings, caches, resources, webhook handlers/events) behind a custom
   * authorization check.
   *
   * Pass a function to gate requests behind your auth layer (e.g. better-auth),
   * or pass `false` to explicitly opt into publicly accessible management
   * routes. Omitting this field in production (`NODE_ENV=production`) will
   * throw — you must be explicit about your security posture. In development
   * the field defaults to `false` with a warning. See {@link KhotanAuthorize}.
   */
  authorize?: KhotanAuthorize | false;
}

export type KhotanHandler = (request: Request) => Promise<Response>;

export interface WireInstance {
  create(callbackUrl: string): Promise<Record<string, unknown>>;
  delete(wireId: string): Promise<void>;
  get(): Promise<Record<string, unknown> | null>;
}

export interface FlowStartOptions {
  /** Named variant selecting the run mode. Defaults to `default`. Exposed to
   *  flow code as `ctx.variant`. */
  variant?: string | undefined;
  /** @deprecated Use `variant`. Accepted as an alias for one minor release. */
  runType?: string;
  body?: unknown;
}

export interface FlowSelectorOptions {
  plugName?: string;
}

export interface FlowInstance {
  start(options?: FlowStartOptions): Promise<Record<string, unknown>>;
}

export interface KhotanInstance {
  handler: KhotanHandler;
  init(): Promise<void>;
  flow(flowNameOrId: string, options?: FlowSelectorOptions): FlowInstance;
  wire(plugName: string): WireInstance;
  cache(cacheName: string): CacheInstance;
  listMappings(params: {
    resourceId: string;
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<{
    items: Record<string, unknown>[];
    page: {
      limit: number;
      offset: number;
      hasMore: boolean;
      prevOffset: number;
      nextOffset: number;
      total: number;
    };
  }>;
  lookupMapping(
    params:
      | {
          resourceId: string;
          connectValue: string | string[];
        }
      | {
          resourceId: string;
          plugName: string;
          ref: string;
        },
  ): Promise<Record<string, unknown> | null>;
  upsertMapping(mapping: {
    resourceId: string;
    connectValue: string | string[];
    refs: Record<string, string>;
    metadata?: Record<string, unknown> | null;
  }): Promise<Record<string, unknown>>;
  updateMapping(
    id: string,
    mapping: {
      resourceId: string;
      connectValue: string | string[];
      refs: Record<string, string>;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<Record<string, unknown>>;
  deleteMapping(id: string): Promise<void>;
  getVars(plugName: string): Promise<Record<string, string>>;
  setVars(plugName: string, vars: Record<string, string>): Promise<void>;
  clearVars(plugName: string): Promise<void>;
  hasVars(plugName: string): Promise<boolean>;
  getVarFields(plugName: string): readonly VarField[];
  getPlug(plugName: string): PlugRegistration["plug"];
  /**
   * Remove this instance from the module-level runtime registry. Call when
   * tearing down in tests, HMR, or multi-instance scenarios to prevent
   * unbounded growth of the registry.
   */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Plug binding helpers
// ---------------------------------------------------------------------------

export function bindPlugWithVars(
  plug: BindablePlug,
  vars: Record<string, string>,
  setVars?: (updates: Record<string, string>) => Promise<void>,
): BoundPlug {
  const opts = (extra?: {
    body?: unknown;
    headers?: Record<string, string>;
    params?: Record<string, unknown>;
  }) => ({
    ...extra,
    vars,
    ...(setVars ? { _setVars: setVars } : {}),
  });

  return {
    get<T>(
      path: string,
      extra?: {
        params?: Record<string, unknown>;
        headers?: Record<string, string>;
      },
    ) {
      return plug.get<T>(path, opts(extra));
    },
    post<T>(
      path: string,
      extra?: { body?: unknown; headers?: Record<string, string> },
    ) {
      return plug.post<T>(path, opts(extra));
    },
    put<T>(
      path: string,
      extra?: { body?: unknown; headers?: Record<string, string> },
    ) {
      return plug.put<T>(path, opts(extra));
    },
    patch<T>(
      path: string,
      extra?: { body?: unknown; headers?: Record<string, string> },
    ) {
      return plug.patch<T>(path, opts(extra));
    },
    delete<T>(
      path: string,
      extra?: { body?: unknown; headers?: Record<string, string> },
    ) {
      return plug.delete<T>(path, opts(extra));
    },
  };
}

export function bindWorkflowPlug(
  plug: BindablePlug,
  ctx: FlowWorkflowContext,
  plugName = ctx.flow.plugName,
): BoundPlug {
  const vars =
    plugName === ctx.flow.plugName
      ? ctx.vars
      : (ctx.plugVarsByName?.[plugName] ?? {});

  if (plugName !== ctx.flow.plugName) {
    ctx.plugVarsByName ??= {};
    ctx.plugVarsByName[plugName] = vars;
  }

  return bindPlugWithVars(plug, vars, async (updates) => {
    Object.assign(vars, updates);
  });
}

// ---------------------------------------------------------------------------
// Runtime registry — module-level Map that khotanCache/khotanMappings use
// to find runtime helpers from workflow context.
// ---------------------------------------------------------------------------

export const khotanRuntimeRegistry = new Map<
  string,
  KhotanWorkflowRuntimeHelpers
>();

function getWorkflowRuntimeHelpers(
  ctx: KhotanWorkflowContextRef,
): KhotanWorkflowRuntimeHelpers {
  // Fast path: exact match on the serialized instance id.
  const helpers = khotanRuntimeRegistry.get(ctx.khotanInstanceId);
  if (helpers) {
    return helpers;
  }

  // Defense-in-depth: if exactly one instance is registered, it must be the one
  // the workflow context refers to (the id may differ across isolates if the
  // config identity changed). Resolve to it rather than throwing.
  if (khotanRuntimeRegistry.size === 1) {
    return khotanRuntimeRegistry.values().next().value!;
  }

  throw new Error(
    `Khotan runtime helpers for instance "${ctx.khotanInstanceId}" are not registered ` +
      `(${String(khotanRuntimeRegistry.size)} instance(s) registered, none matched)`,
  );
}

export function khotanCache(
  ctx: KhotanWorkflowContextRef,
  cacheName: string,
): CacheInstance {
  return getWorkflowRuntimeHelpers(ctx).cache(cacheName);
}

export function khotanMappings(ctx: KhotanWorkflowContextRef) {
  const helpers = getWorkflowRuntimeHelpers(ctx);
  return {
    list: helpers.listMappings,
    lookup: helpers.lookupMapping,
    upsert: helpers.upsertMapping,
    update: helpers.updateMapping,
    delete: helpers.deleteMapping,
  };
}
