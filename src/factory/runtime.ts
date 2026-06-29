import { kd } from "./debug.js";
import { process } from "./debug.js";
import { encryptVars, decryptVars } from "./crypto.js";
import { isCliRequestAuthorized } from "./cli-auth.js";
import {
  matchesCronSchedule,
  startOfUtcMinute,
  isCronRequestAuthorized,
  isDebugEnabled,
} from "./cron.js";
import { serializeEndpoints } from "./zod-introspect.js";
import {
  isPlainObject,
  validateConnectField,
  validateResourcePlugs,
  normalizeCacheScope,
  parseCacheTtlSeconds,
  validateCacheKey,
  coerceCacheEntryRecord,
  isCacheEntryExpired,
  canonicalizeConnectValue,
  deserializeConnectField,
  coerceDate,
  toFlowRunResult,
  getFlowRunCounters,
  resolveTerminalRunStatus,
  readEncryptedJson,
  normalizeFlowVariants,
  DEFAULT_VARIANT,
} from "./helpers.js";
import {
  importWorkflowStart,
  importWorkflowGetRun,
  getWorkflowRunId,
  getWorkflowReturnValue,
  getErrorMessage,
  isWorkflowCancelledError,
} from "./workflow.js";
import type {
  KhotanConfig,
  KhotanInstance,
  KhotanHandler,
  KhotanTerminalRunStatus,
  FlowRunResult,
  FlowStartOptions,
  FlowSelectorOptions,
  FlowInstance,
  WireInstance,
  CacheInstance,
  CacheEntryRecord,
  MappingInstance,
  CacheRegistration,
  ResourceRegistration,
  FlowRegistration,
  PlugRegistration,
  WebhookRegistration,
  CatchRegistration,
  PassRegistration,
  VarField,
  FlowVariant,
  FlowHook,
  FlowHookContext,
  RunSource,
  RunSummary,
} from "./types.js";
import { bindPlugWithVars, khotanRuntimeRegistry } from "./types.js";

// ---------------------------------------------------------------------------
// Route table types
// ---------------------------------------------------------------------------

type RouteAuth = "authorize" | "webhook" | "cron" | "debug" | "none";

interface RouteDefinition {
  method: string;
  pattern: string;
  auth: RouteAuth;
  handler: (ctx: RouteContext) => Promise<Response>;
}

interface RouteContext {
  request: Request;
  params: Record<string, string>;
  url: URL;
  searchParams: URLSearchParams;
}

interface RouteMatch {
  route: RouteDefinition;
  params: Record<string, string>;
}

function matchRoute(
  method: string,
  pathSegments: string[],
  routes: RouteDefinition[],
): RouteMatch | null {
  for (const route of routes) {
    if (route.method !== method && route.method !== "*") continue;

    const patternSegments = route.pattern.split("/").filter(Boolean);
    if (patternSegments.length !== pathSegments.length) continue;

    const params: Record<string, string> = {};
    let matched = true;

    for (let i = 0; i < patternSegments.length; i++) {
      const pat = patternSegments[i]!;
      const seg = pathSegments[i]!;

      if (pat.startsWith(":")) {
        params[pat.slice(1)] = decodeURIComponent(seg);
      } else if (pat !== seg) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return { route, params };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// waitUntil helper — uses Vercel's waitUntil when available, else fire-and-forget
// ---------------------------------------------------------------------------

type WaitUntilFn = (promise: Promise<unknown>) => void;

let _resolvedWaitUntil: WaitUntilFn | null = null;

function getWaitUntil(): WaitUntilFn {
  if (_resolvedWaitUntil) return _resolvedWaitUntil;
  _resolvedWaitUntil = (_promise: Promise<unknown>) => {
    // fire-and-forget fallback — the promise runs but the runtime may kill it
  };
  return _resolvedWaitUntil;
}

const _vercelFunctionsModule = "@vercel/functions";
const waitUntilReady: Promise<void> = (async () => {
  try {
    const mod = (await import(
      /* webpackIgnore: true */ _vercelFunctionsModule
    )) as { waitUntil?: WaitUntilFn };
    if (typeof mod.waitUntil === "function") {
      _resolvedWaitUntil = mod.waitUntil;
    }
  } catch {
    // Not available — fallback stays
  }
})();

// ---------------------------------------------------------------------------
// khotan factory
// ---------------------------------------------------------------------------

/**
 * Derive a deterministic instance id from the stable, serializable identity of a
 * config. Workflow steps run in a fresh isolate where the flow module is
 * re-imported and `khotan(config)` runs again; deriving the id from config
 * identity (rather than a per-process random uuid) ensures the re-imported module
 * lands on the same registry key so runtime helpers resolve across isolates.
 *
 * Only stable string identity is used (plug/flow/cache/resource names) — never
 * `adapter`/`authorize`/`secret`, which are non-serializable, per-process, or not
 * identity. Lists are sorted for order-independence. A tiny inline FNV-1a hash is
 * used instead of `node:crypto` so this works in any runtime with zero imports.
 */
function deriveInstanceId(config: KhotanConfig): string {
  const { plugs, resources = [], caches = [] } = config;
  const plugNames = plugs.map((p) => p.name).sort();
  const flowNames = plugs
    .flatMap((p) => (p.flows ?? []).map((f) => f.name))
    .sort();
  const cacheNames = caches.map((c) => c.name).sort();
  const resourceNames = resources.map((r) => r.name).sort();

  const identity = JSON.stringify({
    plugs: plugNames,
    flows: flowNames,
    caches: cacheNames,
    resources: resourceNames,
  });

  // If there is no identity at all (degenerate config with no names), fall back
  // to a random id so behavior is never worse than before.
  if (
    plugNames.length === 0 &&
    flowNames.length === 0 &&
    cacheNames.length === 0 &&
    resourceNames.length === 0
  ) {
    return crypto.randomUUID();
  }

  // FNV-1a 32-bit hash — pure, deterministic, no imports, runtime-agnostic.
  let hash = 0x811c9dc5;
  for (let i = 0; i < identity.length; i++) {
    hash ^= identity.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `cfg_${hex}`;
}

export function khotan(config: KhotanConfig): KhotanInstance {
  const { adapter, plugs, resources = [], caches = [], authorize } = config;
  const instanceId = deriveInstanceId(config);

  if (authorize === undefined) {
    if (process.env["NODE_ENV"] === "production") {
      throw new Error(
        "[khotan] `authorize` is required in production. Pass an authorization hook to gate " +
          "management routes, or pass `authorize: false` to explicitly opt into " +
          "publicly accessible management routes (not recommended).",
      );
    }
    console.warn(
      "[khotan] No `authorize` hook configured: the management API " +
        "(/api/khotan/*) is publicly accessible. Pass `authorize` to gate it " +
        "behind your auth layer (e.g. better-auth), or `authorize: false` to " +
        "silence this warning. This will throw in production.",
    );
  }
  const authorizeHook =
    authorize === undefined || authorize === false ? null : authorize;

  if (!(config.secret ?? process.env["KHOTAN_SECRET"])) {
    console.warn(
      "[khotan] No `secret`/`KHOTAN_SECRET` configured: plug credentials and " +
        "wire metadata will not be encrypted at rest. Set KHOTAN_SECRET to a " +
        "high-entropy value.",
    );
  }

  const plugNames = new Set<string>();
  for (const plug of plugs) {
    if (plugNames.has(plug.name)) {
      throw new Error(`Duplicate plug name: "${plug.name}"`);
    }
    plugNames.add(plug.name);
  }

  const resourceNames = new Set<string>();
  const resourceConfigByName = new Map<string, ResourceRegistration>();
  for (const resource of resources) {
    if (resourceNames.has(resource.name)) {
      throw new Error(`Duplicate resource name: "${resource.name}"`);
    }
    validateConnectField(resource.name, resource.mapping.connectField);
    validateResourcePlugs(resource, plugNames);
    resourceNames.add(resource.name);
    resourceConfigByName.set(resource.name, resource);
  }

  const registeredFlowNames = new Set<string>();
  // Normalized variant maps, keyed by `plugName\0flowName\0type`. Computed (and
  // validated) once at config time so triggering and dispatching can reuse them.
  const flowVariantsByKey = new Map<string, Record<string, FlowVariant>>();
  for (const plug of plugs) {
    if (!plug.flows) continue;
    for (const flow of plug.flows) {
      registeredFlowNames.add(flow.name);
      if (flow.resource && !resourceNames.has(flow.resource)) {
        throw new Error(
          `Flow "${flow.name}" references unknown resource: "${flow.resource}"`,
        );
      }
      // Throws at config time on invalid names or schedule/variants conflict.
      flowVariantsByKey.set(
        `${plug.name}\0${flow.name}\0${flow.type}`,
        normalizeFlowVariants(flow),
      );
    }
  }

  function getFlowVariants(
    plugName: string,
    flowName: string,
    flowType: string,
  ): Record<string, FlowVariant> {
    return (
      flowVariantsByKey.get(`${plugName}\0${flowName}\0${flowType}`) ?? {
        [DEFAULT_VARIANT]: {},
      }
    );
  }

  const cacheStateByName = new Map<
    string,
    { id: string; config: CacheRegistration; ttlSeconds: number | null }
  >();

  for (const cache of caches) {
    if (cacheStateByName.has(cache.name)) {
      throw new Error(`Duplicate cache name: "${cache.name}"`);
    }
    if (typeof cache.name !== "string" || !cache.name.trim()) {
      throw new Error("Cache registrations must declare a non-empty name");
    }

    const normalizedScope = normalizeCacheScope(cache.name, cache.scope);
    if (normalizedScope?.plug && !plugNames.has(normalizedScope.plug)) {
      throw new Error(
        `Cache "${cache.name}" references unknown plug: "${normalizedScope.plug}"`,
      );
    }
    if (
      normalizedScope?.resource &&
      !resourceNames.has(normalizedScope.resource)
    ) {
      throw new Error(
        `Cache "${cache.name}" references unknown resource: "${normalizedScope.resource}"`,
      );
    }
    if (
      normalizedScope?.flow &&
      !registeredFlowNames.has(normalizedScope.flow)
    ) {
      throw new Error(
        `Cache "${cache.name}" references unknown flow: "${normalizedScope.flow}"`,
      );
    }

    cacheStateByName.set(cache.name, {
      id: "",
      config: {
        ...cache,
        name: cache.name.trim(),
        ...(normalizedScope ? { scope: normalizedScope } : {}),
      },
      ttlSeconds: parseCacheTtlSeconds(cache.name, cache.ttl),
    });
  }

  const registeredFlowKeys = new Set(
    plugs.flatMap((plug) =>
      (plug.flows ?? []).map(
        (flow) => `${plug.name}\0${flow.name}\0${flow.type}`,
      ),
    ),
  );

  function isRegisteredFlowRecord(flow: Record<string, unknown>): boolean {
    return (
      typeof flow["plugName"] === "string" &&
      typeof flow["name"] === "string" &&
      typeof flow["type"] === "string" &&
      registeredFlowKeys.has(
        `${flow["plugName"]}\0${flow["name"]}\0${flow["type"]}`,
      )
    );
  }

  function getRegisteredFlowConfig(
    flow: Record<string, unknown>,
  ): FlowRegistration | null {
    const plugName = flow["plugName"];
    const flowName = flow["name"];
    const flowType = flow["type"];
    if (
      typeof plugName !== "string" ||
      typeof flowName !== "string" ||
      typeof flowType !== "string"
    ) {
      return null;
    }

    const plug = plugs.find((candidate) => candidate.name === plugName);
    return (
      plug?.flows?.find(
        (candidate) =>
          candidate.name === flowName && candidate.type === flowType,
      ) ?? null
    );
  }

  function enrichRegisteredFlowRecord(
    flow: Record<string, unknown>,
    plugRows: Record<string, unknown>[],
  ): Record<string, unknown> {
    const flowConfig = getRegisteredFlowConfig(flow);
    const to = flowConfig?.to ?? null;
    const destinationPlug =
      typeof to === "string"
        ? (plugRows.find((plug) => plug["name"] === to) ?? null)
        : null;

    return {
      ...flow,
      to,
      destinationPlugId: destinationPlug?.["id"] ?? null,
      destinationPlugName: destinationPlug?.["name"] ?? to,
    };
  }

  async function listRegisteredFlowRecords(
    plugRows?: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const [flows, allPlugRows] = await Promise.all([
      adapter.listFlows(),
      plugRows ? Promise.resolve(plugRows) : adapter.listPlugs(),
    ]);

    return flows
      .filter((flow) => isRegisteredFlowRecord(flow))
      .map((flow) => enrichRegisteredFlowRecord(flow, allPlugRows));
  }

  function isFlowAssociatedWithPlug(
    flow: Record<string, unknown>,
    plugId: string,
  ): boolean {
    if (flow["plugId"] === plugId) return true;
    return flow["type"] === "relay" && flow["destinationPlugId"] === plugId;
  }

  function countAssociatedFlows(
    flows: Record<string, unknown>[],
    plugId: string,
  ): number {
    const flowIds = new Set<string>();
    for (const flow of flows) {
      if (!isFlowAssociatedWithPlug(flow, plugId)) continue;
      const flowId = flow["id"];
      if (typeof flowId === "string") flowIds.add(flowId);
    }
    return flowIds.size;
  }

  function getWebhookHandlersForPlug(
    plug: PlugRegistration,
  ): WebhookRegistration[] {
    const handlers: WebhookRegistration[] = [];
    if (plug.webhooks) handlers.push(...plug.webhooks);
    if (plug.catches) handlers.push(...plug.catches);
    if (plug.passes) handlers.push(...plug.passes);
    return handlers;
  }

  for (const plug of plugs) {
    const webhookHandlers = getWebhookHandlersForPlug(plug);
    if (webhookHandlers.length > 0) {
      const wireConfig = plug.wires?.[0];
      if (!wireConfig?.onVerify) {
        throw new Error(
          `Plug "${plug.name}" has webhook handlers but its wire does not define onVerify. ` +
            `onVerify is required for webhook processing.`,
        );
      }
    }
    for (const handler of webhookHandlers) {
      if (handler.type === "pass") {
        if (!plugNames.has(handler.to)) {
          throw new Error(
            `Pass on plug "${plug.name}" references unknown destination plug: "${handler.to}"`,
          );
        }
      }
    }
  }

  let initialized = false;
  let initPromise: Promise<void> | null = null;
  const resourceIdByName = new Map<string, string>();
  const resourceConfigById = new Map<string, ResourceRegistration>();

  const secret = config.secret ?? process.env["KHOTAN_SECRET"] ?? "";

  async function doInit(): Promise<void> {
    if (initialized) return;
    await waitUntilReady;

    resourceIdByName.clear();
    resourceConfigById.clear();
    for (const resource of resources) {
      const { id } = await adapter.upsertResource({
        name: resource.name,
        connectField: resource.mapping.connectField,
        description: resource.description ?? null,
      });
      resourceIdByName.set(resource.name, id);
      resourceConfigById.set(id, resource);
    }

    for (const [cacheName, cacheState] of cacheStateByName) {
      const { id } = await adapter.upsertCache({
        name: cacheName,
        scope: cacheState.config.scope ?? null,
        ttlSeconds: cacheState.ttlSeconds,
      });
      cacheStateByName.set(cacheName, {
        ...cacheState,
        id,
      });
    }

    for (const plug of plugs) {
      const { id: plugId } = await adapter.upsertPlug({
        name: plug.name,
        baseUrl: plug.plug.baseUrl,
        authType: plug.plug.authType,
      });

      await seedDefaultVarsForPlug(plugId, plug.name);

      if (plug.flows) {
        for (const flow of plug.flows) {
          const { id: flowId } = await adapter.upsertFlow({
            plugId,
            name: flow.name,
            type: flow.type,
            schedule: flow.schedule ?? null,
          });

          if (flow.resource) {
            const resourceId = resourceIdByName.get(flow.resource)!;
            await adapter.updateFlowResourceId(flowId, resourceId);
          }
        }
      }

      if (plug.wires) {
        for (const _wire of plug.wires) {
          const { id: wireId } = await adapter.upsertWire({ plugId });
          const webhookHandlers = getWebhookHandlersForPlug(plug);
          for (const handler of webhookHandlers) {
            if (handler.type === "catch") {
              await adapter.upsertWebhookHandler({
                wireId,
                name: handler.name,
                type: "catch",
              });
              continue;
            }

            const destPlugRow = await adapter
              .listPlugs()
              .then((all) => all.find((row) => row["name"] === handler.to));
            await adapter.upsertWebhookHandler({
              wireId,
              name: handler.name,
              type: "pass",
              destinationPlugId: destPlugRow
                ? (destPlugRow["id"] as string)
                : null,
            });
          }
        }
      }
    }

    initialized = true;
  }

  async function init(): Promise<void> {
    initPromise ??= doInit();
    return initPromise;
  }

  // -------------------------------------------------------------------------
  // Var management
  // -------------------------------------------------------------------------

  async function resolvePlugId(plugName: string): Promise<string> {
    await init();
    const allPlugs = await adapter.listPlugs();
    const dbPlug = allPlugs.find((p) => p["name"] === plugName);
    if (!dbPlug) {
      throw new Error(`Plug "${plugName}" not found in database`);
    }
    return dbPlug["id"] as string;
  }

  function getDefaultVars(plugName: string): Record<string, string> {
    const defaults: Record<string, string> = {};
    for (const field of getVarFields(plugName)) {
      if (field.defaultValue !== undefined) {
        defaults[field.key] = field.defaultValue;
      }
    }
    return defaults;
  }

  async function getStoredVarsByPlugId(
    plugId: string,
  ): Promise<Record<string, string>> {
    if (!secret) {
      throw new Error("KHOTAN_SECRET is required for var operations");
    }
    const encrypted = await adapter.getEncryptedVariables(plugId);
    if (!encrypted) return {};
    const json = await decryptVars(encrypted, secret);
    return JSON.parse(json) as Record<string, string>;
  }

  async function setVarsByPlugId(
    plugId: string,
    vars: Record<string, string>,
  ): Promise<void> {
    if (!secret) {
      throw new Error("KHOTAN_SECRET is required for var operations");
    }
    const json = JSON.stringify(vars);
    const encrypted = await encryptVars(json, secret);
    await adapter.setEncryptedVariables(plugId, encrypted);
  }

  async function seedDefaultVarsForPlug(
    plugId: string,
    plugName: string,
  ): Promise<void> {
    const defaults = getDefaultVars(plugName);
    if (!secret || Object.keys(defaults).length === 0) {
      return;
    }

    const storedVars: Record<string, string> = await getStoredVarsByPlugId(
      plugId,
    ).catch(() => ({}));
    const seededVars = { ...defaults, ...storedVars };
    const hasChanges = Object.keys(seededVars).some(
      (key) => seededVars[key] !== storedVars[key],
    );

    if (hasChanges) {
      await setVarsByPlugId(plugId, seededVars);
    }
  }

  async function getVars(plugName: string): Promise<Record<string, string>> {
    const plugId = await resolvePlugId(plugName);
    const defaults = getDefaultVars(plugName);
    const stored = await getStoredVarsByPlugId(plugId);
    return { ...defaults, ...stored };
  }

  async function setVars(
    plugName: string,
    vars: Record<string, string>,
  ): Promise<void> {
    const plugId = await resolvePlugId(plugName);
    await setVarsByPlugId(plugId, vars);
  }

  async function clearVars(plugName: string): Promise<void> {
    const plugId = await resolvePlugId(plugName);
    await adapter.clearEncryptedVariables(plugId);
  }

  async function hasVars(plugName: string): Promise<boolean> {
    const plugId = await resolvePlugId(plugName);
    const encrypted = await adapter.getEncryptedVariables(plugId);
    return encrypted !== null && encrypted !== "";
  }

  function getVarFields(plugName: string): readonly VarField[] {
    const plugReg = plugs.find((p) => p.name === plugName);
    if (!plugReg) {
      throw new Error(`Plug "${plugName}" not registered`);
    }
    return plugReg.vars ?? plugReg.plug.varFields ?? [];
  }

  function maskVars(
    plugName: string,
    vars: Record<string, string>,
  ): Record<string, string> {
    const fields = getVarFields(plugName);
    return Object.fromEntries(
      Object.entries(vars).map(([key, value]) => {
        const field = fields.find((f) => f.key === key);
        if (field?.secret) {
          return [key, value ? "••••••••" : ""];
        }
        return [key, value];
      }),
    );
  }

  function getPlug(plugName: string): PlugRegistration["plug"] {
    const plugReg = plugs.find((p) => p.name === plugName);
    if (!plugReg) {
      throw new Error(`Plug "${plugName}" not registered`);
    }
    return plugReg.plug;
  }

  // -------------------------------------------------------------------------
  // Resource/mapping helpers
  // -------------------------------------------------------------------------

  async function getRegisteredResourceById(
    resourceId: string,
  ): Promise<ResourceRegistration | null> {
    await init();
    return resourceConfigById.get(resourceId) ?? null;
  }

  async function resolveResourceId(resourceName: string): Promise<string> {
    await init();
    const resourceId = resourceIdByName.get(resourceName);
    if (!resourceId) {
      throw new Error(`Resource "${resourceName}" is not registered`);
    }
    return resourceId;
  }

  async function getRegisteredResourceByName(
    resourceName: string,
  ): Promise<{ id: string; resource: ResourceRegistration }> {
    const id = await resolveResourceId(resourceName);
    const resource = resourceConfigById.get(id);
    if (!resource) {
      throw new Error(`Resource "${resourceName}" is not registered`);
    }
    return { id, resource };
  }

  async function resolveCacheState(cacheName: string) {
    await init();
    const cacheState = cacheStateByName.get(cacheName);
    if (!cacheState?.id) {
      throw new Error(`Cache "${cacheName}" is not registered`);
    }
    return cacheState;
  }

  function createCacheInstance(cacheName: string): CacheInstance {
    return {
      async get<T = unknown>(key: string): Promise<T | null> {
        const entry = await readCacheEntry(cacheName, key);
        return entry ? (entry.value as T) : null;
      },
      async set<T = unknown>(key: string, value: T): Promise<T> {
        validateCacheKey(key);
        const cacheState = await resolveCacheState(cacheName);
        const expiresAt =
          cacheState.ttlSeconds !== null
            ? new Date(Date.now() + cacheState.ttlSeconds * 1_000)
            : null;
        await adapter.upsertCacheEntry({
          cacheId: cacheState.id,
          key,
          value,
          expiresAt,
        });
        return value;
      },
      async delete(key: string): Promise<void> {
        validateCacheKey(key);
        const cacheState = await resolveCacheState(cacheName);
        await adapter.deleteCacheEntry(cacheState.id, key);
      },
    };
  }

  async function readCacheEntry(
    cacheName: string,
    key: string,
  ): Promise<CacheEntryRecord | null> {
    validateCacheKey(key);
    const cacheState = await resolveCacheState(cacheName);
    const row = await adapter.getCacheEntry(cacheState.id, key);
    if (!row) {
      return null;
    }
    const entry = coerceCacheEntryRecord(row);
    if (!entry || isCacheEntryExpired(entry)) {
      return null;
    }
    return entry;
  }

  function decorateResourceRecord(
    resource: Record<string, unknown>,
  ): Record<string, unknown> {
    const { connectField: storedConnectField, ...rest } = resource;
    const configResource =
      typeof resource["name"] === "string"
        ? resourceConfigByName.get(resource["name"])
        : undefined;

    return {
      ...rest,
      mapping: {
        connectField:
          configResource?.mapping.connectField ??
          deserializeConnectField(storedConnectField),
        ...(configResource?.mapping.plugs
          ? { plugs: configResource.mapping.plugs }
          : {}),
      },
    };
  }

  function buildMappingPage(params: {
    limit: number;
    offset: number;
    hasMore: boolean;
    total: number;
    items: Record<string, unknown>[];
  }) {
    return {
      items: params.items,
      page: {
        limit: params.limit,
        offset: params.offset,
        hasMore: params.hasMore,
        prevOffset: Math.max(params.offset - params.limit, 0),
        nextOffset: params.offset + params.limit,
        total: params.total,
      },
    };
  }

  async function validateMappingPayload(params: {
    resourceId: string;
    refs: Record<string, string>;
    metadata?: Record<string, unknown> | null;
  }): Promise<ResourceRegistration> {
    if (!isPlainObject(params.refs)) {
      throw new Error("Mapping refs must be an object keyed by plug name");
    }

    for (const [plugName, ref] of Object.entries(params.refs)) {
      if (typeof ref !== "string") {
        throw new Error(`Mapping ref "${plugName}" must be a string`);
      }
    }

    if (params.metadata !== undefined && params.metadata !== null) {
      if (!isPlainObject(params.metadata)) {
        throw new Error("Mapping metadata must be an object when provided");
      }
    }

    const resource = await getRegisteredResourceById(params.resourceId);
    if (!resource) {
      throw new Error(`Resource "${params.resourceId}" is not registered`);
    }

    if (resource.mapping.plugs) {
      const invalidPlugs = Object.keys(params.refs).filter(
        (plugName) => !resource.mapping.plugs?.[plugName],
      );
      if (invalidPlugs.length > 0) {
        throw new Error(
          `Resource "${resource.name}" only allows refs for declared plugs. Invalid refs: ${invalidPlugs.join(", ")}`,
        );
      }
    }

    return resource;
  }

  async function listMappings(params: {
    resourceId: string;
    limit?: number;
    offset?: number;
    search?: string;
  }) {
    const resource = await getRegisteredResourceById(params.resourceId);
    if (!resource) {
      throw new Error(`Resource "${params.resourceId}" is not registered`);
    }

    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const page = await adapter.listMappings({
      resourceId: params.resourceId,
      limit,
      offset,
      ...(params.search?.trim() ? { search: params.search.trim() } : {}),
    });

    return buildMappingPage({
      limit,
      offset,
      hasMore: page.hasMore,
      total: page.total,
      items: page.items,
    });
  }

  async function lookupMapping(
    params:
      | { resourceId: string; connectValue: string | string[] }
      | { resourceId: string; plugName: string; ref: string },
  ): Promise<Record<string, unknown> | null> {
    const resource = await getRegisteredResourceById(params.resourceId);
    if (!resource) {
      throw new Error(`Resource "${params.resourceId}" is not registered`);
    }

    if ("connectValue" in params) {
      return adapter.lookupMapping({
        resourceId: params.resourceId,
        connectValue: canonicalizeConnectValue(resource, params.connectValue),
      });
    }

    if (resource.mapping.plugs && !resource.mapping.plugs[params.plugName]) {
      throw new Error(
        `Resource "${resource.name}" does not declare plug "${params.plugName}"`,
      );
    }

    return adapter.lookupMapping(params);
  }

  async function upsertMapping(mapping: {
    resourceId: string;
    connectValue: string | string[];
    refs: Record<string, string>;
    metadata?: Record<string, unknown> | null;
    mergeRefs?: boolean;
  }): Promise<Record<string, unknown>> {
    const resource = await validateMappingPayload(mapping);
    const result = await adapter.upsertMapping({
      resourceId: mapping.resourceId,
      connectValue: canonicalizeConnectValue(resource, mapping.connectValue),
      refs: mapping.refs,
      metadata: mapping.metadata ?? null,
      ...(mapping.mergeRefs !== undefined
        ? { mergeRefs: mapping.mergeRefs }
        : {}),
    });
    const saved = await adapter.getMapping(result.id);
    if (!saved) {
      throw new Error("Mapping was saved but could not be reloaded");
    }
    return saved;
  }

  async function updateMapping(
    id: string,
    mapping: {
      resourceId: string;
      connectValue: string | string[];
      refs: Record<string, string>;
      metadata?: Record<string, unknown> | null;
      mergeRefs?: boolean;
    },
  ): Promise<Record<string, unknown>> {
    const existing = await adapter.getMapping(id);
    if (!existing) {
      throw new Error(`Mapping "${id}" not found`);
    }

    const resource = await validateMappingPayload(mapping);
    await adapter.upsertMapping({
      id,
      resourceId: mapping.resourceId,
      connectValue: canonicalizeConnectValue(resource, mapping.connectValue),
      refs: mapping.refs,
      metadata: mapping.metadata ?? null,
      ...(mapping.mergeRefs !== undefined
        ? { mergeRefs: mapping.mergeRefs }
        : {}),
    });
    const saved = await adapter.getMapping(id);
    if (!saved) {
      throw new Error(`Mapping "${id}" disappeared after update`);
    }
    return saved;
  }

  function createMappingInstance(resourceName: string): MappingInstance {
    return {
      async list(params = {}) {
        const resourceId = await resolveResourceId(resourceName);
        return listMappings({
          resourceId,
          ...(params.limit !== undefined ? { limit: params.limit } : {}),
          ...(params.offset !== undefined ? { offset: params.offset } : {}),
          ...(params.search !== undefined ? { search: params.search } : {}),
        });
      },
      async lookup(connectValue) {
        const { id: resourceId } =
          await getRegisteredResourceByName(resourceName);
        return lookupMapping({ resourceId, connectValue });
      },
      async lookupByRef(plugName, ref) {
        const { id: resourceId } =
          await getRegisteredResourceByName(resourceName);
        return lookupMapping({ resourceId, plugName, ref });
      },
      async upsert(mapping) {
        const { id: resourceId } =
          await getRegisteredResourceByName(resourceName);
        return upsertMapping({
          resourceId,
          connectValue: mapping.connectValue,
          refs: mapping.refs,
          ...(mapping.metadata !== undefined
            ? { metadata: mapping.metadata }
            : {}),
          ...(mapping.mergeRefs !== undefined
            ? { mergeRefs: mapping.mergeRefs }
            : {}),
        });
      },
      delete: deleteMapping,
    };
  }

  async function deleteMapping(id: string): Promise<void> {
    const existing = await adapter.getMapping(id);
    if (!existing) {
      throw new Error(`Mapping "${id}" not found`);
    }
    await adapter.deleteMapping(id);
  }

  // -------------------------------------------------------------------------
  // Wire management
  // -------------------------------------------------------------------------

  function wire(plugName: string): WireInstance {
    const plugReg = plugs.find((p) => p.name === plugName);
    if (!plugReg) {
      throw new Error(`Plug "${plugName}" not registered`);
    }
    if (!plugReg.wires || plugReg.wires.length === 0) {
      throw new Error(`Plug "${plugName}" has no wire configuration`);
    }
    const wireConfig = plugReg.wires[0]!;

    function createBoundPlug(
      vars: Record<string, string>,
      _setVars?: (updates: Record<string, string>) => Promise<void>,
    ) {
      return bindPlugWithVars(plugReg!.plug, vars, _setVars);
    }

    async function getWireVars(
      wireId: string,
    ): Promise<Record<string, string>> {
      const raw = await adapter.getWireMetadata(wireId);
      return readEncryptedJson(raw, secret, decryptVars);
    }

    async function setWireVars(
      wireId: string,
      vars: Record<string, string>,
    ): Promise<void> {
      const serialized = JSON.stringify(vars);
      const toStore = secret
        ? await encryptVars(serialized, secret)
        : serialized;
      await adapter.updateWireMetadata(wireId, toStore);
    }

    return {
      async create(callbackUrl: string) {
        await init();
        kd(
          "wire",
          `${plugName}: creating subscription, callbackUrl=${callbackUrl}`,
        );

        const allPlugs = await adapter.listPlugs();
        const dbPlug = allPlugs.find((p) => p["name"] === plugName);
        if (!dbPlug) {
          throw new Error(`Plug "${plugName}" not found in database`);
        }
        const plugId = dbPlug["id"] as string;

        const existingWire = await adapter.getPlugWire(plugId);
        const wireId = existingWire
          ? (existingWire["id"] as string)
          : (
              await adapter.insertWire({
                plugId,
                remoteId: "",
                callbackUrl,
                eventTypes: wireConfig.events,
              })
            ).id;

        const vars = secret ? await getVars(plugName).catch(() => ({})) : {};
        const _setVars = secret
          ? (updates: Record<string, string>) =>
              setVars(plugName, { ...vars, ...updates })
          : undefined;
        const boundPlug = createBoundPlug(vars, _setVars);

        const wireVars = await getWireVars(wireId);

        const result = await wireConfig.onSubscribe({
          plug: boundPlug,
          callbackUrl,
          events: wireConfig.events,
          wireVars,
          setWireVars: (updates) =>
            setWireVars(wireId, { ...wireVars, ...updates }),
        });

        kd(
          "wire",
          `${plugName}: subscription created, remoteId=${result.remoteId}`,
        );

        await adapter.updateWireDetails(wireId, {
          remoteId: result.remoteId,
          callbackUrl,
          eventTypes: wireConfig.events,
          status: "active",
        });

        const record = await adapter.getWire(wireId);
        return record!;
      },

      async delete(wireId: string) {
        await init();
        kd("wire", `${plugName}: deleting wire ${wireId}`);
        const wireRecord = await adapter.getWire(wireId);
        if (!wireRecord) {
          throw new Error(`Wire "${wireId}" not found`);
        }

        const remoteId = (wireRecord["remoteId"] ??
          wireRecord["remote_id"]) as string;
        kd("wire", `${plugName}: remoteId=${remoteId}`);
        if (!remoteId) {
          await adapter.updateWireStatus(wireId, "disabled");
          return;
        }

        const vars = secret ? await getVars(plugName).catch(() => ({})) : {};
        const _setVars = secret
          ? (updates: Record<string, string>) =>
              setVars(plugName, { ...vars, ...updates })
          : undefined;
        const boundPlug = createBoundPlug(vars, _setVars);

        const wireVars = await getWireVars(wireId);

        await wireConfig.onUnsubscribe({
          plug: boundPlug,
          remoteId,
          wireVars,
          setWireVars: (updates) =>
            setWireVars(wireId, { ...wireVars, ...updates }),
        });

        kd("wire", `${plugName}: unsubscribed successfully`);
        await adapter.updateWireStatus(wireId, "disabled");
      },

      async get() {
        await init();
        const allPlugs = await adapter.listPlugs();
        const dbPlug = allPlugs.find((p) => p["name"] === plugName);
        if (!dbPlug) return null;

        return adapter.getPlugWire(dbPlug["id"] as string);
      },
    };
  }

  // -------------------------------------------------------------------------
  // Flow execution
  // -------------------------------------------------------------------------

  async function triggerFlowRun(
    flowId: string,
    input: unknown,
    source: RunSource = "manual",
  ): Promise<Response> {
    const flow = await adapter.getFlow(flowId);
    if (
      !flow ||
      typeof flow["plugName"] !== "string" ||
      !plugNames.has(flow["plugName"])
    ) {
      return Response.json({ error: "Flow not found" }, { status: 404 });
    }

    if (flow["enabled"] === false) {
      return Response.json({ error: "Flow is disabled" }, { status: 409 });
    }

    const plugName = flow["plugName"];
    const plugReg = plugs.find((p) => p.name === plugName);
    const flowName = flow["name"];
    const flowType = flow["type"];
    const flowReg = plugReg?.flows?.find(
      (candidate) => candidate.name === flowName && candidate.type === flowType,
    );

    if (!plugReg || !flowReg) {
      return Response.json({ error: "Flow not registered" }, { status: 404 });
    }

    if (flowReg.type === "webhook") {
      return Response.json(
        { error: "Webhook flows are triggered through webhook routes" },
        { status: 400 },
      );
    }

    const requestBody =
      input && typeof input === "object"
        ? (input as Record<string, unknown>)
        : {};

    const variants = getFlowVariants(plugName, flowReg.name, flowReg.type);

    // Resolve the variant: explicit `variant`, then deprecated `runType` alias,
    // then `default` if it exists, else error listing the available variants.
    let requestedVariant =
      typeof requestBody["variant"] === "string"
        ? requestBody["variant"]
        : undefined;
    if (
      requestedVariant === undefined &&
      typeof requestBody["runType"] === "string"
    ) {
      requestedVariant = requestBody["runType"];
      console.warn(
        `[khotan] "runType" is deprecated; pass "variant" instead. ` +
          `Treating runType="${requestedVariant}" as variant="${requestedVariant}".`,
      );
    }

    let variant: string;
    if (requestedVariant !== undefined) {
      variant = requestedVariant;
    } else if (DEFAULT_VARIANT in variants) {
      variant = DEFAULT_VARIANT;
    } else {
      return Response.json(
        {
          error: `Flow "${flowReg.name}" requires a variant. Available: ${Object.keys(variants).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const activeVariant: FlowVariant | undefined = variants[variant];

    const { id: runId } = await adapter.insertRun({
      flowId,
      variant,
      source,
      status: "running",
    });
    const startedAt = Date.now();

    await adapter.updateFlowLastRun(flowId, {
      lastRunAt: new Date(startedAt),
      lastRunStatus: "running" as KhotanTerminalRunStatus,
    });

    const hookContext: FlowHookContext = {
      flow: {
        id: flowId,
        name: flowReg.name,
        plugName,
        type: flowReg.type,
        resource: flowReg.resource ?? null,
        to: flowReg.to ?? null,
      },
      variant,
    };

    // Invoke the active variant's terminal-state hook. `onComplete` fires on
    // success, `onError` on `failed`/`partial`. A throwing hook is caught and
    // logged and never changes the recorded run status.
    async function runVariantHook(
      status: KhotanTerminalRunStatus,
      counters: ReturnType<typeof getFlowRunCounters>,
      error: string | null,
      durationMs: number,
    ): Promise<void> {
      const hook: FlowHook | undefined =
        status === "completed"
          ? activeVariant?.onComplete
          : status === "failed" || status === "partial"
            ? activeVariant?.onError
            : undefined;
      if (!hook) return;

      const summary: RunSummary = {
        id: runId,
        status,
        variant,
        source,
        durationMs,
        ...counters,
        error,
      };
      try {
        await hook(hookContext, summary);
      } catch (err) {
        kd("flow", `variant hook for "${variant}" threw`, err);
      }
    }

    async function completeRunOk(result: FlowRunResult | undefined) {
      const completedAt = new Date();
      const counters = getFlowRunCounters(result);
      const status = resolveTerminalRunStatus(result, counters);
      const durationMs = Date.now() - startedAt;

      await adapter.updateRun(runId, {
        status,
        completedAt,
        durationMs,
        ...counters,
        error: result?.error ?? null,
        metadata: result?.metadata ?? null,
      });
      await adapter.updateFlowLastRun(flowId, {
        lastRunAt: completedAt,
        lastRunStatus: status,
      });

      await runVariantHook(status, counters, result?.error ?? null, durationMs);

      return { completedAt, counters, status };
    }

    async function completeRunFailed(error: unknown) {
      const completedAt = new Date();
      const message = getErrorMessage(error);
      const status: KhotanTerminalRunStatus = isWorkflowCancelledError(error)
        ? "cancelled"
        : "failed";
      const durationMs = Date.now() - startedAt;
      const counters = {
        ...getFlowRunCounters(undefined),
        failed: status === "failed" ? 1 : 0,
      };
      await adapter.updateRun(runId, {
        status,
        completedAt,
        durationMs,
        failed: counters.failed,
        error: message,
      });
      await adapter.updateFlowLastRun(flowId, {
        lastRunAt: completedAt,
        lastRunStatus: status,
      });
      await runVariantHook(status, counters, message, durationMs);
      return message;
    }

    function observeWorkflowCompletion(workflowResult: unknown) {
      const returnValue = getWorkflowReturnValue(workflowResult);
      if (!returnValue) return;

      void returnValue
        .then(async (value) => {
          await completeRunOk(toFlowRunResult(value));
        })
        .catch(async (error: unknown) => {
          await completeRunFailed(error);
        })
        .catch((error: unknown) => {
          kd("flow", `Failed to reconcile workflow run ${runId}`, error);
        });
    }

    try {
      const vars = secret ? await getVars(plugName).catch(() => ({})) : {};
      const setFlowVars = async (updates: Record<string, string>) => {
        await setVars(plugName, { ...vars, ...updates });
      };
      const boundPlug = bindPlugWithVars(
        plugReg.plug,
        vars,
        secret ? setFlowVars : undefined,
      );
      const plugVarsByName: Record<string, Record<string, string>> = {
        [plugName]: vars,
      };
      if (flowReg.to && plugNames.has(flowReg.to)) {
        plugVarsByName[flowReg.to] = secret
          ? await getVars(flowReg.to).catch(() => ({}))
          : {};
      }

      const flowContext = {
        id: flowId,
        name: flowReg.name,
        plugName,
        type: flowReg.type,
        resource: flowReg.resource ?? null,
        to: flowReg.to ?? null,
      };

      if (flowReg.workflow) {
        const startWorkflow = await importWorkflowStart();
        const result = await startWorkflow(flowReg.workflow, [
          {
            flow: flowContext,
            variant,
            body: requestBody["body"],
            vars,
            plugVarsByName,
            khotanRunId: runId,
            khotanInstanceId: instanceId,
          },
        ]);
        const workflowRunId = getWorkflowRunId(result);

        if (workflowRunId) {
          await adapter.updateRun(runId, {
            status: "running",
            workflowRunId,
          });
        }

        observeWorkflowCompletion(result);

        return Response.json({
          id: runId,
          flowId,
          workflowRunId,
          status: "running",
          variant,
          source,
        });
      }

      const result = await flowReg.run?.({
        plug: boundPlug,
        flow: flowContext,
        variant,
        body: requestBody["body"],
        vars,
        setVars: setFlowVars,
        cache: createCacheInstance,
        mapping: createMappingInstance,
      });
      const runResult = toFlowRunResult(result);

      const { counters, status } = await completeRunOk(runResult);

      return Response.json({
        id: runId,
        flowId,
        status,
        variant,
        source,
        ...counters,
        error: runResult?.error ?? null,
        metadata: runResult?.metadata ?? null,
      });
    } catch (error) {
      const message = await completeRunFailed(error);
      return Response.json(
        { id: runId, flowId, status: "failed", error: message },
        { status: 500 },
      );
    }
  }

  // -------------------------------------------------------------------------
  // Cron scheduling
  // -------------------------------------------------------------------------

  function isFlowOverdue(
    schedule: string,
    lastRunAt: Date,
    now: Date,
  ): boolean {
    const elapsedMs = now.getTime() - lastRunAt.getTime();
    if (elapsedMs <= 0) return false;

    if (matchesCronSchedule(schedule, now)) return true;

    const intervalMs = estimateCronIntervalMs(schedule);
    return elapsedMs >= intervalMs;
  }

  function estimateCronIntervalMs(schedule: string): number {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length !== 5) return 60_000;
    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    if (dayOfMonth !== "*" || month !== "*" || dayOfWeek !== "*") {
      if (month !== "*") return 30 * 24 * 60 * 60_000;
      if (dayOfMonth !== "*" || dayOfWeek !== "*") return 24 * 60 * 60_000;
    }

    if (hour !== "*") {
      const hourStep = parseStepInterval(hour!, 24);
      if (minute !== "*") {
        return hourStep * 60 * 60_000;
      }
      return hourStep * 60 * 60_000;
    }

    if (minute !== "*") {
      const minuteStep = parseStepInterval(minute!, 60);
      return minuteStep * 60_000;
    }

    return 60_000;
  }

  function parseStepInterval(field: string, max: number): number {
    if (field.includes("/")) {
      const step = Number.parseInt(field.split("/")[1] ?? "", 10);
      if (Number.isFinite(step) && step > 0) return step;
    }

    if (field.includes(",")) {
      const values = field
        .split(",")
        .map((v) => Number.parseInt(v.trim(), 10))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      if (values.length >= 2) {
        let minGap = max;
        for (let i = 1; i < values.length; i++) {
          minGap = Math.min(minGap, values[i]! - values[i - 1]!);
        }
        return minGap;
      }
    }

    const parsed = Number.parseInt(field, 10);
    if (Number.isFinite(parsed)) return max;

    return max;
  }

  function getLastTriggeredAt(flow: Record<string, unknown>): Date | null {
    const lastRunAt = coerceDate(flow["lastRunAt"]);
    if (lastRunAt) return lastRunAt;
    const createdAt = coerceDate(flow["createdAt"]);
    if (createdAt) return createdAt;
    return null;
  }

  async function dispatchScheduledFlows(options: { now?: Date } = {}) {
    await init();

    const now = options.now ?? new Date();
    const tickAt = startOfUtcMinute(now);

    const registeredFlows = (await adapter.listFlows()).filter((flow) =>
      isRegisteredFlowRecord(flow),
    );

    const triggered: Record<string, unknown>[] = [];
    const skipped: Record<string, unknown>[] = [];
    let evaluated = 0;

    for (const flow of registeredFlows) {
      const flowId = typeof flow["id"] === "string" ? flow["id"] : null;
      const flowName = typeof flow["name"] === "string" ? flow["name"] : null;
      const plugName =
        typeof flow["plugName"] === "string" ? flow["plugName"] : null;
      const flowType = typeof flow["type"] === "string" ? flow["type"] : null;

      if (!flowId || !flowName || !plugName || !flowType) continue;

      const variants = getFlowVariants(plugName, flowName, flowType);

      // Lazily loaded per-variant baseline source: the flow's run history.
      let runsForFlow: Record<string, unknown>[] | null = null;

      for (const [variantName, variantConfig] of Object.entries(variants)) {
        const schedule = variantConfig.schedule?.trim();
        // Variants without a schedule are manual-only and never auto-fire.
        if (!schedule) continue;

        evaluated++;

        if (flow["enabled"] === false) {
          skipped.push({
            flowId,
            flowName,
            plugName,
            variant: variantName,
            schedule,
            reason: "disabled",
          });
          continue;
        }

        runsForFlow ??= await adapter.listRuns(flowId);
        const lastVariantRun = runsForFlow.find(
          (run) => run["variant"] === variantName,
        );
        const lastTriggered =
          coerceDate(lastVariantRun?.["startedAt"]) ?? getLastTriggeredAt(flow);

        if (!lastTriggered) {
          skipped.push({
            flowId,
            flowName,
            plugName,
            variant: variantName,
            schedule,
            reason: "no_baseline",
          });
          continue;
        }

        let overdue: boolean;
        try {
          overdue = isFlowOverdue(schedule, lastTriggered, tickAt);
        } catch (error) {
          skipped.push({
            flowId,
            flowName,
            plugName,
            variant: variantName,
            schedule,
            reason: "invalid_schedule",
            detail: getErrorMessage(error),
          });
          continue;
        }

        if (!overdue) {
          skipped.push({
            flowId,
            flowName,
            plugName,
            variant: variantName,
            schedule,
            reason: "not_due",
          });
          continue;
        }

        const response = await triggerFlowRun(
          flowId,
          { variant: variantName },
          "scheduled",
        );
        const payload = (await response.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;

        if (!response.ok) {
          skipped.push({
            flowId,
            flowName,
            plugName,
            variant: variantName,
            schedule,
            reason: "trigger_failed",
            status: response.status,
            detail:
              typeof payload["error"] === "string"
                ? payload["error"]
                : response.statusText,
          });
          continue;
        }

        triggered.push({
          flowId,
          flowName,
          plugName,
          variant: variantName,
          schedule,
          runId: payload["id"] ?? null,
          workflowRunId: payload["workflowRunId"] ?? null,
          status:
            typeof payload["status"] === "string"
              ? payload["status"]
              : "running",
        });
      }
    }

    return {
      ok: true,
      tickAt: tickAt.toISOString(),
      evaluated,
      triggered,
      skipped,
    };
  }

  // -------------------------------------------------------------------------
  // Flow instance (programmatic)
  // -------------------------------------------------------------------------

  async function resolveFlowId(
    flowNameOrId: string,
    options: FlowSelectorOptions = {},
  ): Promise<string> {
    await init();

    const byId = await adapter.getFlow(flowNameOrId);
    if (
      byId &&
      typeof byId["plugName"] === "string" &&
      plugNames.has(byId["plugName"])
    ) {
      return flowNameOrId;
    }

    const matches = (await adapter.listFlows()).filter((flow) => {
      if (flow["name"] !== flowNameOrId) return false;
      if (!isRegisteredFlowRecord(flow)) return false;
      return !options.plugName || flow["plugName"] === options.plugName;
    });

    if (matches.length === 0) {
      const suffix = options.plugName ? ` on plug "${options.plugName}"` : "";
      throw new Error(`Flow "${flowNameOrId}"${suffix} not found`);
    }

    if (matches.length > 1) {
      const plugsStr = matches
        .map((flow) => String(flow["plugName"]))
        .filter(Boolean)
        .join(", ");
      throw new Error(
        `Flow "${flowNameOrId}" is registered on multiple plugs (${plugsStr}). Pass { plugName } to select one.`,
      );
    }

    const id = matches[0]?.["id"];
    if (typeof id !== "string") {
      throw new Error(`Flow "${flowNameOrId}" has no database ID`);
    }

    return id;
  }

  function flow(
    flowNameOrId: string,
    selectorOptions: FlowSelectorOptions = {},
  ): FlowInstance {
    return {
      async start(startOptions: FlowStartOptions = {}) {
        const flowId = await resolveFlowId(flowNameOrId, selectorOptions);
        const response = await triggerFlowRun(flowId, startOptions, "manual");
        const payload: unknown = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message =
            payload && typeof payload === "object" && "error" in payload
              ? String(payload.error)
              : `Failed to start flow "${flowNameOrId}"`;
          throw new Error(message);
        }

        return payload as Record<string, unknown>;
      },
    };
  }

  // -------------------------------------------------------------------------
  // Workflow run helpers
  // -------------------------------------------------------------------------

  async function getRunWithWorkflowStatus(
    runId: string,
  ): Promise<Record<string, unknown> | null> {
    const run = await adapter.getRun(runId);
    if (!run) return null;

    const workflowRunId =
      typeof run["workflowRunId"] === "string" ? run["workflowRunId"] : null;

    if (!workflowRunId) {
      return { ...run, workflowStatus: null };
    }

    try {
      const getRun = await importWorkflowGetRun();
      const workflowRun = getRun(workflowRunId);
      const workflowStatus = workflowRun.status
        ? await workflowRun.status
        : null;
      return { ...run, workflowStatus };
    } catch (error) {
      return {
        ...run,
        workflowStatus: null,
        workflowError: getErrorMessage(error),
      };
    }
  }

  function getRunWorkflowId(run: Record<string, unknown>): string | null {
    return typeof run["workflowRunId"] === "string"
      ? run["workflowRunId"]
      : null;
  }

  // -------------------------------------------------------------------------
  // Webhook processing helper (de-duplicated catch/pass loop)
  // -------------------------------------------------------------------------

  async function processWebhookHandler(
    handler: CatchRegistration | PassRegistration,
    ctx: {
      event: Record<string, unknown>;
      eventType: string;
      headers: Record<string, string>;
      dbHandlers: Record<string, unknown>[];
      wireId: string | null;
      startWorkflow: Awaited<ReturnType<typeof importWorkflowStart>>;
      allPlugs: Record<string, unknown>[];
    },
  ): Promise<void> {
    if (
      Array.isArray(handler.events) &&
      handler.events.length > 0 &&
      !handler.events.includes(ctx.eventType)
    ) {
      return;
    }

    const handlerRow = ctx.dbHandlers.find(
      (h) => h["name"] === handler.name && h["type"] === handler.type,
    );
    if (handlerRow?.["enabled"] === false) {
      return;
    }

    let destVars: Record<string, string> = {};
    if (handler.type === "pass") {
      const destPlug = ctx.allPlugs.find((dp) => dp["name"] === handler.to);
      if (destPlug) {
        const destPlugId = destPlug["id"] as string;
        const encrypted = await adapter.getEncryptedVariables(destPlugId);
        if (encrypted && secret) {
          destVars = await readEncryptedJson(encrypted, secret, decryptVars);
        }
      }
    }

    const handlerId = handlerRow ? (handlerRow["id"] as string) : null;
    const { id: khotanRunId } = await adapter.insertRun({
      webhookHandlerId: handlerId,
      wireId: ctx.wireId,
      workflowRunId: null,
      variant: "webhook",
      source: "webhook",
      status: "running",
    });

    if (handlerId && ctx.wireId) {
      await adapter.insertWebhookEvent({
        wireId: ctx.wireId,
        webhookHandlerId: handlerId,
        khotanRunId,
        eventType: ctx.eventType,
        payload: ctx.event,
        headers: ctx.headers,
      });
    }

    try {
      const workflowCtx =
        handler.type === "pass"
          ? {
              event: ctx.event,
              eventType: ctx.eventType,
              headers: ctx.headers,
              destVars,
              khotanRunId,
              khotanInstanceId: instanceId,
            }
          : {
              event: ctx.event,
              eventType: ctx.eventType,
              headers: ctx.headers,
              khotanRunId,
              khotanInstanceId: instanceId,
            };

      const result = await ctx.startWorkflow(handler.workflow, [workflowCtx]);
      const workflowRunId = getWorkflowRunId(result);
      if (workflowRunId) {
        await adapter.updateRun(khotanRunId, {
          status: "running",
          workflowRunId,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await adapter.updateRun(khotanRunId, {
        status: "failed",
        completedAt: new Date(),
        failed: 1,
        error: message,
      });
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Declarative route table
  // -------------------------------------------------------------------------

  const routes: RouteDefinition[] = [
    // --- GET routes ---
    {
      method: "GET",
      pattern: "caches/:cacheName/:key",
      auth: "authorize",
      handler: async ({ params }) => {
        try {
          const entry = await readCacheEntry(
            params["cacheName"]!,
            params["key"]!,
          );
          if (!entry) {
            return Response.json(
              { error: "Cache entry not found" },
              { status: 404 },
            );
          }
          return Response.json({
            cache: params["cacheName"],
            key: entry.key,
            value: entry.value,
            expiresAt: entry.expiresAt,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Invalid cache request";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
    {
      method: "GET",
      pattern: "cron",
      auth: "cron",
      handler: async () => {
        const result = await dispatchScheduledFlows();
        return Response.json(result);
      },
    },
    {
      method: "GET",
      pattern: "debug",
      auth: "debug",
      handler: async () => {
        return Response.json({ enabled: true });
      },
    },
    {
      method: "GET",
      pattern: "debug/:plugName",
      auth: "debug",
      handler: async ({ params }) => {
        const plugName = params["plugName"]!;
        const plugReg = plugs.find((p) => p.name === plugName);
        if (!plugReg) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const fields = plugReg.vars ?? plugReg.plug.varFields ?? [];
        const hasConfigured = await hasVars(plugName).catch(() => false);
        const rawEndpoints =
          plugReg.plug.endpoints ?? plugReg.endpoints ?? null;

        let varValues: Record<string, string> = {};
        if (hasConfigured || Object.keys(getDefaultVars(plugName)).length > 0) {
          try {
            const raw = await getVars(plugName);
            varValues = Object.fromEntries(
              Object.entries(maskVars(plugName, raw)).filter(([key]) => {
                const field = fields.find((f) => f.key === key);
                return field && !field.hidden;
              }),
            );
          } catch {
            /* no secret configured */
          }
        }

        return Response.json({
          name: plugReg.name,
          baseUrl: plugReg.plug.baseUrl,
          authType: plugReg.plug.authType,
          endpoints: serializeEndpoints(rawEndpoints),
          vars: {
            fields: fields.filter((f) => !f.hidden),
            configured: hasConfigured,
            values: varValues,
          },
        });
      },
    },
    {
      method: "GET",
      pattern: "variables/:plugName",
      auth: "authorize",
      handler: async ({ params }) => {
        const plugName = params["plugName"]!;
        if (!plugNames.has(plugName)) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const fields = getVarFields(plugName);
        const hasValues = await hasVars(plugName);
        let masked: Record<string, string> = {};
        if (hasValues || Object.keys(getDefaultVars(plugName)).length > 0) {
          try {
            const vars = await getVars(plugName);
            masked = maskVars(plugName, vars);
          } catch {
            masked = {};
          }
        }
        return Response.json({ fields, values: masked, configured: hasValues });
      },
    },
    {
      method: "GET",
      pattern: "wires/:plugName",
      auth: "authorize",
      handler: async ({ params }) => {
        const plugName = params["plugName"]!;
        if (!plugNames.has(plugName)) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const plugReg = plugs.find((p) => p.name === plugName);
        if (!plugReg?.wires || plugReg.wires.length === 0) {
          return Response.json({ wire: null, configured: false });
        }
        const wireRecord = await wire(plugName).get();
        return Response.json({ wire: wireRecord, configured: true });
      },
    },
    {
      method: "GET",
      pattern: "webhook-handlers/:plugName",
      auth: "authorize",
      handler: async ({ params }) => {
        const plugName = params["plugName"]!;
        if (!plugNames.has(plugName)) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const allPlugsRows = await adapter.listPlugs();
        const dbPlug = allPlugsRows.find((p) => p["name"] === plugName);
        if (!dbPlug) {
          return Response.json([]);
        }
        const plugId = dbPlug["id"] as string;
        const wireRecord = await adapter.getPlugWire(plugId);
        if (!wireRecord) {
          return Response.json([]);
        }
        const wireId = wireRecord["id"] as string;
        const handlers = await adapter.listWebhookHandlers(wireId);
        const plugReg = plugs.find((p) => p.name === plugName);
        const configuredHandlerEvents = new Map<string, string[] | undefined>();
        for (const handler of plugReg
          ? getWebhookHandlersForPlug(plugReg)
          : []) {
          configuredHandlerEvents.set(
            `${handler.type}:${handler.name}`,
            handler.events,
          );
        }
        const handlersWithRuns = await Promise.all(
          handlers.map(async (handler) => {
            const handlerId = handler["id"];
            if (typeof handlerId !== "string") return handler;
            const latestRun =
              await adapter.getLatestWebhookHandlerRun(handlerId);
            return {
              ...handler,
              events:
                configuredHandlerEvents.get(
                  `${String(handler["type"])}:${String(handler["name"])}`,
                ) ?? null,
              lastRunStatus: latestRun?.["status"] ?? null,
              lastRunAt: latestRun?.["startedAt"] ?? null,
            };
          }),
        );
        return Response.json(handlersWithRuns);
      },
    },
    {
      method: "GET",
      pattern: "plugs",
      auth: "authorize",
      handler: async () => {
        const data = await adapter.listPlugs();
        const filtered = data.filter(
          (p) => typeof p["name"] === "string" && plugNames.has(p["name"]),
        );
        const registeredFlows = await listRegisteredFlowRecords(data);
        const withVarState = await Promise.all(
          filtered.map(async (plug) => {
            const pName = plug["name"] as string;
            let varsConfigured = false;
            try {
              varsConfigured = await hasVars(pName);
            } catch {
              varsConfigured = false;
            }
            return {
              ...plug,
              flowCount:
                typeof plug["id"] === "string"
                  ? countAssociatedFlows(registeredFlows, plug["id"])
                  : plug["flowCount"],
              varsConfigured,
            };
          }),
        );
        return Response.json(withVarState);
      },
    },
    {
      method: "GET",
      pattern: "plugs/:plugId",
      auth: "authorize",
      handler: async ({ params }) => {
        const plugId = params["plugId"]!;
        const plug = await adapter.getPlug(plugId);
        if (
          !plug ||
          typeof plug["name"] !== "string" ||
          !plugNames.has(plug["name"])
        ) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const flows = (await listRegisteredFlowRecords()).filter((flow) =>
          isFlowAssociatedWithPlug(flow, plugId),
        );
        return Response.json({ ...plug, flows });
      },
    },
    {
      method: "GET",
      pattern: "flows",
      auth: "authorize",
      handler: async () => {
        return Response.json(await listRegisteredFlowRecords());
      },
    },
    {
      method: "GET",
      pattern: "flows/:flowId/runs",
      auth: "authorize",
      handler: async ({ params }) => {
        const flowId = params["flowId"]!;
        const data = await adapter.listRuns(flowId);
        return Response.json(data);
      },
    },
    {
      method: "GET",
      pattern: "runs",
      auth: "authorize",
      handler: async ({ url }) => {
        const limit = Math.min(
          Math.max(
            Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20,
            1,
          ),
          100,
        );
        const offset = Math.max(
          Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
          0,
        );
        const page = await adapter.listRunsPage({ limit, offset });
        return Response.json({
          items: page.items,
          page: {
            limit,
            offset,
            hasMore: page.hasMore,
            prevOffset: Math.max(offset - limit, 0),
            nextOffset: offset + limit,
          },
        });
      },
    },
    {
      method: "GET",
      pattern: "runs/:runId/stream",
      auth: "authorize",
      handler: async ({ params, url }) => {
        const runId = params["runId"]!;
        const run = await adapter.getRun(runId);
        if (!run) {
          return Response.json({ error: "Run not found" }, { status: 404 });
        }
        const workflowRunId = getRunWorkflowId(run);
        if (!workflowRunId) {
          return Response.json(
            { error: "Run does not have a Workflow run ID" },
            { status: 400 },
          );
        }

        const startIndexParam = url.searchParams.get("startIndex");
        const parsedStartIndex =
          startIndexParam == null ? null : Number.parseInt(startIndexParam, 10);
        const namespace = url.searchParams.get("namespace") ?? undefined;
        const getRun = await importWorkflowGetRun();
        const workflowRun = getRun(workflowRunId);
        const streamOptions: { startIndex?: number; namespace?: string } = {};
        if (
          typeof parsedStartIndex === "number" &&
          Number.isFinite(parsedStartIndex)
        ) {
          streamOptions.startIndex = parsedStartIndex;
        }
        if (namespace) streamOptions.namespace = namespace;
        const stream = workflowRun.getReadable?.(streamOptions);

        if (!stream) {
          return Response.json(
            { error: "Workflow run does not expose a readable stream" },
            { status: 400 },
          );
        }

        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
          },
        });
      },
    },
    {
      method: "GET",
      pattern: "runs/:runId",
      auth: "authorize",
      handler: async ({ params }) => {
        const runId = params["runId"]!;
        const run = await getRunWithWorkflowStatus(runId);
        if (!run) {
          return Response.json({ error: "Run not found" }, { status: 404 });
        }
        return Response.json(run);
      },
    },
    {
      method: "GET",
      pattern: "webhook-events",
      auth: "authorize",
      handler: async ({ url }) => {
        const limit = Math.min(
          Math.max(
            Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20,
            1,
          ),
          100,
        );
        const offset = Math.max(
          Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
          0,
        );
        const page = await adapter.listWebhookEventsPage({ limit, offset });
        return Response.json({
          items: page.items,
          page: {
            limit,
            offset,
            hasMore: page.hasMore,
            prevOffset: Math.max(offset - limit, 0),
            nextOffset: offset + limit,
          },
        });
      },
    },
    {
      method: "GET",
      pattern: "resources",
      auth: "authorize",
      handler: async () => {
        const data = await adapter.listResources();
        const filtered = data.filter(
          (r) => typeof r["name"] === "string" && resourceNames.has(r["name"]),
        );
        return Response.json(filtered.map(decorateResourceRecord));
      },
    },
    {
      method: "GET",
      pattern: "resources/:resourceId/mappings",
      auth: "authorize",
      handler: async ({ params, url }) => {
        const resourceId = params["resourceId"]!;
        const resource = await getRegisteredResourceById(resourceId);
        if (!resource) {
          return Response.json(
            { error: "Resource not found" },
            { status: 404 },
          );
        }

        const limit = Math.min(
          Math.max(
            Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20,
            1,
          ),
          100,
        );
        const offset = Math.max(
          Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
          0,
        );
        const trimmedSearch = url.searchParams.get("search")?.trim();
        const search =
          trimmedSearch !== undefined && trimmedSearch !== ""
            ? trimmedSearch
            : undefined;
        const wantsMappingPage =
          url.searchParams.has("limit") ||
          url.searchParams.has("offset") ||
          url.searchParams.has("search");

        const page = await listMappings({
          resourceId,
          limit,
          offset,
          ...(search ? { search } : {}),
        });

        if (!wantsMappingPage) {
          return Response.json(page.items);
        }

        return Response.json(page);
      },
    },
    {
      method: "GET",
      pattern: "resources/:resourceId",
      auth: "authorize",
      handler: async ({ params }) => {
        const resourceId = params["resourceId"]!;
        const resource = await adapter.getResource(resourceId);
        if (
          !resource ||
          typeof resource["name"] !== "string" ||
          !resourceNames.has(resource["name"])
        ) {
          return Response.json(
            { error: "Resource not found" },
            { status: 404 },
          );
        }
        const flows = await adapter.getResourceFlows(resourceId);
        return Response.json({ ...decorateResourceRecord(resource), flows });
      },
    },
    {
      method: "GET",
      pattern: "mappings/:mappingId",
      auth: "authorize",
      handler: async ({ params }) => {
        const mappingId = params["mappingId"]!;
        const mapping = await adapter.getMapping(mappingId);
        if (!mapping) {
          return Response.json({ error: "Mapping not found" }, { status: 404 });
        }
        return Response.json(mapping);
      },
    },

    // --- POST routes ---
    {
      method: "POST",
      pattern: "caches/:cacheName/:key",
      auth: "authorize",
      handler: async ({ params, request }) => {
        const cacheName = params["cacheName"]!;
        const key = params["key"]!;
        const body = (await request.json().catch(() => ({}))) as {
          value?: unknown;
        };

        if (!("value" in body)) {
          return Response.json(
            { error: "Cache writes require a value" },
            { status: 400 },
          );
        }

        try {
          const cacheHandle = createCacheInstance(cacheName);
          await cacheHandle.set(key, body.value);
          const entry = await readCacheEntry(cacheName, key);
          return Response.json({
            cache: cacheName,
            key,
            value: body.value,
            expiresAt: entry?.expiresAt ?? null,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Invalid cache payload";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
    {
      method: "POST",
      pattern: "cron",
      auth: "cron",
      handler: async () => {
        const result = await dispatchScheduledFlows();
        return Response.json(result);
      },
    },
    {
      method: "POST",
      pattern: "webhook/:plugName",
      auth: "webhook",
      handler: async ({ params, request }) => {
        const plugName = params["plugName"]!;
        const plugReg = plugs.find((p) => p.name === plugName);
        if (!plugReg) {
          return Response.json(
            { error: `Unknown plug: ${plugName}` },
            { status: 404 },
          );
        }

        const wireConfig = plugReg.wires?.[0];
        if (!wireConfig?.onVerify) {
          return Response.json(
            { error: `No active wire for plug: ${plugName}` },
            { status: 404 },
          );
        }

        const rawBody = await request.text();

        const allPlugsRows = await adapter.listPlugs();
        const dbPlug = allPlugsRows.find((p) => p["name"] === plugName);
        if (!dbPlug) {
          return Response.json(
            { error: `Plug "${plugName}" not found in database` },
            { status: 404 },
          );
        }
        const plugId = dbPlug["id"] as string;
        const wireRecord = await adapter.getPlugWire(plugId);
        const wireId = wireRecord ? (wireRecord["id"] as string) : null;

        let wireVars: Record<string, string> = {};
        if (wireId) {
          const raw = await adapter.getWireMetadata(wireId);
          wireVars = await readEncryptedJson(raw, secret, decryptVars);
        }

        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => {
          headers[key] = value;
        });

        const verified = await wireConfig.onVerify({
          headers,
          body: rawBody,
          wireVars,
        });
        if (!verified) {
          return Response.json(
            { error: "Webhook verification failed" },
            { status: 401 },
          );
        }

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          event = {};
        }
        const eventType =
          typeof event["type"] === "string" ? event["type"] : "unknown";

        const webhookHandlers = getWebhookHandlersForPlug(plugReg);

        const processingWork = (async () => {
          try {
            const startWorkflow = await importWorkflowStart();
            const dbHandlers = wireId
              ? await adapter.listWebhookHandlers(wireId)
              : [];

            for (const handler of webhookHandlers) {
              await processWebhookHandler(handler, {
                event,
                eventType,
                headers,
                dbHandlers,
                wireId,
                startWorkflow,
                allPlugs: allPlugsRows,
              });
            }
          } catch (err) {
            kd("webhook", `${plugName}: workflow start failed:`, err);
          }
        })();

        getWaitUntil()(processingWork);

        return Response.json({ received: true }, { status: 202 });
      },
    },
    {
      method: "POST",
      pattern: "debug/:plugName",
      auth: "debug",
      handler: async ({ params, request }) => {
        const plugName = params["plugName"]!;
        const plugReg = plugs.find((p) => p.name === plugName);
        if (!plugReg) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }

        const body = (await request.json()) as {
          method?: string;
          path?: string;
          body?: unknown;
          params?: Record<string, string>;
          headers?: Record<string, string>;
        };

        const method = (body.method ?? "GET").toUpperCase();
        const reqPath = body.path ?? "/";
        const start = Date.now();

        try {
          const plug = plugReg.plug;
          const vars = secret ? await getVars(plugName).catch(() => ({})) : {};
          const _setVars = secret
            ? (updates: Record<string, string>) =>
                setVars(plugName, { ...vars, ...updates })
            : undefined;
          const opts: {
            params?: Record<string, unknown>;
            headers?: Record<string, string>;
            vars?: Record<string, string>;
            body?: unknown;
            _setVars?: (updates: Record<string, string>) => Promise<void>;
            _skipHooks?: boolean;
          } = { vars };
          if (_setVars) opts._setVars = _setVars;
          if (body.params) opts.params = body.params;
          if (body.headers) opts.headers = body.headers;
          if (body.body) opts.body = body.body;

          let result: unknown;
          switch (method) {
            case "GET":
              result = await plug.get(reqPath, opts);
              break;
            case "POST":
              result = await plug.post(reqPath, opts);
              break;
            case "PUT":
              result = await plug.put(reqPath, opts);
              break;
            case "PATCH":
              result = await plug.patch(reqPath, opts);
              break;
            case "DELETE":
              result = await plug.delete(reqPath, opts);
              break;
            default:
              result = await plug.get(reqPath, opts);
          }

          const timing = Date.now() - start;

          const response: Record<string, unknown> = {
            status: 200,
            statusText: "OK",
            headers: {},
            body: result,
            timing,
          };

          const allEndpoints:
            | Record<string, { method: string; path: string }>
            | undefined = plugReg.plug.endpoints ?? plugReg.endpoints;
          if (allEndpoints) {
            const matched = Object.entries(allEndpoints).find(
              ([, ep]) =>
                ep.method.toUpperCase() === method && ep.path === reqPath,
            );
            if (matched) {
              response["endpoint"] = {
                name: matched[0],
                method: matched[1].method,
                path: matched[1].path,
              };
            }
          }

          return Response.json(response);
        } catch (err) {
          const timing = Date.now() - start;
          const error = err instanceof Error ? err.message : "Unknown error";
          const errBody =
            err && typeof err === "object" && "body" in err ? err.body : null;
          const errStatus =
            err && typeof err === "object" && "status" in err
              ? (err as { status: number }).status
              : 500;

          return Response.json({
            status: errStatus,
            statusText: "Error",
            headers: {},
            body: errBody,
            timing,
            error,
          });
        }
      },
    },
    {
      method: "POST",
      pattern: "variables/:plugName",
      auth: "authorize",
      handler: async ({ params, request }) => {
        const plugName = params["plugName"]!;
        if (!plugNames.has(plugName)) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const body = (await request.json()) as Record<string, string>;
        const fields = getVarFields(plugName);
        const merged = {
          ...(await getVars(plugName).catch(() => ({}))),
        };

        for (const field of fields) {
          const value = body[field.key];
          if (value !== undefined) {
            merged[field.key] = value;
          }
        }

        const missing = fields
          .filter((f) => f.required !== false && !merged[f.key])
          .map((f) => f.key);
        if (missing.length > 0) {
          return Response.json(
            { error: `Missing required fields: ${missing.join(", ")}` },
            { status: 400 },
          );
        }

        const vars: Record<string, string> = {};
        for (const field of fields) {
          const value = merged[field.key];
          if (value !== undefined) {
            vars[field.key] = value;
          }
        }

        try {
          await setVars(plugName, vars);
          return Response.json({ ok: true });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
    {
      method: "POST",
      pattern: "runs/:runId/cancel",
      auth: "authorize",
      handler: async ({ params }) => {
        const runId = params["runId"]!;
        const run = await adapter.getRun(runId);
        if (!run) {
          return Response.json({ error: "Run not found" }, { status: 404 });
        }
        const workflowRunId = getRunWorkflowId(run);
        if (!workflowRunId) {
          return Response.json(
            { error: "Run does not have a Workflow run ID" },
            { status: 400 },
          );
        }

        const getRun = await importWorkflowGetRun();
        const workflowRun = getRun(workflowRunId);
        await workflowRun.cancel?.();

        const completedAt = new Date();
        await adapter.updateRun(runId, {
          status: "cancelled",
          completedAt,
          error: "Cancelled",
        });
        const flowId = typeof run["flowId"] === "string" ? run["flowId"] : null;
        if (flowId) {
          await adapter.updateFlowLastRun(flowId, {
            lastRunAt: completedAt,
            lastRunStatus: "cancelled",
          });
        }

        return Response.json({
          ok: true,
          id: runId,
          workflowRunId,
          status: "cancelled",
          error: "Cancelled",
        });
      },
    },
    {
      method: "POST",
      pattern: "runs/:runId/retry",
      auth: "authorize",
      handler: async ({ params }) => {
        const runId = params["runId"]!;
        const run = await adapter.getRun(runId);
        if (!run) {
          return Response.json({ error: "Run not found" }, { status: 404 });
        }
        const flowId = typeof run["flowId"] === "string" ? run["flowId"] : null;
        if (!flowId) {
          return Response.json(
            { error: "Only flow runs can be retried from the Hub" },
            { status: 400 },
          );
        }
        const variant =
          typeof run["variant"] === "string" ? run["variant"] : DEFAULT_VARIANT;
        return triggerFlowRun(flowId, { variant }, "manual");
      },
    },
    {
      method: "POST",
      pattern: "flows/:flowId/runs",
      auth: "authorize",
      handler: async ({ params, request }) => {
        const flowId = params["flowId"]!;
        const body: unknown = await request.json().catch(() => ({}));
        return triggerFlowRun(flowId, body, "manual");
      },
    },
    {
      method: "POST",
      pattern: "wires/:plugName",
      auth: "authorize",
      handler: async ({ params, request }) => {
        const plugName = params["plugName"]!;
        if (!plugNames.has(plugName)) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const body = (await request.json()) as { callbackUrl: string };
        if (!body.callbackUrl) {
          return Response.json(
            { error: "callbackUrl is required" },
            { status: 400 },
          );
        }
        try {
          const record = await wire(plugName).create(body.callbackUrl);
          return Response.json({ wire: record }, { status: 201 });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          kd("wire", `${plugName}: create failed:`, message);
          if (error && typeof error === "object" && "body" in error) {
            kd("wire", `${plugName}: response body:`, error.body);
          }
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
    {
      method: "POST",
      pattern: "mappings/lookup",
      auth: "authorize",
      handler: async ({ request }) => {
        const body = (await request.json()) as
          | { resourceId: string; connectValue: string | string[] }
          | { resourceId: string; plugName: string; ref: string }
          | null;
        if (
          !body ||
          typeof body !== "object" ||
          typeof body.resourceId !== "string"
        ) {
          return Response.json(
            {
              error:
                "Lookup requires resourceId plus either connectValue or plugName with ref",
            },
            { status: 400 },
          );
        }

        const hasConnectValue = "connectValue" in body;
        const hasPlugRef =
          "plugName" in body &&
          typeof body.plugName === "string" &&
          "ref" in body &&
          typeof body.ref === "string";

        if (!hasConnectValue && !hasPlugRef) {
          return Response.json(
            {
              error: "Lookup requires either connectValue or plugName with ref",
            },
            { status: 400 },
          );
        }

        let mapping: Record<string, unknown> | null;
        try {
          mapping = hasConnectValue
            ? await lookupMapping({
                resourceId: body.resourceId,
                connectValue: body.connectValue,
              })
            : await lookupMapping({
                resourceId: body.resourceId,
                plugName: body.plugName,
                ref: body.ref,
              });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Invalid lookup request";
          return Response.json({ error: message }, { status: 400 });
        }

        if (!mapping) {
          return Response.json({ error: "Mapping not found" }, { status: 404 });
        }
        return Response.json(mapping);
      },
    },
    {
      method: "POST",
      pattern: "mappings",
      auth: "authorize",
      handler: async ({ request }) => {
        const body = (await request.json()) as {
          resourceId: string;
          connectValue: string | string[];
          refs: Record<string, string>;
          metadata?: Record<string, unknown> | null;
        };
        try {
          const existing = await lookupMapping({
            resourceId: body.resourceId,
            connectValue: body.connectValue,
          });
          const saved = await upsertMapping(body);
          return Response.json(saved, { status: existing ? 200 : 201 });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Invalid mapping payload";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },

    // --- PATCH routes ---
    {
      method: "PATCH",
      pattern: "plugs/:plugId",
      auth: "authorize",
      handler: async ({ params, request }) => {
        const plugId = params["plugId"]!;
        const plug = await adapter.getPlug(plugId);
        if (
          !plug ||
          typeof plug["name"] !== "string" ||
          !plugNames.has(plug["name"])
        ) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const body = (await request.json()) as { enabled?: boolean };
        if (typeof body.enabled === "boolean") {
          await adapter.togglePlugEnabled(plugId, body.enabled);
        }
        const updated = await adapter.getPlug(plugId);
        return Response.json(updated);
      },
    },
    {
      method: "PATCH",
      pattern: "flows/:flowId",
      auth: "authorize",
      handler: async ({ params, request }) => {
        const flowId = params["flowId"]!;
        const body = (await request.json()) as { enabled?: boolean };
        if (typeof body.enabled === "boolean") {
          await adapter.toggleFlowEnabled(flowId, body.enabled);
        }
        return Response.json({ id: flowId, ...body });
      },
    },
    {
      method: "PATCH",
      pattern: "webhook-handlers/:handlerId",
      auth: "authorize",
      handler: async ({ params, request }) => {
        const handlerId = params["handlerId"]!;
        const body = (await request.json()) as { enabled?: boolean };
        if (typeof body.enabled === "boolean") {
          await adapter.toggleWebhookHandlerEnabled(handlerId, body.enabled);
        }
        return Response.json({ id: handlerId, ...body });
      },
    },

    // --- PUT routes ---
    {
      method: "PUT",
      pattern: "mappings/:mappingId",
      auth: "authorize",
      handler: async ({ params, request }) => {
        const mappingId = params["mappingId"]!;
        const body = (await request.json()) as {
          resourceId: string;
          connectValue: string | string[];
          refs: Record<string, string>;
          metadata?: Record<string, unknown> | null;
        };
        try {
          const saved = await updateMapping(mappingId, body);
          return Response.json(saved);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Invalid mapping payload";
          return Response.json(
            { error: message },
            { status: message.includes("not found") ? 404 : 400 },
          );
        }
      },
    },

    // --- DELETE routes ---
    {
      method: "DELETE",
      pattern: "caches/:cacheName/:key",
      auth: "authorize",
      handler: async ({ params }) => {
        try {
          await createCacheInstance(params["cacheName"]!).delete(
            params["key"]!,
          );
          return new Response(null, { status: 204 });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Invalid cache request";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
    {
      method: "DELETE",
      pattern: "variables/:plugName",
      auth: "authorize",
      handler: async ({ params }) => {
        const plugName = params["plugName"]!;
        if (!plugNames.has(plugName)) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        await clearVars(plugName);
        return new Response(null, { status: 204 });
      },
    },
    {
      method: "DELETE",
      pattern: "wires/:plugName",
      auth: "authorize",
      handler: async ({ params, request }) => {
        const plugName = params["plugName"]!;
        if (!plugNames.has(plugName)) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const body = (await request.json()) as { wireId: string };
        if (!body.wireId) {
          return Response.json(
            { error: "wireId is required" },
            { status: 400 },
          );
        }
        try {
          await wire(plugName).delete(body.wireId);
          return new Response(null, { status: 204 });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          kd("wire", `${plugName}: delete failed: ${message}`);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
    {
      method: "DELETE",
      pattern: "mappings/:mappingId",
      auth: "authorize",
      handler: async ({ params }) => {
        const mappingId = params["mappingId"]!;
        const existing = await adapter.getMapping(mappingId);
        if (!existing) {
          return Response.json({ error: "Mapping not found" }, { status: 404 });
        }
        await adapter.deleteMapping(mappingId);
        return new Response(null, { status: 204 });
      },
    },
  ];

  // -------------------------------------------------------------------------
  // Request handler — matches against the route table
  // -------------------------------------------------------------------------

  async function handler(request: Request): Promise<Response> {
    await init();

    const url = new URL(request.url);
    const fullSegments = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean);

    // Strip the base prefix (everything before the khotan-managed segment).
    // The route patterns start from the first khotan-managed keyword.
    // Find where khotan routes begin by looking for a known first-segment keyword.
    const knownFirstSegments = new Set([
      "plugs",
      "flows",
      "resources",
      "caches",
      "mappings",
      "runs",
      "wires",
      "webhook-handlers",
      "webhook-events",
      "variables",
      "cron",
      "webhook",
      "debug",
    ]);

    let routeStartIdx = -1;
    for (let i = 0; i < fullSegments.length; i++) {
      if (knownFirstSegments.has(fullSegments[i]!)) {
        routeStartIdx = i;
        break;
      }
    }

    if (routeStartIdx === -1) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const pathSegments = fullSegments.slice(routeStartIdx);
    const match = matchRoute(request.method, pathSegments, routes);

    if (!match) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    // Auth gate
    const { route, params } = match;
    switch (route.auth) {
      case "cron":
        if (!isCronRequestAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        break;

      case "debug":
        if (!isDebugEnabled()) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        break;

      case "webhook":
        // Webhooks self-verify via onVerify — no management auth needed
        break;

      case "authorize":
        if (authorizeHook) {
          let allowed = await isCliRequestAuthorized(request, secret);
          if (!allowed) {
            try {
              allowed = await authorizeHook(request);
            } catch {
              allowed = false;
            }
          }
          if (!allowed) {
            return Response.json(
              {
                error: "Unauthorized",
                code: "authorize_rejected",
                hint:
                  "Management routes (/api/khotan/*) require your `authorize` hook to pass. " +
                  "KHOTAN_SECRET is an encryption key, not an HTTP credential — sending it as a " +
                  "Bearer token will not authenticate the request. To trigger a flow: call " +
                  "khotanData.flow(name).start() from server code (no HTTP/auth needed), or send a " +
                  "credential your authorize hook accepts (e.g. a session cookie or your own token). " +
                  "The khotan CLI authenticates automatically via a dev-only token derived from KHOTAN_SECRET.",
              },
              { status: 401 },
            );
          }
        }
        break;

      case "none":
        break;
    }

    return route.handler({
      request,
      params,
      url,
      searchParams: url.searchParams,
    });
  }

  // -------------------------------------------------------------------------
  // Runtime registry
  // -------------------------------------------------------------------------

  khotanRuntimeRegistry.set(instanceId, {
    cache: createCacheInstance,
    mapping: createMappingInstance,
    listMappings,
    lookupMapping,
    upsertMapping,
    updateMapping,
    deleteMapping,
  });

  function dispose(): void {
    khotanRuntimeRegistry.delete(instanceId);
  }

  return {
    handler,
    init,
    flow,
    wire,
    cache: createCacheInstance,
    mapping: createMappingInstance,
    listMappings,
    lookupMapping,
    upsertMapping,
    updateMapping,
    deleteMapping,
    getVars,
    setVars,
    clearVars,
    hasVars,
    getVarFields,
    getPlug,
    dispose,
  };
}

// ---------------------------------------------------------------------------
// toNextJsHandler
// ---------------------------------------------------------------------------

interface NextJsRequest extends Request {
  nextUrl?: URL;
}

interface NextJsRouteHandlers {
  GET: (req: NextJsRequest) => Promise<Response>;
  POST: (req: NextJsRequest) => Promise<Response>;
  PUT: (req: NextJsRequest) => Promise<Response>;
  PATCH: (req: NextJsRequest) => Promise<Response>;
  DELETE: (req: NextJsRequest) => Promise<Response>;
}

export function toNextJsHandler(
  factoryHandler: KhotanHandler,
): NextJsRouteHandlers {
  function handle(req: NextJsRequest): Promise<Response> {
    return factoryHandler(req);
  }

  return {
    GET: handle,
    POST: handle,
    PUT: handle,
    PATCH: handle,
    DELETE: handle,
  };
}
