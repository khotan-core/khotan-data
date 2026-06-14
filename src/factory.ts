import { and, eq, desc, sql, count, inArray } from "drizzle-orm";

declare const process: { env: Record<string, string | undefined> };

const _khotanDebug = process?.env?.["KHOTAN_DEBUG"];
function kd(scope: string, ...args: unknown[]) {
  if (_khotanDebug) console.log(`[khotan:${scope}]`, ...args);
}
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { PgDatabase } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Internal schema — mirrors the scaffolded template so the factory can query
// the same tables without importing from the user's project.
// ---------------------------------------------------------------------------

const khotanPlugs = pgTable("khotan_plugs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  baseUrl: text("base_url").notNull(),
  authType: text("auth_type", {
    enum: ["bearer", "basic", "apiKey", "custom"],
  }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  status: text("status", {
    enum: ["connected", "error", "idle"],
  })
    .default("idle")
    .notNull(),
  statusMessage: text("status_message"),
  encryptedVars: text("encrypted_vars"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

const khotanResources = pgTable("khotan_resources", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  connectField: text("connect_field").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

const khotanFlows = pgTable(
  "khotan_flows",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    plugId: text("plug_id").notNull(),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["inflow", "outflow", "relay", "webhook"],
    }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    schedule: text("schedule"),
    resourceId: text("resource_id"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastRunStatus: text("last_run_status", {
      enum: ["completed", "partial", "failed", "cancelled"],
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("khotan_flows_plug_id_name_unique").on(table.plugId, table.name),
    index("khotan_flows_plug_id_idx").on(table.plugId),
    index("khotan_flows_resource_id_idx").on(table.resourceId),
  ],
);

const khotanWires = pgTable(
  "khotan_wires",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    plugId: text("plug_id").notNull(),
    remoteId: text("remote_id").notNull(),
    callbackUrl: text("callback_url").notNull(),
    eventTypes: jsonb("event_types").notNull().$type<string[]>(),
    status: text("status", {
      enum: ["active", "disabled", "pending"],
    })
      .default("pending")
      .notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("khotan_wires_plug_id_idx").on(table.plugId),
    index("khotan_wires_status_idx").on(table.status),
  ],
);

const khotanWebhookHandlers = pgTable(
  "khotan_webhook_handlers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    wireId: text("wire_id").notNull(),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["catch", "pass"],
    }).notNull(),
    destinationPlugId: text("destination_plug_id"),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("khotan_webhook_handlers_wire_id_name_unique").on(
      table.wireId,
      table.name,
    ),
    index("khotan_webhook_handlers_wire_id_idx").on(table.wireId),
  ],
);

const khotanWebhookEvents = pgTable(
  "khotan_webhook_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    wireId: text("wire_id").notNull(),
    webhookHandlerId: text("webhook_handler_id").notNull(),
    khotanRunId: text("khotan_run_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    headers: jsonb("headers").notNull().$type<Record<string, string>>(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("khotan_webhook_events_wire_id_idx").on(table.wireId),
    index("khotan_webhook_events_webhook_handler_id_idx").on(
      table.webhookHandlerId,
    ),
    index("khotan_webhook_events_khotan_run_id_idx").on(table.khotanRunId),
    index("khotan_webhook_events_received_at_idx").on(table.receivedAt.desc()),
  ],
);

const khotanRuns = pgTable(
  "khotan_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    flowId: text("flow_id"),
    wireId: text("wire_id"),
    webhookHandlerId: text("webhook_handler_id"),
    workflowRunId: text("workflow_run_id"),
    runType: text("run_type", {
      enum: ["full", "delta", "backfill", "reconcile", "dry-run", "webhook"],
    }).notNull(),
    status: text("status", {
      enum: [
        "pending",
        "running",
        "completed",
        "partial",
        "failed",
        "cancelled",
      ],
    })
      .default("pending")
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    extracted: integer("extracted").default(0).notNull(),
    transformed: integer("transformed").default(0).notNull(),
    created: integer("created").default(0).notNull(),
    updated: integer("updated").default(0).notNull(),
    deleted: integer("deleted").default(0).notNull(),
    failed: integer("failed").default(0).notNull(),
    error: text("error"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("khotan_runs_flow_id_idx").on(table.flowId),
    index("khotan_runs_wire_id_idx").on(table.wireId),
    index("khotan_runs_webhook_handler_id_idx").on(table.webhookHandlerId),
    index("khotan_runs_status_idx").on(table.status),
    index("khotan_runs_flow_id_started_at_idx").on(
      table.flowId,
      table.startedAt.desc(),
    ),
  ],
);

const khotanMappingsTable = pgTable(
  "khotan_mappings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    resourceId: text("resource_id").notNull(),
    connectValue: text("connect_value").notNull(),
    refs: jsonb("refs").notNull().$type<Record<string, string>>().default({}),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("khotan_mappings_resource_id_connect_value_unique").on(
      table.resourceId,
      table.connectValue,
    ),
    index("khotan_mappings_resource_id_idx").on(table.resourceId),
    index("khotan_mappings_refs_gin_idx").using("gin", table.refs),
  ],
);

const khotanCaches = pgTable(
  "khotan_caches",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull().unique(),
    scope: jsonb("scope").$type<CacheScope>(),
    ttlSeconds: integer("ttl_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("khotan_caches_name_idx").on(table.name)],
);

const khotanCacheEntries = pgTable(
  "khotan_cache_entries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    cacheId: text("cache_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull().$type<unknown>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("khotan_cache_entries_cache_id_key_unique").on(
      table.cacheId,
      table.key,
    ),
    index("khotan_cache_entries_cache_id_idx").on(table.cacheId),
    index("khotan_cache_entries_cache_id_key_idx").on(table.cacheId, table.key),
    index("khotan_cache_entries_expires_at_idx").on(table.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Encryption — AES-256-GCM for var store
// ---------------------------------------------------------------------------

async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoded = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptVars(plaintext: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret);
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToHex(combined);
}

async function decryptVars(encrypted: string, secret: string): Promise<string> {
  const combined = hexToBytes(encrypted);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const key = await deriveKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// CLI authentication — dev-only HMAC bearer derived from KHOTAN_SECRET
// ---------------------------------------------------------------------------

/** Authorization scheme used by the khotan CLI. Distinct from `Bearer` so it
 * never collides with a consumer's own token auth in their `authorize` hook. */
const CLI_TOKEN_SCHEME = "KhotanCLI";

/** Max clock skew between the CLI signing the token and the server verifying
 * it. Keeps a logged token from being replayable beyond a short window. */
const CLI_TOKEN_WINDOW_MS = 60_000;

/**
 * Derives the CLI auth token: HMAC-SHA256 over the timestamp, keyed by the
 * KHOTAN_SECRET. One-way, so the raw secret (the encryption key) never travels
 * over the wire — even a token captured from a dev log can't be reversed into
 * the secret. Exported so the CLI can compute the same value.
 */
export async function deriveCliToken(
  secret: string,
  timestamp: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`khotan-cli:${timestamp}`),
  );
  return bytesToHex(new Uint8Array(sig));
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifies the dev-only CLI auth token on a request. The khotan CLI is a local
 * tool that hits the dev server over loopback; instead of sending the raw
 * KHOTAN_SECRET, it sends a timestamped HMAC derived from it
 * (`Authorization: KhotanCLI <timestamp>.<hmac>`).
 *
 * Returns true only when ALL of the following hold:
 * - `NODE_ENV` is not `"production"` (the bypass never applies on a deployed app),
 * - a `KHOTAN_SECRET` is configured,
 * - the timestamp is within {@link CLI_TOKEN_WINDOW_MS} of now (anti-replay), and
 * - the HMAC matches (constant-time comparison).
 */
async function isCliRequestAuthorized(
  request: Request,
  secret: string | undefined,
): Promise<boolean> {
  if (process.env["NODE_ENV"] === "production") return false;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (!header?.startsWith(`${CLI_TOKEN_SCHEME} `)) return false;

  const token = header.slice(CLI_TOKEN_SCHEME.length + 1).trim();
  const dotIdx = token.indexOf(".");
  if (dotIdx === -1) return false;

  const timestamp = token.slice(0, dotIdx);
  const provided = token.slice(dotIdx + 1);
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > CLI_TOKEN_WINDOW_MS) return false;

  const expected = await deriveCliToken(secret, timestamp);
  return timingSafeEqualHex(provided, expected);
}

// ---------------------------------------------------------------------------
// Types
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
    options?: { headers?: Record<string, string> },
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
      headers?: Record<string, string>;
      vars?: Record<string, string>;
      _setVars?: (updates: Record<string, string>) => Promise<void>;
    },
  ): Promise<T>;
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
  runType: string;
  body?: unknown;
  vars: Record<string, string>;
  setVars(updates: Record<string, string>): Promise<void>;
  cache(cacheName: string): CacheInstance;
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
  runType: string;
  body?: unknown;
  vars: Record<string, string>;
  plugVarsByName?: Record<string, Record<string, string>>;
  khotanRunId: string;
  khotanInstanceId: string;
}

function bindPlugWithVars(
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
    delete<T>(path: string, extra?: { headers?: Record<string, string> }) {
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
  schedule?: string;
  resource?: string;
  to?: string;
  workflow?(ctx: FlowWorkflowContext): Promise<FlowRunResult | void>;
  run?(ctx: FlowRunContext): Promise<FlowRunResult | void>;
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

interface KhotanWorkflowContextRef {
  khotanInstanceId: string;
}

interface KhotanWorkflowRuntimeHelpers {
  cache(cacheName: string): CacheInstance;
  listMappings: KhotanInstance["listMappings"];
  lookupMapping: KhotanInstance["lookupMapping"];
  upsertMapping: KhotanInstance["upsertMapping"];
  updateMapping: KhotanInstance["updateMapping"];
  deleteMapping: KhotanInstance["deleteMapping"];
}

const khotanRuntimeRegistry = new Map<string, KhotanWorkflowRuntimeHelpers>();

function getWorkflowRuntimeHelpers(
  ctx: KhotanWorkflowContextRef,
): KhotanWorkflowRuntimeHelpers {
  const helpers = khotanRuntimeRegistry.get(ctx.khotanInstanceId);
  if (!helpers) {
    throw new Error(
      `Khotan runtime helpers for instance "${ctx.khotanInstanceId}" are not registered`,
    );
  }
  return helpers;
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
  getCacheEntry(cacheId: string, key: string): Promise<Record<string, unknown> | null>;
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
    runType: string;
    status: string;
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
export type KhotanAuthorize = (
  request: Request,
) => boolean | Promise<boolean>;

export interface KhotanConfig {
  adapter: KhotanAdapter;
  plugs: PlugRegistration[];
  resources?: ResourceRegistration[];
  caches?: CacheRegistration[];
  secret?: string;
  /**
   * Gate every management route (plugs, variables, flows, runs, wires,
   * mappings, caches, resources, webhook handlers/events) behind a custom
   * authorization check. Strongly recommended for any deployed app — without
   * it the management API is publicly accessible. See {@link KhotanAuthorize}.
   */
  authorize?: KhotanAuthorize;
}

export type KhotanHandler = (request: Request) => Promise<Response>;

export interface WireInstance {
  create(callbackUrl: string): Promise<Record<string, unknown>>;
  delete(wireId: string): Promise<void>;
  get(): Promise<Record<string, unknown> | null>;
}

export interface FlowStartOptions {
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
}

// ---------------------------------------------------------------------------
// drizzleAdapter
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function drizzleAdapter(db: PgDatabase<any, any, any>): KhotanAdapter {
  return {
    async upsertPlug(plug) {
      const rows = await db
        .insert(khotanPlugs)
        .values({
          name: plug.name,
          baseUrl: plug.baseUrl,
          authType: plug.authType as "bearer" | "basic" | "apiKey" | "custom",
        })
        .onConflictDoUpdate({
          target: khotanPlugs.name,
          set: {
            baseUrl: plug.baseUrl,
            authType: plug.authType as "bearer" | "basic" | "apiKey" | "custom",
            updatedAt: new Date(),
          },
        })
        .returning({ id: khotanPlugs.id });
      return { id: rows[0]!.id };
    },

    async upsertFlow(flow) {
      const rows = await db
        .insert(khotanFlows)
        .values({
          plugId: flow.plugId,
          name: flow.name,
          type: flow.type as FlowType,
          schedule: flow.schedule ?? null,
        })
        .onConflictDoUpdate({
          target: [khotanFlows.plugId, khotanFlows.name],
          set: {
            type: flow.type as FlowType,
            schedule: flow.schedule ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: khotanFlows.id });
      return { id: rows[0]!.id };
    },

    async listPlugs() {
      const flowCounts = db
        .select({
          plugId: khotanFlows.plugId,
          flowCount: count(khotanFlows.id).as("flow_count"),
        })
        .from(khotanFlows)
        .groupBy(khotanFlows.plugId)
        .as("flow_counts");

      const rows = await db
        .select({
          id: khotanPlugs.id,
          name: khotanPlugs.name,
          baseUrl: khotanPlugs.baseUrl,
          authType: khotanPlugs.authType,
          enabled: khotanPlugs.enabled,
          status: khotanPlugs.status,
          statusMessage: khotanPlugs.statusMessage,
          createdAt: khotanPlugs.createdAt,
          updatedAt: khotanPlugs.updatedAt,
          flowCount: sql<number>`coalesce(${flowCounts.flowCount}, 0)`,
        })
        .from(khotanPlugs)
        .leftJoin(flowCounts, eq(khotanPlugs.id, flowCounts.plugId));

      return rows;
    },

    async getPlug(id) {
      const rows = await db
        .select()
        .from(khotanPlugs)
        .where(eq(khotanPlugs.id, id))
        .limit(1);
      return rows[0] ?? null;
    },

    async getPlugFlows(plugId) {
      return db
        .select()
        .from(khotanFlows)
        .where(eq(khotanFlows.plugId, plugId));
    },

    async getFlow(flowId) {
      const rows = await db
        .select({
          id: khotanFlows.id,
          plugId: khotanFlows.plugId,
          name: khotanFlows.name,
          type: khotanFlows.type,
          enabled: khotanFlows.enabled,
          schedule: khotanFlows.schedule,
          resourceId: khotanFlows.resourceId,
          lastRunAt: khotanFlows.lastRunAt,
          lastRunStatus: khotanFlows.lastRunStatus,
          createdAt: khotanFlows.createdAt,
          updatedAt: khotanFlows.updatedAt,
          plugName: khotanPlugs.name,
        })
        .from(khotanFlows)
        .leftJoin(khotanPlugs, eq(khotanFlows.plugId, khotanPlugs.id))
        .where(eq(khotanFlows.id, flowId))
        .limit(1);
      return rows[0] ?? null;
    },

    async listFlows() {
      const rows = await db
        .select({
          id: khotanFlows.id,
          plugId: khotanFlows.plugId,
          name: khotanFlows.name,
          type: khotanFlows.type,
          enabled: khotanFlows.enabled,
          schedule: khotanFlows.schedule,
          resourceId: khotanFlows.resourceId,
          lastRunAt: khotanFlows.lastRunAt,
          lastRunStatus: khotanFlows.lastRunStatus,
          createdAt: khotanFlows.createdAt,
          updatedAt: khotanFlows.updatedAt,
          plugName: khotanPlugs.name,
        })
        .from(khotanFlows)
        .leftJoin(khotanPlugs, eq(khotanFlows.plugId, khotanPlugs.id));

      return rows;
    },

    async listRuns(flowId) {
      return db
        .select()
        .from(khotanRuns)
        .where(eq(khotanRuns.flowId, flowId))
        .orderBy(desc(khotanRuns.startedAt));
    },

    async getRun(runId) {
      const rows = await db
        .select()
        .from(khotanRuns)
        .where(eq(khotanRuns.id, runId))
        .limit(1);
      return rows[0] ?? null;
    },

    async listRunsPage({ limit, offset }) {
      const rows = await db
        .select()
        .from(khotanRuns)
        .orderBy(desc(khotanRuns.startedAt))
        .limit(limit + 1)
        .offset(offset);

      const hasMore = rows.length > limit;
      const pageRows = rows.slice(0, limit);

      const flowIds = [
        ...new Set(
          pageRows
            .map((row) => row.flowId)
            .filter((value): value is string => typeof value === "string"),
        ),
      ];
      const handlerIds = [
        ...new Set(
          pageRows
            .map((row) => row.webhookHandlerId)
            .filter((value): value is string => typeof value === "string"),
        ),
      ];

      const flowRows =
        flowIds.length > 0
          ? await db
              .select({
                id: khotanFlows.id,
                name: khotanFlows.name,
                plugName: khotanPlugs.name,
              })
              .from(khotanFlows)
              .leftJoin(khotanPlugs, eq(khotanFlows.plugId, khotanPlugs.id))
              .where(inArray(khotanFlows.id, flowIds))
          : [];

      const handlerRows =
        handlerIds.length > 0
          ? await db
              .select({
                id: khotanWebhookHandlers.id,
                name: khotanWebhookHandlers.name,
                type: khotanWebhookHandlers.type,
                plugName: khotanPlugs.name,
              })
              .from(khotanWebhookHandlers)
              .leftJoin(
                khotanWires,
                eq(khotanWebhookHandlers.wireId, khotanWires.id),
              )
              .leftJoin(khotanPlugs, eq(khotanWires.plugId, khotanPlugs.id))
              .where(inArray(khotanWebhookHandlers.id, handlerIds))
          : [];

      const flowMap = new Map(flowRows.map((row) => [row.id, row]));
      const handlerMap = new Map(handlerRows.map((row) => [row.id, row]));

      return {
        items: pageRows.map((row) => {
          const flow = row.flowId ? flowMap.get(row.flowId) : null;
          const handler = row.webhookHandlerId
            ? handlerMap.get(row.webhookHandlerId)
            : null;
          return {
            ...row,
            sourceType: flow ? "flow" : handler ? "webhook" : "unknown",
            sourceName: flow?.name ?? handler?.name ?? null,
            sourceKind: handler?.type ?? null,
            plugName: flow?.plugName ?? handler?.plugName ?? null,
          };
        }),
        hasMore,
      };
    },

    async upsertResource(resource) {
      const rows = await db
        .insert(khotanResources)
        .values({
          name: resource.name,
          connectField: serializeConnectField(resource.connectField),
          description: resource.description ?? null,
        })
        .onConflictDoUpdate({
          target: khotanResources.name,
          set: {
            connectField: serializeConnectField(resource.connectField),
            description: resource.description ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: khotanResources.id });
      return { id: rows[0]!.id };
    },

    async upsertCache(cache) {
      const rows = await db
        .insert(khotanCaches)
        .values({
          name: cache.name,
          scope: cache.scope ?? null,
          ttlSeconds: cache.ttlSeconds ?? null,
        })
        .onConflictDoUpdate({
          target: khotanCaches.name,
          set: {
            scope: cache.scope ?? null,
            ttlSeconds: cache.ttlSeconds ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: khotanCaches.id });
      return { id: rows[0]!.id };
    },

    async getCacheByName(name) {
      const rows = await db
        .select()
        .from(khotanCaches)
        .where(eq(khotanCaches.name, name))
        .limit(1);
      return rows[0] ?? null;
    },

    async getCacheEntry(cacheId, key) {
      const rows = await db
        .select({
          id: khotanCacheEntries.id,
          cacheId: khotanCacheEntries.cacheId,
          key: khotanCacheEntries.key,
          value: khotanCacheEntries.value,
          expiresAt: khotanCacheEntries.expiresAt,
          createdAt: khotanCacheEntries.createdAt,
          updatedAt: khotanCacheEntries.updatedAt,
        })
        .from(khotanCacheEntries)
        .where(
          and(
            eq(khotanCacheEntries.cacheId, cacheId),
            eq(khotanCacheEntries.key, key),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async upsertCacheEntry(entry) {
      const existing = await db
        .select({ id: khotanCacheEntries.id })
        .from(khotanCacheEntries)
        .where(
          and(
            eq(khotanCacheEntries.cacheId, entry.cacheId),
            eq(khotanCacheEntries.key, entry.key),
          ),
        )
        .limit(1);

      const rows = await db
        .insert(khotanCacheEntries)
        .values({
          cacheId: entry.cacheId,
          key: entry.key,
          value: entry.value,
          expiresAt: entry.expiresAt ?? null,
        })
        .onConflictDoUpdate({
          target: [khotanCacheEntries.cacheId, khotanCacheEntries.key],
          set: {
            value: entry.value,
            expiresAt: entry.expiresAt ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: khotanCacheEntries.id });

      return { id: rows[0]!.id, created: existing.length === 0 };
    },

    async deleteCacheEntry(cacheId, key) {
      await db
        .delete(khotanCacheEntries)
        .where(
          and(
            eq(khotanCacheEntries.cacheId, cacheId),
            eq(khotanCacheEntries.key, key),
          ),
        );
    },

    async listResources() {
      const flowCounts = db
        .select({
          resourceId: khotanFlows.resourceId,
          flowCount: count(khotanFlows.id).as("flow_count"),
        })
        .from(khotanFlows)
        .where(sql`${khotanFlows.resourceId} is not null`)
        .groupBy(khotanFlows.resourceId)
        .as("flow_counts");

      const mappingCounts = db
        .select({
          resourceId: khotanMappingsTable.resourceId,
          mappingCount: count(khotanMappingsTable.id).as("mapping_count"),
        })
        .from(khotanMappingsTable)
        .groupBy(khotanMappingsTable.resourceId)
        .as("mapping_counts");

      const rows = await db
        .select({
          id: khotanResources.id,
          name: khotanResources.name,
          connectField: khotanResources.connectField,
          description: khotanResources.description,
          createdAt: khotanResources.createdAt,
          updatedAt: khotanResources.updatedAt,
          flowCount: sql<number>`coalesce(${flowCounts.flowCount}, 0)`,
          mappingCount: sql<number>`coalesce(${mappingCounts.mappingCount}, 0)`,
        })
        .from(khotanResources)
        .leftJoin(flowCounts, eq(khotanResources.id, flowCounts.resourceId))
        .leftJoin(
          mappingCounts,
          eq(khotanResources.id, mappingCounts.resourceId),
        );

      return rows.map((row) => ({
        ...row,
        connectField: deserializeConnectField(row.connectField),
      }));
    },

    async getResource(id) {
      const rows = await db
        .select()
        .from(khotanResources)
        .where(eq(khotanResources.id, id))
        .limit(1);
      if (!rows[0]) return null;
      return {
        ...rows[0],
        connectField: deserializeConnectField(rows[0].connectField),
      };
    },

    async getResourceFlows(resourceId) {
      return db
        .select()
        .from(khotanFlows)
        .where(eq(khotanFlows.resourceId, resourceId));
    },

    async upsertMapping(mapping) {
      if (mapping.id) {
        const rows = await db
          .update(khotanMappingsTable)
          .set({
            resourceId: mapping.resourceId,
            connectValue: mapping.connectValue,
            refs: mapping.refs,
            metadata: mapping.metadata ?? null,
            updatedAt: new Date(),
          })
          .where(eq(khotanMappingsTable.id, mapping.id))
          .returning({ id: khotanMappingsTable.id });
        return { id: rows[0]!.id, created: false };
      }

      const existing = await db
        .select({ id: khotanMappingsTable.id })
        .from(khotanMappingsTable)
        .where(
          sql`${khotanMappingsTable.resourceId} = ${mapping.resourceId} and ${khotanMappingsTable.connectValue} = ${mapping.connectValue}`,
        )
        .limit(1);

      const rows = await db
        .insert(khotanMappingsTable)
        .values({
          resourceId: mapping.resourceId,
          connectValue: mapping.connectValue,
          refs: mapping.refs,
          metadata: mapping.metadata ?? null,
        })
        .onConflictDoUpdate({
          target: [khotanMappingsTable.resourceId, khotanMappingsTable.connectValue],
          set: {
            refs: sql`${khotanMappingsTable.refs} || ${JSON.stringify(mapping.refs)}::jsonb`,
            metadata: mapping.metadata ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: khotanMappingsTable.id });
      return { id: rows[0]!.id, created: existing.length === 0 };
    },

    async getMapping(id) {
      const rows = await db
        .select()
        .from(khotanMappingsTable)
        .where(eq(khotanMappingsTable.id, id))
        .limit(1);
      return rows[0] ?? null;
    },

    async listMappings({ resourceId, limit, offset, search }) {
      const normalizedSearch = search?.trim();
      const searchPattern = normalizedSearch
        ? `%${normalizedSearch.replace(/[%_]/g, "\\$&")}%`
        : null;

      const filters = searchPattern
        ? sql`${khotanMappingsTable.resourceId} = ${resourceId} and (${khotanMappingsTable.connectValue} ilike ${searchPattern} escape '\\' or ${khotanMappingsTable.refs}::text ilike ${searchPattern} escape '\\' or ${khotanMappingsTable.metadata}::text ilike ${searchPattern} escape '\\')`
        : sql`${khotanMappingsTable.resourceId} = ${resourceId}`;

      const totalRows = await db
        .select({ total: count(khotanMappingsTable.id) })
        .from(khotanMappingsTable)
        .where(filters);

      const rows = await db
        .select()
        .from(khotanMappingsTable)
        .where(filters)
        .orderBy(khotanMappingsTable.connectValue, khotanMappingsTable.id)
        .limit(limit + 1)
        .offset(offset);

      return {
        items: rows.slice(0, limit),
        hasMore: rows.length > limit,
        total: totalRows[0]?.total ?? 0,
      };
    },

    async deleteMapping(id) {
      await db.delete(khotanMappingsTable).where(eq(khotanMappingsTable.id, id));
    },

    async lookupMapping(params) {
      if ("connectValue" in params) {
        const rows = await db
          .select()
          .from(khotanMappingsTable)
          .where(
            sql`${khotanMappingsTable.resourceId} = ${params.resourceId} and ${khotanMappingsTable.connectValue} = ${params.connectValue}`,
          )
          .limit(1);
        return rows[0] ?? null;
      }

      const rows = await db
        .select()
        .from(khotanMappingsTable)
        .where(
          sql`${khotanMappingsTable.resourceId} = ${params.resourceId} and ${khotanMappingsTable.refs}->>${params.plugName} = ${params.ref}`,
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async updateFlowResourceId(flowId, resourceId) {
      await db
        .update(khotanFlows)
        .set({ resourceId, updatedAt: new Date() })
        .where(eq(khotanFlows.id, flowId));
    },

    async togglePlugEnabled(plugId, enabled) {
      await db
        .update(khotanPlugs)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(khotanPlugs.id, plugId));
    },

    async toggleFlowEnabled(flowId, enabled) {
      await db
        .update(khotanFlows)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(khotanFlows.id, flowId));
    },

    async toggleWebhookHandlerEnabled(handlerId, enabled) {
      await db
        .update(khotanWebhookHandlers)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(khotanWebhookHandlers.id, handlerId));
    },

    async insertWire(wire) {
      const rows = await db
        .insert(khotanWires)
        .values({
          plugId: wire.plugId,
          remoteId: wire.remoteId,
          callbackUrl: wire.callbackUrl,
          eventTypes: wire.eventTypes,
          status: "active",
        })
        .returning();
      return { id: rows[0]!.id };
    },

    async upsertWire(wire) {
      const existing = await db
        .select({ id: khotanWires.id })
        .from(khotanWires)
        .where(eq(khotanWires.plugId, wire.plugId))
        .limit(1);

      if (existing.length > 0) {
        return { id: existing[0]!.id };
      }

      const rows = await db
        .insert(khotanWires)
        .values({
          plugId: wire.plugId,
          remoteId: "",
          callbackUrl: "",
          eventTypes: [],
          status: "pending",
        })
        .returning();
      return { id: rows[0]!.id };
    },

    async getActiveWire(plugId) {
      const rows = await db
        .select()
        .from(khotanWires)
        .where(
          sql`${khotanWires.plugId} = ${plugId} and ${khotanWires.status} = 'active'`,
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async getPlugWire(plugId) {
      const rows = await db
        .select()
        .from(khotanWires)
        .where(eq(khotanWires.plugId, plugId))
        .limit(1);
      return rows[0] ?? null;
    },

    async getWire(wireId) {
      const rows = await db
        .select()
        .from(khotanWires)
        .where(eq(khotanWires.id, wireId))
        .limit(1);
      return rows[0] ?? null;
    },

    async updateWireStatus(wireId, status) {
      await db
        .update(khotanWires)
        .set({ status, updatedAt: new Date() })
        .where(eq(khotanWires.id, wireId));
    },

    async updateWireDetails(wireId, details) {
      await db
        .update(khotanWires)
        .set({
          remoteId: details.remoteId,
          callbackUrl: details.callbackUrl,
          eventTypes: details.eventTypes,
          status: details.status,
          updatedAt: new Date(),
        })
        .where(eq(khotanWires.id, wireId));
    },

    async getWireMetadata(wireId) {
      const rows = await db
        .select({ metadata: khotanWires.metadata })
        .from(khotanWires)
        .where(eq(khotanWires.id, wireId))
        .limit(1);
      const meta = rows[0]?.metadata;
      if (!meta) return null;
      return typeof meta === "string" ? meta : JSON.stringify(meta);
    },

    async updateWireMetadata(wireId, metadata) {
      await db
        .update(khotanWires)
        .set({ metadata, updatedAt: new Date() })
        .where(eq(khotanWires.id, wireId));
    },

    async getEncryptedVariables(plugId) {
      const rows = await db
        .select({ encryptedVars: khotanPlugs.encryptedVars })
        .from(khotanPlugs)
        .where(eq(khotanPlugs.id, plugId))
        .limit(1);
      return rows[0]?.encryptedVars ?? null;
    },

    async setEncryptedVariables(plugId, encrypted) {
      await db
        .update(khotanPlugs)
        .set({ encryptedVars: encrypted, updatedAt: new Date() })
        .where(eq(khotanPlugs.id, plugId));
    },

    async clearEncryptedVariables(plugId) {
      await db
        .update(khotanPlugs)
        .set({ encryptedVars: null, updatedAt: new Date() })
        .where(eq(khotanPlugs.id, plugId));
    },

    async upsertWebhookHandler(handler) {
      const rows = await db
        .insert(khotanWebhookHandlers)
        .values({
          wireId: handler.wireId,
          name: handler.name,
          type: handler.type,
          destinationPlugId: handler.destinationPlugId ?? null,
        })
        .onConflictDoUpdate({
          target: [khotanWebhookHandlers.wireId, khotanWebhookHandlers.name],
          set: {
            type: handler.type,
            destinationPlugId: handler.destinationPlugId ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: khotanWebhookHandlers.id });
      return { id: rows[0]!.id };
    },

    async listWebhookHandlers(wireId) {
      return db
        .select()
        .from(khotanWebhookHandlers)
        .where(eq(khotanWebhookHandlers.wireId, wireId));
    },

    async getLatestWebhookHandlerRun(handlerId) {
      const rows = await db
        .select({
          id: khotanRuns.id,
          status: khotanRuns.status,
          startedAt: khotanRuns.startedAt,
        })
        .from(khotanRuns)
        .where(eq(khotanRuns.webhookHandlerId, handlerId))
        .orderBy(desc(khotanRuns.startedAt))
        .limit(1);
      return rows[0] ?? null;
    },

    async insertRun(run) {
      const rows = await db
        .insert(khotanRuns)
        .values({
          flowId: run.flowId ?? null,
          wireId: run.wireId ?? null,
          webhookHandlerId: run.webhookHandlerId ?? null,
          workflowRunId: run.workflowRunId ?? null,
          runType: run.runType as
            | "full"
            | "delta"
            | "backfill"
            | "reconcile"
            | "dry-run"
            | "webhook",
          status: run.status as KhotanRunStatus,
        })
        .returning({ id: khotanRuns.id });
      return { id: rows[0]!.id };
    },

    async updateRun(runId, updates) {
      await db
        .update(khotanRuns)
        .set({
          status: updates.status,
          workflowRunId: updates.workflowRunId,
          completedAt: updates.completedAt,
          durationMs: updates.durationMs,
          extracted: updates.extracted,
          transformed: updates.transformed,
          created: updates.created,
          updated: updates.updated,
          deleted: updates.deleted,
          failed: updates.failed,
          error: updates.error,
          metadata: updates.metadata,
        })
        .where(eq(khotanRuns.id, runId));
    },

    async insertWebhookEvent(event) {
      const rows = await db
        .insert(khotanWebhookEvents)
        .values({
          wireId: event.wireId,
          webhookHandlerId: event.webhookHandlerId,
          khotanRunId: event.khotanRunId,
          eventType: event.eventType,
          payload: event.payload,
          headers: event.headers,
        })
        .returning({ id: khotanWebhookEvents.id });
      return { id: rows[0]!.id };
    },

    async listWebhookEventsPage({ limit, offset }) {
      let rows: {
        id: string;
        wireId: string | null;
        webhookHandlerId: string | null;
        khotanRunId: string;
        eventType: string;
        payload: Record<string, unknown>;
        headers: Record<string, string>;
        receivedAt: Date;
      }[];

      try {
        rows = await db
          .select()
          .from(khotanWebhookEvents)
          .orderBy(desc(khotanWebhookEvents.receivedAt))
          .limit(limit + 1)
          .offset(offset);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isLegacyShapeError =
          message.includes(`column "wire_id" does not exist`) ||
          message.includes(`column "webhook_handler_id" does not exist`) ||
          message.includes(`column "headers" does not exist`);

        if (!isLegacyShapeError) {
          throw error;
        }

        const legacyResult = await db.execute(sql`
          select
            "id",
            null::text as "wire_id",
            null::text as "webhook_handler_id",
            "khotan_run_id",
            "event_type",
            "payload",
            '{}'::jsonb as "headers",
            "received_at"
          from "khotan_webhook_events"
          order by "received_at" desc
          limit ${limit + 1}
          offset ${offset}
        `);

        const rawRows: Record<string, unknown>[] = Array.isArray(legacyResult)
          ? (legacyResult as Record<string, unknown>[])
          : "rows" in legacyResult && Array.isArray(legacyResult.rows)
            ? (legacyResult.rows as Record<string, unknown>[])
            : [];

        rows = rawRows.map((row) => ({
          id: String(row["id"]),
          wireId: typeof row["wire_id"] === "string" ? row["wire_id"] : null,
          webhookHandlerId:
            typeof row["webhook_handler_id"] === "string"
              ? row["webhook_handler_id"]
              : null,
          khotanRunId: String(row["khotan_run_id"]),
          eventType: String(row["event_type"]),
          payload:
            row["payload"] && typeof row["payload"] === "object"
              ? (row["payload"] as Record<string, unknown>)
              : {},
          headers:
            row["headers"] && typeof row["headers"] === "object"
              ? (row["headers"] as Record<string, string>)
              : {},
          receivedAt:
            row["received_at"] instanceof Date
              ? row["received_at"]
              : new Date(String(row["received_at"])),
        }));
      }

      const hasMore = rows.length > limit;
      const pageRows = rows.slice(0, limit);

      const handlerIds = [
        ...new Set(
          pageRows
            .map((row) => row.webhookHandlerId)
            .filter((value): value is string => typeof value === "string"),
        ),
      ];
      const runIds = [
        ...new Set(
          pageRows
            .map((row) => row.khotanRunId)
            .filter((value): value is string => typeof value === "string"),
        ),
      ];

      const handlerRows =
        handlerIds.length > 0
          ? await db
              .select({
                id: khotanWebhookHandlers.id,
                name: khotanWebhookHandlers.name,
                type: khotanWebhookHandlers.type,
                plugName: khotanPlugs.name,
              })
              .from(khotanWebhookHandlers)
              .leftJoin(
                khotanWires,
                eq(khotanWebhookHandlers.wireId, khotanWires.id),
              )
              .leftJoin(khotanPlugs, eq(khotanWires.plugId, khotanPlugs.id))
              .where(inArray(khotanWebhookHandlers.id, handlerIds))
          : [];

      const runRows =
        runIds.length > 0
          ? await db
              .select({
                id: khotanRuns.id,
                workflowRunId: khotanRuns.workflowRunId,
                status: khotanRuns.status,
                startedAt: khotanRuns.startedAt,
              })
              .from(khotanRuns)
              .where(inArray(khotanRuns.id, runIds))
          : [];

      const handlerMap = new Map(handlerRows.map((row) => [row.id, row]));
      const runMap = new Map(runRows.map((row) => [row.id, row]));

      return {
        items: pageRows.map((row) => {
          const handler = row.webhookHandlerId
            ? handlerMap.get(row.webhookHandlerId)
            : undefined;
          const run = runMap.get(row.khotanRunId);
          return {
            ...row,
            handlerName: handler?.name ?? null,
            handlerType: handler?.type ?? null,
            plugName: handler?.plugName ?? null,
            workflowRunId: run?.workflowRunId ?? null,
            runStatus: run?.status ?? null,
            runStartedAt: run?.startedAt ?? null,
          };
        }),
        hasMore,
      };
    },

    async updateFlowLastRun(flowId, updates) {
      await db
        .update(khotanFlows)
        .set({
          lastRunAt: updates.lastRunAt,
          lastRunStatus: updates.lastRunStatus,
          updatedAt: new Date(),
        })
        .where(eq(khotanFlows.id, flowId));
    },
  };
}

// ---------------------------------------------------------------------------
// Workflow integration — dynamic import of workflow/api
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkflowStartFn = (
  workflowFn: (...args: any[]) => any,
  args: unknown[],
) => Promise<unknown>;
interface WorkflowRunHandle {
  runId?: string;
  status?: Promise<string>;
  returnValue?: Promise<unknown>;
  cancel?: () => Promise<void>;
  getReadable?: (options?: {
    startIndex?: number;
    namespace?: string;
  }) => ReadableStream;
}
type WorkflowGetRunFn = (runId: string) => WorkflowRunHandle;
type WorkflowGetWritableFn = <T = unknown>(options?: {
  namespace?: string;
}) => WritableStream<T>;

let _workflowStart: WorkflowStartFn | null = null;
let _workflowGetRun: WorkflowGetRunFn | null = null;
let _workflowGetWritable: WorkflowGetWritableFn | null = null;

export function __setWorkflowStartForTests(
  start: WorkflowStartFn | null,
): void {
  _workflowStart = start;
}

export function __setWorkflowGetRunForTests(
  getRun: WorkflowGetRunFn | null,
): void {
  _workflowGetRun = getRun;
}

export function __setWorkflowGetWritableForTests(
  getWritable: WorkflowGetWritableFn | null,
): void {
  _workflowGetWritable = getWritable;
}

async function importWorkflowStart(): Promise<WorkflowStartFn> {
  if (_workflowStart) return _workflowStart;
  try {
    const mod = (await import(/* webpackIgnore: true */ "workflow/api")) as {
      start: WorkflowStartFn;
    };
    _workflowStart = mod.start;
    return _workflowStart;
  } catch {
    throw new Error(
      "Failed to import workflow/api. Install Vercel Workflow: npm install workflow",
    );
  }
}

async function importWorkflowGetRun(): Promise<WorkflowGetRunFn> {
  if (_workflowGetRun) return _workflowGetRun;
  try {
    const mod = (await import(/* webpackIgnore: true */ "workflow/api")) as {
      getRun: WorkflowGetRunFn;
    };
    _workflowGetRun = mod.getRun;
    return _workflowGetRun;
  } catch {
    throw new Error(
      "Failed to import workflow/api. Install Vercel Workflow: npm install workflow",
    );
  }
}

async function importWorkflowGetWritable(): Promise<WorkflowGetWritableFn> {
  if (_workflowGetWritable) return _workflowGetWritable;
  try {
    const mod = (await import(/* webpackIgnore: true */ "workflow")) as {
      getWritable: WorkflowGetWritableFn;
    };
    _workflowGetWritable = mod.getWritable;
    return _workflowGetWritable;
  } catch {
    throw new Error(
      "Failed to import workflow. Install Vercel Workflow: npm install workflow",
    );
  }
}

export async function sendUpdate(
  update: KhotanRunUpdate | string,
  options: { namespace?: string } = {},
): Promise<void> {
  const getWritable = await importWorkflowGetWritable();
  const writable = getWritable<string>(options);
  const writer = writable.getWriter();
  const payload =
    typeof update === "string"
      ? { type: "log", message: update }
      : { type: "progress", ...update };

  try {
    await writer.write(
      `${JSON.stringify({ ...payload, timestamp: new Date().toISOString() })}\n`,
    );
  } finally {
    writer.releaseLock();
  }
}

function getWorkflowRunId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  if ("runId" in result) return String(result.runId);
  if ("id" in result) return String(result.id);
  return null;
}

function getWorkflowReturnValue(result: unknown): Promise<unknown> | null {
  if (!result || typeof result !== "object" || !("returnValue" in result)) {
    return null;
  }
  const returnValue = result.returnValue;
  return returnValue &&
    typeof (returnValue as Promise<unknown>).then === "function"
    ? (returnValue as Promise<unknown>)
    : null;
}

function getErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "cause" in error &&
    (error as { cause?: unknown }).cause instanceof Error
  ) {
    return (error as { cause: Error }).cause.message;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

type CronFieldSpec = {
  min: number;
  max: number;
  aliases?: Record<string, number>;
};

const CRON_MONTH_ALIASES: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const CRON_DAY_ALIASES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function parseCronValue(token: string, spec: CronFieldSpec): number {
  const normalized = token.trim().toLowerCase();
  if (normalized === "") {
    throw new Error("Cron token cannot be empty");
  }

  if (spec.aliases?.[normalized] !== undefined) {
    return spec.aliases[normalized]!;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid cron token: "${token}"`);
  }

  if (spec.aliases === CRON_DAY_ALIASES && parsed === 7) {
    return 0;
  }

  if (parsed < spec.min || parsed > spec.max) {
    throw new Error(
      `Cron value "${token}" is out of range ${spec.min}-${spec.max}`,
    );
  }

  return parsed;
}

function cronFieldIsWildcard(field: string): boolean {
  return field.trim() === "*";
}

function matchesCronField(
  field: string,
  value: number,
  spec: CronFieldSpec,
): boolean {
  return field
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      if (part === "*") return true;

      const [baseRaw, stepRaw] = part.split("/");
      const base = baseRaw?.trim() ?? "";
      const step = stepRaw ? Number.parseInt(stepRaw.trim(), 10) : 1;

      if (!Number.isFinite(step) || step <= 0) {
        throw new Error(`Invalid cron step: "${part}"`);
      }

      let start: number;
      let end: number;

      if (base === "*" || base === "") {
        start = spec.min;
        end = spec.max;
      } else if (base.includes("-")) {
        const [startRaw, endRaw] = base.split("-");
        start = parseCronValue(startRaw ?? "", spec);
        end = parseCronValue(endRaw ?? "", spec);
        if (end < start) {
          throw new Error(`Invalid cron range: "${part}"`);
        }
      } else {
        start = parseCronValue(base, spec);
        end = stepRaw ? spec.max : start;
      }

      if (value < start || value > end) return false;
      return (value - start) % step === 0;
    });
}

function matchesCronSchedule(schedule: string, now: Date): boolean {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Cron schedule must have 5 fields: "${schedule}"`);
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const minuteMatch = matchesCronField(minute!, now.getUTCMinutes(), {
    min: 0,
    max: 59,
  });
  const hourMatch = matchesCronField(hour!, now.getUTCHours(), {
    min: 0,
    max: 23,
  });
  const monthMatch = matchesCronField(month!, now.getUTCMonth() + 1, {
    min: 1,
    max: 12,
    aliases: CRON_MONTH_ALIASES,
  });
  const dayOfMonthMatch = matchesCronField(dayOfMonth!, now.getUTCDate(), {
    min: 1,
    max: 31,
  });
  const dayOfWeekMatch = matchesCronField(dayOfWeek!, now.getUTCDay(), {
    min: 0,
    max: 6,
    aliases: CRON_DAY_ALIASES,
  });

  const dayOfMonthWildcard = cronFieldIsWildcard(dayOfMonth!);
  const dayOfWeekWildcard = cronFieldIsWildcard(dayOfWeek!);
  const dayMatches =
    dayOfMonthWildcard && dayOfWeekWildcard
      ? true
      : dayOfMonthWildcard
        ? dayOfWeekMatch
        : dayOfWeekWildcard
          ? dayOfMonthMatch
          : dayOfMonthMatch || dayOfWeekMatch;

  return minuteMatch && hourMatch && monthMatch && dayMatches;
}

function startOfUtcMinute(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      0,
      0,
    ),
  );
}

function coerceDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return null;
}

function isCronRequestAuthorized(request: Request): boolean {
  const secret = process.env["CRON_SECRET"]?.trim();
  if (!secret) {
    // Fail closed in production: an unset CRON_SECRET must not leave the
    // dispatcher open on a deployed app. Allowed in dev for local testing.
    return process.env["NODE_ENV"] !== "production";
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Debug routes (and the `plug`/`probe` CLI) are only available when
 * `KHOTAN_DEBUG` is set AND the app is not running in production. This keeps
 * the credentialed debug proxy from ever being reachable on a deployed app.
 */
function isDebugEnabled(): boolean {
  return (
    Boolean(process?.env?.["KHOTAN_DEBUG"]) &&
    process?.env?.["NODE_ENV"] !== "production"
  );
}

function isWorkflowCancelledError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const name = typeof record["name"] === "string" ? record["name"] : "";
  const status = typeof record["status"] === "string" ? record["status"] : "";
  const message =
    typeof record["message"] === "string" ? record["message"] : "";
  return (
    name === "WorkflowRunCancelledError" ||
    status === "cancelled" ||
    message.toLowerCase().includes("cancelled")
  );
}

function toFlowRunResult(value: unknown): FlowRunResult | undefined {
  return value && typeof value === "object" ? value : undefined;
}

function getFlowRunCounters(result: FlowRunResult | undefined) {
  return {
    extracted: result?.extracted ?? 0,
    transformed: result?.transformed ?? 0,
    created: result?.created ?? 0,
    updated: result?.updated ?? 0,
    deleted: result?.deleted ?? 0,
    failed: result?.failed ?? 0,
  };
}

function resolveTerminalRunStatus(
  result: FlowRunResult | undefined,
  counters: ReturnType<typeof getFlowRunCounters>,
): KhotanTerminalRunStatus {
  if (
    result?.status === "completed" ||
    result?.status === "partial" ||
    result?.status === "failed" ||
    result?.status === "cancelled"
  ) {
    return result.status;
  }
  return counters.failed > 0 ? "partial" : "completed";
}

// ---------------------------------------------------------------------------
// khotan factory
// ---------------------------------------------------------------------------

function extractEventTypes(body: Record<string, unknown>): string[] {
  const candidates =
    body["eventTypes"] ??
    body["event_types"] ??
    body["events"] ??
    body["enabled_events"];
  if (Array.isArray(candidates)) return candidates as string[];
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeZodSchema(schema: any): Record<string, unknown> | null {
  if (!schema) return null;
  try {
    const def = schema?._def ?? schema?.def ?? null;
    const rawTypeName: string =
      typeof def?.typeName === "string"
        ? def.typeName
        : typeof def?.type === "string"
          ? `Zod${def.type.charAt(0).toUpperCase()}${def.type.slice(1)}`
          : "";
    const inner =
      def?.innerType ??
      def?.element ??
      (typeof def?.type === "object" ? def.type : null) ??
      null;

    if (
      (rawTypeName === "ZodOptional" || rawTypeName === "ZodNullable") &&
      inner
    ) {
      return serializeZodSchema(inner);
    }

    const shape =
      typeof schema.shape === "function"
        ? schema.shape()
        : (schema.shape ??
          (typeof def?.shape === "function" ? def.shape() : def?.shape));
    if (shape && typeof shape === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(shape)) {
        result[key] = serializeZodField(val);
      }
      return result;
    }

    if (rawTypeName === "ZodArray" && inner) {
      return {
        _type: "array",
        items: serializeZodSchema(inner),
      };
    }

    if (rawTypeName) {
      return { _type: rawTypeName.replace("Zod", "").toLowerCase() };
    }
  } catch {
    /* best-effort */
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeZodField(field: any): string | Record<string, unknown> {
  const def = field?._def ?? field?.def ?? null;
  if (!def) return "unknown";
  const typeName: string =
    typeof def.typeName === "string"
      ? def.typeName
      : typeof def.type === "string"
        ? `Zod${def.type.charAt(0).toUpperCase()}${def.type.slice(1)}`
        : "";
  const inner =
    def.innerType ??
    def.element ??
    (typeof def.type === "object" ? def.type : null) ??
    null;

  if (typeName === "ZodOptional" && inner) {
    const serialized = serializeZodField(inner);
    if (typeof serialized === "string") {
      return serialized.endsWith("?") ? serialized : `${serialized}?`;
    }
    return serialized;
  }

  if (typeName === "ZodNullable" && inner) {
    const serialized = serializeZodField(inner);
    if (typeof serialized === "string") {
      return serialized.includes(" | null")
        ? serialized
        : `${serialized} | null`;
    }
    return serialized;
  }

  if (
    typeName === "ZodObject" ||
    typeName === "ZodArray" ||
    typeName === "ZodRecord" ||
    typeName === "ZodUnion" ||
    typeName === "ZodDiscriminatedUnion"
  ) {
    return serializeZodSchema(field) ?? "unknown";
  }

  if (typeName === "ZodEnum") {
    const values = Array.isArray(def.values)
      ? def.values
      : def.entries && typeof def.entries === "object"
        ? Object.values(def.entries)
        : [];
    if (values.length > 0) {
      return values.map((v: string) => `"${v}"`).join(" | ");
    }
  }

  return typeName.replace("Zod", "").toLowerCase() || "unknown";
}

function serializeEndpoints(
  endpoints: Record<
    string,
    {
      method: string;
      path: string;
      description?: string;
      body?: unknown;
      query?: unknown;
      responses?: Record<number, unknown>;
    }
  > | null,
) {
  if (!endpoints) return null;
  const result: Record<string, Record<string, unknown>> = {};
  for (const [name, ep] of Object.entries(endpoints)) {
    const entry: Record<string, unknown> = {
      method: ep.method,
      path: ep.path,
    };
    if (ep.description) entry["description"] = ep.description;
    const bodySchema = serializeZodSchema(ep.body);
    if (bodySchema) entry["body"] = bodySchema;
    const querySchema = serializeZodSchema(ep.query);
    if (querySchema) entry["query"] = querySchema;
    if (ep.responses) {
      entry["responses"] = Object.fromEntries(
        Object.entries(ep.responses).map(([code, schema]) => [
          code,
          serializeZodSchema(schema),
        ]),
      );
    }
    result[name] = entry;
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializeConnectField(connectField: ResourceConnectField): string {
  return Array.isArray(connectField) ? JSON.stringify(connectField) : connectField;
}

function deserializeConnectField(connectField: unknown): ResourceConnectField {
  if (Array.isArray(connectField)) {
    return connectField as [string, ...string[]];
  }

  if (typeof connectField !== "string") {
    throw new Error("Resource connectField must be a string or string array");
  }

  const trimmed = connectField.trim();
  if (!trimmed.startsWith("[")) {
    return connectField;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((value) => typeof value === "string" && value.length > 0)
    ) {
      return parsed as [string, ...string[]];
    }
  } catch {
    // Keep the raw string for backward compatibility with older rows.
  }

  return connectField;
}

function validateConnectField(
  resourceName: string,
  connectField: ResourceConnectField,
): void {
  if (typeof connectField === "string") {
    if (!connectField.trim()) {
      throw new Error(
        `Resource "${resourceName}" must declare a non-empty connectField`,
      );
    }
    return;
  }

  if (!Array.isArray(connectField) || connectField.length === 0) {
    throw new Error(
      `Resource "${resourceName}" must declare connectField as a string or non-empty ordered string array`,
    );
  }

  for (const field of connectField) {
    if (typeof field !== "string" || !field.trim()) {
      throw new Error(
        `Resource "${resourceName}" has an invalid composite connectField entry`,
      );
    }
  }
}

function validateResourcePlugs(
  resource: ResourceRegistration,
  plugNames: Set<string>,
): void {
  if (resource.mapping.plugs === undefined) {
    return;
  }

  if (!isPlainObject(resource.mapping.plugs)) {
    throw new Error(
      `Resource "${resource.name}" must declare mapping.plugs as an object keyed by plug name`,
    );
  }

  for (const [plugName, declaration] of Object.entries(resource.mapping.plugs)) {
    if (!plugNames.has(plugName)) {
      throw new Error(
        `Resource "${resource.name}" references unknown plug: "${plugName}"`,
      );
    }
    if (!isPlainObject(declaration)) {
      throw new Error(
        `Resource "${resource.name}" has an invalid plug declaration for "${plugName}"`,
      );
    }

    const keys = Object.keys(declaration);
    if (
      keys.length !== 1 ||
      typeof declaration["uniqueIdentifier"] !== "string" ||
      !declaration["uniqueIdentifier"].trim()
    ) {
      throw new Error(
        `Resource "${resource.name}" must declare exactly one uniqueIdentifier for plug "${plugName}"`,
      );
    }
  }
}

function normalizeCacheScope(
  cacheName: string,
  scope: CacheRegistration["scope"],
): CacheScope | undefined {
  if (scope === undefined) {
    return undefined;
  }

  if (!isPlainObject(scope)) {
    throw new Error(`Cache "${cacheName}" must declare scope as an object`);
  }

  const normalized: CacheScope = {};
  for (const key of ["plug", "resource", "flow"] as const) {
    const value = scope[key];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Cache "${cacheName}" has an invalid scope.${key} value`);
    }
    normalized[key] = value.trim();
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function parseCacheTtlSeconds(
  cacheName: string,
  ttl: CacheRegistration["ttl"],
): number | null {
  if (ttl === undefined) {
    return null;
  }

  if (typeof ttl === "number") {
    if (!Number.isFinite(ttl) || ttl <= 0) {
      throw new Error(`Cache "${cacheName}" must declare a positive ttl`);
    }
    return Math.ceil(ttl);
  }

  if (typeof ttl !== "string") {
    throw new Error(`Cache "${cacheName}" must declare ttl as a string or number`);
  }

  const normalized = ttl.trim().toLowerCase();
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(normalized);
  if (!match) {
    throw new Error(
      `Cache "${cacheName}" has an invalid ttl "${ttl}". Use values like "30s", "15m", or "6h"`,
    );
  }

  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2]!;
  const milliseconds =
    unit === "ms"
      ? amount
      : unit === "s"
        ? amount * 1_000
        : unit === "m"
          ? amount * 60_000
          : unit === "h"
            ? amount * 3_600_000
            : amount * 86_400_000;

  return Math.max(1, Math.ceil(milliseconds / 1_000));
}

function validateCacheKey(key: string): void {
  if (typeof key !== "string" || !key.trim()) {
    throw new Error("Cache key must be a non-empty string");
  }
}

function coerceCacheEntryRecord(
  row: Record<string, unknown>,
): CacheEntryRecord | null {
  if (
    typeof row["id"] !== "string" ||
    typeof row["cacheId"] !== "string" ||
    typeof row["key"] !== "string"
  ) {
    return null;
  }

  return {
    id: row["id"],
    cacheId: row["cacheId"],
    key: row["key"],
    value: row["value"],
    expiresAt: coerceDate(row["expiresAt"]),
    createdAt: coerceDate(row["createdAt"]) ?? undefined,
    updatedAt: coerceDate(row["updatedAt"]) ?? undefined,
  };
}

function isCacheEntryExpired(entry: CacheEntryRecord, now = new Date()): boolean {
  return entry.expiresAt !== null && entry.expiresAt.getTime() <= now.getTime();
}

function canonicalizeConnectValue(
  resource: ResourceRegistration,
  connectValue: unknown,
): string {
  const { connectField } = resource.mapping;

  if (Array.isArray(connectField)) {
    if (typeof connectValue === "string") {
      return connectValue;
    }
    if (!Array.isArray(connectValue)) {
      throw new Error(
        `Resource "${resource.name}" expects composite connectValue input matching connectField order`,
      );
    }
    if (connectValue.length !== connectField.length) {
      throw new Error(
        `Resource "${resource.name}" expects ${String(connectField.length)} connectValue parts in declared order`,
      );
    }

    const parts = connectValue.map((part) => {
      if (typeof part === "string") return part;
      if (typeof part === "number" || typeof part === "boolean") {
        return String(part);
      }
      throw new Error(
        `Resource "${resource.name}" connectValue parts must be strings, numbers, or booleans`,
      );
    });

    return JSON.stringify(parts);
  }

  if (typeof connectValue === "string") {
    return connectValue;
  }
  if (typeof connectValue === "number" || typeof connectValue === "boolean") {
    return String(connectValue);
  }

  throw new Error(
    `Resource "${resource.name}" expects connectValue to be a string, number, or boolean`,
  );
}

export function khotan(config: KhotanConfig): KhotanInstance {
  const { adapter, plugs, resources = [], caches = [], authorize } = config;
  const instanceId = crypto.randomUUID();

  // Security posture warnings — surfaced once at construction time.
  if (!authorize) {
    console.warn(
      "[khotan] No `authorize` hook configured: the management API " +
        "(/api/khotan/*) is publicly accessible. Pass `authorize` to gate it " +
        "behind your auth layer (e.g. better-auth). This is required for any " +
        "deployed environment.",
    );
  }
  if (!(config.secret ?? process.env["KHOTAN_SECRET"])) {
    console.warn(
      "[khotan] No `secret`/`KHOTAN_SECRET` configured: plug credentials and " +
        "wire metadata will not be encrypted at rest. Set KHOTAN_SECRET to a " +
        "high-entropy value.",
    );
  }

  // Validate: no duplicate plug names
  const plugNames = new Set<string>();
  for (const plug of plugs) {
    if (plugNames.has(plug.name)) {
      throw new Error(`Duplicate plug name: "${plug.name}"`);
    }
    plugNames.add(plug.name);
  }

  // Validate: no duplicate resource names and resource declarations are sane
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

  // Validate: flow resource references must match a registered resource
  const registeredFlowNames = new Set<string>();
  for (const plug of plugs) {
    if (!plug.flows) continue;
    for (const flow of plug.flows) {
      registeredFlowNames.add(flow.name);
      if (flow.resource && !resourceNames.has(flow.resource)) {
        throw new Error(
          `Flow "${flow.name}" references unknown resource: "${flow.resource}"`,
        );
      }
    }
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
    if (normalizedScope?.resource && !resourceNames.has(normalizedScope.resource)) {
      throw new Error(
        `Cache "${cache.name}" references unknown resource: "${normalizedScope.resource}"`,
      );
    }
    if (normalizedScope?.flow && !registeredFlowNames.has(normalizedScope.flow)) {
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

  function getWebhookHandlersForPlug(
    plug: PlugRegistration,
  ): WebhookRegistration[] {
    const handlers: WebhookRegistration[] = [];
    if (plug.webhooks) handlers.push(...plug.webhooks);
    if (plug.catches) handlers.push(...plug.catches);
    if (plug.passes) handlers.push(...plug.passes);
    return handlers;
  }

  // Validate: webhook handlers require wire with onVerify; passes must reference existing plugs
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

  async function doInit(): Promise<void> {
    if (initialized) return;

    // Upsert resources first, collect name→id map
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

            // Resolve destination plug ID for pass handlers
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

  async function getRegisteredResourceById(
    resourceId: string,
  ): Promise<ResourceRegistration | null> {
    await init();
    return resourceConfigById.get(resourceId) ?? null;
  }

  async function resolveCacheState(cacheName: string) {
    await init();
    const cacheState = cacheStateByName.get(cacheName);
    if (!cacheState || !cacheState.id) {
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
      ...(params.search?.trim()
        ? { search: params.search.trim() }
        : {}),
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
  }): Promise<Record<string, unknown>> {
    const resource = await validateMappingPayload(mapping);
    const result = await adapter.upsertMapping({
      resourceId: mapping.resourceId,
      connectValue: canonicalizeConnectValue(resource, mapping.connectValue),
      refs: mapping.refs,
      metadata: mapping.metadata ?? null,
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
    });
    const saved = await adapter.getMapping(id);
    if (!saved) {
      throw new Error(`Mapping "${id}" disappeared after update`);
    }
    return saved;
  }

  async function deleteMapping(id: string): Promise<void> {
    const existing = await adapter.getMapping(id);
    if (!existing) {
      throw new Error(`Mapping "${id}" not found`);
    }
    await adapter.deleteMapping(id);
  }

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
      if (!raw) return {};
      if (!secret) {
        try {
          return JSON.parse(raw) as Record<string, string>;
        } catch {
          return {};
        }
      }
      try {
        const decrypted = await decryptVars(raw, secret);
        return JSON.parse(decrypted) as Record<string, string>;
      } catch {
        try {
          return JSON.parse(raw) as Record<string, string>;
        } catch {
          return {};
        }
      }
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

  async function triggerFlowRun(
    flowId: string,
    body: unknown,
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
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const runType =
      typeof requestBody["runType"] === "string"
        ? requestBody["runType"]
        : "full";

    const { id: runId } = await adapter.insertRun({
      flowId,
      runType,
      status: "running",
    });
    const startedAt = Date.now();

    async function completeRunOk(result: FlowRunResult | undefined) {
      const completedAt = new Date();
      const counters = getFlowRunCounters(result);
      const status = resolveTerminalRunStatus(result, counters);

      await adapter.updateRun(runId, {
        status,
        completedAt,
        durationMs: Date.now() - startedAt,
        ...counters,
        error: result?.error ?? null,
        metadata: result?.metadata ?? null,
      });
      await adapter.updateFlowLastRun(flowId, {
        lastRunAt: completedAt,
        lastRunStatus: status,
      });

      return { completedAt, counters, status };
    }

    async function completeRunFailed(error: unknown) {
      const completedAt = new Date();
      const message = getErrorMessage(error);
      const status: KhotanTerminalRunStatus = isWorkflowCancelledError(error)
        ? "cancelled"
        : "failed";
      await adapter.updateRun(runId, {
        status,
        completedAt,
        durationMs: Date.now() - startedAt,
        failed: status === "failed" ? 1 : 0,
        error: message,
      });
      await adapter.updateFlowLastRun(flowId, {
        lastRunAt: completedAt,
        lastRunStatus: status,
      });
      return message;
    }

    function observeWorkflowCompletion(workflowResult: unknown) {
      const returnValue = getWorkflowReturnValue(workflowResult);
      if (!returnValue) return;

      void returnValue
        .then(async (value) => {
          await completeRunOk(toFlowRunResult(value));
        })
        .catch(async (error) => {
          await completeRunFailed(error);
        })
        .catch((error) => {
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
            runType,
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
          runType,
        });
      }

      const result = await flowReg.run?.({
        plug: boundPlug,
        flow: flowContext,
        runType,
        body: requestBody["body"],
        vars,
        setVars: setFlowVars,
        cache: createCacheInstance,
      });
      const runResult = toFlowRunResult(result);

      const { counters, status } = await completeRunOk(runResult);

      return Response.json({
        id: runId,
        flowId,
        status,
        runType,
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

  async function wasFlowTriggeredInMinuteWindow(
    flowId: string,
    slotStart: Date,
    slotEnd: Date,
  ): Promise<boolean> {
    const runs = await adapter.listRuns(flowId);
    return runs.some((run) => {
      const startedAt = coerceDate(run["startedAt"]);
      if (!startedAt) return false;
      const startedAtMs = startedAt.getTime();
      return (
        startedAtMs >= slotStart.getTime() && startedAtMs < slotEnd.getTime()
      );
    });
  }

  async function dispatchScheduledFlows(options: {
    now?: Date;
    runType?: string;
  } = {}) {
    await init();

    const now = options.now ?? new Date();
    const slotStart = startOfUtcMinute(now);
    const slotEnd = new Date(slotStart.getTime() + 60_000);
    const runType = options.runType ?? "full";
    const registeredFlows = (await adapter.listFlows()).filter((flow) =>
      isRegisteredFlowRecord(flow),
    );

    const scheduledFlows = registeredFlows.filter(
      (flow) => typeof flow["schedule"] === "string" && flow["schedule"].trim(),
    );

    const triggered: Array<Record<string, unknown>> = [];
    const skipped: Array<Record<string, unknown>> = [];

    for (const flow of scheduledFlows) {
      const flowId = typeof flow["id"] === "string" ? flow["id"] : null;
      const flowName = typeof flow["name"] === "string" ? flow["name"] : null;
      const plugName =
        typeof flow["plugName"] === "string" ? flow["plugName"] : null;
      const schedule =
        typeof flow["schedule"] === "string" ? flow["schedule"].trim() : "";

      if (!flowId || !flowName || !plugName || !schedule) continue;

      if (flow["enabled"] === false) {
        skipped.push({
          flowId,
          flowName,
          plugName,
          schedule,
          reason: "disabled",
        });
        continue;
      }

      let isDue = false;
      try {
        isDue = matchesCronSchedule(schedule, now);
      } catch (error) {
        skipped.push({
          flowId,
          flowName,
          plugName,
          schedule,
          reason: "invalid_schedule",
          detail: getErrorMessage(error),
        });
        continue;
      }

      if (!isDue) {
        skipped.push({
          flowId,
          flowName,
          plugName,
          schedule,
          reason: "not_due",
        });
        continue;
      }

      if (await wasFlowTriggeredInMinuteWindow(flowId, slotStart, slotEnd)) {
        skipped.push({
          flowId,
          flowName,
          plugName,
          schedule,
          reason: "already_triggered",
        });
        continue;
      }

      const response = await triggerFlowRun(flowId, { runType });
      const payload = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!response.ok) {
        skipped.push({
          flowId,
          flowName,
          plugName,
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
        schedule,
        runId: payload["id"] ?? null,
        workflowRunId: payload["workflowRunId"] ?? null,
        status:
          typeof payload["status"] === "string" ? payload["status"] : "running",
      });
    }

    return {
      ok: true,
      tickAt: slotStart.toISOString(),
      runType,
      evaluated: scheduledFlows.length,
      triggered,
      skipped,
    };
  }

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
      const plugs = matches
        .map((flow) => String(flow["plugName"]))
        .filter(Boolean)
        .join(", ");
      throw new Error(
        `Flow "${flowNameOrId}" is registered on multiple plugs (${plugs}). Pass { plugName } to select one.`,
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
        const response = await triggerFlowRun(flowId, startOptions);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message =
            payload && typeof payload === "object" && "error" in payload
              ? String((payload as { error: unknown }).error)
              : `Failed to start flow "${flowNameOrId}"`;
          throw new Error(message);
        }

        return payload as Record<string, unknown>;
      },
    };
  }

  async function getRunWithWorkflowStatus(
    runId: string,
  ): Promise<Record<string, unknown> | null> {
    const run = await adapter.getRun(runId);
    if (!run) return null;

    const workflowRunId =
      typeof run["workflowRunId"] === "string"
        ? run["workflowRunId"]
        : typeof run["workflow_run_id"] === "string"
          ? run["workflow_run_id"]
          : null;

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
      : typeof run["workflow_run_id"] === "string"
        ? run["workflow_run_id"]
        : null;
  }

  async function handler(request: Request): Promise<Response> {
    await init();

    const url = new URL(request.url);
    const segments = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean);

    const plugsIdx = segments.indexOf("plugs");
    const flowsIdx = segments.indexOf("flows");
    const resourcesIdx = segments.indexOf("resources");
    const cachesIdx = segments.indexOf("caches");
    const mappingsIdx = segments.indexOf("mappings");
    const runsIdx = segments.indexOf("runs");
    const wiresIdx = segments.indexOf("wires");
    const webhookHandlersIdx = segments.indexOf("webhook-handlers");
    const webhookEventsIdx = segments.indexOf("webhook-events");
    const variablesIdx = segments.indexOf("variables");
    const cronIdx = segments.indexOf("cron");
    const webhookIdx = segments.indexOf("webhook");

    const debugIdx = segments.indexOf("debug");

    // Authorization gate. Inbound webhooks, the cron dispatcher, and debug
    // routes carry their own protection and are exempt; everything else is a
    // management route that must pass the consumer-supplied `authorize` hook.
    const isInboundWebhook =
      webhookIdx !== -1 && webhookIdx === segments.length - 2;
    const isCronRoute = cronIdx !== -1 && cronIdx === segments.length - 1;
    const isDebugRoute = debugIdx !== -1;

    if (authorize && !isInboundWebhook && !isCronRoute && !isDebugRoute) {
      // The local CLI authenticates with a dev-only HMAC token derived from
      // KHOTAN_SECRET, so it can reach management routes without a user session.
      let allowed = await isCliRequestAuthorized(request, secret);
      if (!allowed) {
        try {
          allowed = await authorize(request);
        } catch {
          allowed = false;
        }
      }
      if (!allowed) {
        // Actionable 401: programmatic callers (scripts, external services)
        // commonly assume KHOTAN_SECRET is an HTTP credential. It is not — it
        // only encrypts data at rest. Explain how to authenticate/trigger so
        // the failure is self-describing rather than an opaque "Unauthorized".
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
    const search = url.searchParams.get("search")?.trim() || undefined;
    const wantsMappingPage =
      url.searchParams.has("limit") ||
      url.searchParams.has("offset") ||
      url.searchParams.has("search");

    if (request.method === "GET") {
      if (cachesIdx !== -1 && cachesIdx === segments.length - 3) {
        const cacheName = decodeURIComponent(segments[cachesIdx + 1]!);
        const key = decodeURIComponent(segments[cachesIdx + 2]!);

        try {
          const entry = await readCacheEntry(cacheName, key);
          if (!entry) {
            return Response.json({ error: "Cache entry not found" }, { status: 404 });
          }

          return Response.json({
            cache: cacheName,
            key: entry.key,
            value: entry.value,
            expiresAt: entry.expiresAt,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Invalid cache request";
          return Response.json({ error: message }, { status: 400 });
        }
      }

      if (cronIdx !== -1 && cronIdx === segments.length - 1) {
        if (!isCronRequestAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const result = await dispatchScheduledFlows();
        return Response.json(result);
      }

      // GET .../debug — check if debug mode is active
      if (debugIdx !== -1 && debugIdx === segments.length - 1) {
        if (!isDebugEnabled()) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json({ enabled: true });
      }

      // GET .../debug/:plugName — plug metadata for the debugger UI
      if (debugIdx !== -1 && debugIdx === segments.length - 2) {
        if (!isDebugEnabled()) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        const plugName = segments[debugIdx + 1]!;
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
      }

      // GET .../variables/:plugName
      if (variablesIdx !== -1 && variablesIdx === segments.length - 2) {
        const plugName = segments[variablesIdx + 1]!;
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
      }

      // GET .../wires/:plugName
      if (wiresIdx !== -1 && wiresIdx === segments.length - 2) {
        const plugName = segments[wiresIdx + 1]!;
        if (!plugNames.has(plugName)) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const plugReg = plugs.find((p) => p.name === plugName);
        if (!plugReg?.wires || plugReg.wires.length === 0) {
          return Response.json({ wire: null, configured: false });
        }
        const wireRecord = await wire(plugName).get();
        return Response.json({ wire: wireRecord, configured: true });
      }

      // GET .../webhook-handlers/:plugName
      if (
        webhookHandlersIdx !== -1 &&
        webhookHandlersIdx === segments.length - 2
      ) {
        const plugName = segments[webhookHandlersIdx + 1]!;
        if (!plugNames.has(plugName)) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const allPlugs = await adapter.listPlugs();
        const dbPlug = allPlugs.find((p) => p["name"] === plugName);
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
      }

      // GET .../plugs
      if (plugsIdx !== -1 && plugsIdx === segments.length - 1) {
        const data = await adapter.listPlugs();
        const filtered = data.filter(
          (p) => typeof p["name"] === "string" && plugNames.has(p["name"]),
        );
        const withVarState = await Promise.all(
          filtered.map(async (plug) => {
            const plugName = plug["name"] as string;
            let varsConfigured = false;
            try {
              varsConfigured = await hasVars(plugName);
            } catch {
              varsConfigured = false;
            }
            return { ...plug, varsConfigured };
          }),
        );
        return Response.json(withVarState);
      }

      // GET .../plugs/:id
      if (plugsIdx !== -1 && plugsIdx === segments.length - 2) {
        const plugId = segments[plugsIdx + 1]!;
        const plug = await adapter.getPlug(plugId);
        if (
          !plug ||
          typeof plug["name"] !== "string" ||
          !plugNames.has(plug["name"])
        ) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const flows = await adapter.getPlugFlows(plugId);
        return Response.json({ ...plug, flows });
      }

      // GET .../flows — only flows belonging to registered plugs
      if (flowsIdx !== -1 && flowsIdx === segments.length - 1) {
        const data = await adapter.listFlows();
        const filtered = data.filter((flow) => isRegisteredFlowRecord(flow));
        return Response.json(filtered);
      }

      // GET .../flows/:id/runs
      if (
        flowsIdx !== -1 &&
        flowsIdx === segments.length - 3 &&
        segments[flowsIdx + 2] === "runs"
      ) {
        const flowId = segments[flowsIdx + 1]!;
        const data = await adapter.listRuns(flowId);
        return Response.json(data);
      }

      // GET .../runs
      if (runsIdx !== -1 && runsIdx === segments.length - 1) {
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
      }

      // GET .../runs/:id/stream
      if (
        runsIdx !== -1 &&
        runsIdx === segments.length - 3 &&
        segments[runsIdx + 2] === "stream"
      ) {
        const runId = segments[runsIdx + 1]!;
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
      }

      // GET .../runs/:id
      if (runsIdx !== -1 && runsIdx === segments.length - 2) {
        const runId = segments[runsIdx + 1]!;
        const run = await getRunWithWorkflowStatus(runId);
        if (!run) {
          return Response.json({ error: "Run not found" }, { status: 404 });
        }
        return Response.json(run);
      }

      // GET .../webhook-events
      if (webhookEventsIdx !== -1 && webhookEventsIdx === segments.length - 1) {
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
      }

      // GET .../resources — only resources registered in config
      if (resourcesIdx !== -1 && resourcesIdx === segments.length - 1) {
        const data = await adapter.listResources();
        const filtered = data.filter(
          (r) => typeof r["name"] === "string" && resourceNames.has(r["name"]),
        );
        return Response.json(filtered.map(decorateResourceRecord));
      }

      // GET .../resources/:id/mappings
      if (
        resourcesIdx !== -1 &&
        resourcesIdx === segments.length - 3 &&
        segments[resourcesIdx + 2] === "mappings"
      ) {
        const resourceId = segments[resourcesIdx + 1]!;
        const resource = await getRegisteredResourceById(resourceId);
        if (!resource) {
          return Response.json(
            { error: "Resource not found" },
            { status: 404 },
          );
        }

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
      }

      // GET .../resources/:id
      if (resourcesIdx !== -1 && resourcesIdx === segments.length - 2) {
        const resourceId = segments[resourcesIdx + 1]!;
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
      }

      // GET .../mappings/:id
      if (mappingsIdx !== -1 && mappingsIdx === segments.length - 2) {
        const mappingId = segments[mappingsIdx + 1]!;
        const mapping = await adapter.getMapping(mappingId);
        if (!mapping) {
          return Response.json({ error: "Mapping not found" }, { status: 404 });
        }
        return Response.json(mapping);
      }
    }

    if (request.method === "POST") {
      if (cachesIdx !== -1 && cachesIdx === segments.length - 3) {
        const cacheName = decodeURIComponent(segments[cachesIdx + 1]!);
        const key = decodeURIComponent(segments[cachesIdx + 2]!);
        const body = (await request.json().catch(() => ({}))) as {
          value?: unknown;
        };

        if (!("value" in body)) {
          return Response.json({ error: "Cache writes require a value" }, { status: 400 });
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
      }

      if (cronIdx !== -1 && cronIdx === segments.length - 1) {
        if (!isCronRequestAuthorized(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          body = {};
        }

        const runType =
          typeof body["runType"] === "string" ? body["runType"] : "full";
        const result = await dispatchScheduledFlows({ runType });
        return Response.json(result);
      }

      // POST .../webhook/:plugName — receive inbound webhooks
      if (webhookIdx !== -1 && webhookIdx === segments.length - 2) {
        const plugName = segments[webhookIdx + 1]!;
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

        // Get wireVars for verification
        const allPlugs = await adapter.listPlugs();
        const dbPlug = allPlugs.find((p) => p["name"] === plugName);
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
          if (raw) {
            if (secret) {
              try {
                const decrypted = await decryptVars(raw, secret);
                wireVars = JSON.parse(decrypted) as Record<string, string>;
              } catch {
                try {
                  wireVars = JSON.parse(raw) as Record<string, string>;
                } catch {
                  /* empty */
                }
              }
            } else {
              try {
                wireVars = JSON.parse(raw) as Record<string, string>;
              } catch {
                /* empty */
              }
            }
          }
        }

        // Convert headers to plain Record
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

        // Parse JSON after verification
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          event = {};
        }
        const eventType =
          typeof event["type"] === "string" ? event["type"] : "unknown";

        const webhookHandlers = getWebhookHandlersForPlug(plugReg);
        const catches = webhookHandlers.filter(
          (handler): handler is CatchRegistration => handler.type === "catch",
        );
        const passes = webhookHandlers.filter(
          (handler): handler is PassRegistration => handler.type === "pass",
        );

        void Promise.resolve().then(async () => {
          try {
            const startWorkflow = await importWorkflowStart();

            // Look up handler IDs from DB for run tracking
            const dbHandlers = wireId
              ? await adapter.listWebhookHandlers(wireId)
              : [];

            for (const c of catches) {
              if (
                Array.isArray(c.events) &&
                c.events.length > 0 &&
                !c.events.includes(eventType)
              ) {
                continue;
              }
              const handlerRow = dbHandlers.find(
                (h) => h["name"] === c.name && h["type"] === "catch",
              );
              if (handlerRow?.["enabled"] === false) {
                continue;
              }
              const handlerId = handlerRow
                ? (handlerRow["id"] as string)
                : null;
              const { id: khotanRunId } = await adapter.insertRun({
                webhookHandlerId: handlerId,
                wireId,
                workflowRunId: null,
                runType: "webhook",
                status: "running",
              });
              if (handlerId && wireId) {
                await adapter.insertWebhookEvent({
                  wireId,
                  webhookHandlerId: handlerId,
                  khotanRunId,
                  eventType,
                  payload: event,
                  headers,
                });
              }
              try {
                const result = await startWorkflow(c.workflow, [
                  {
                    event,
                    eventType,
                    headers,
                    khotanRunId,
                    khotanInstanceId: instanceId,
                  },
                ]);
                const workflowRunId =
                  result && typeof result === "object"
                    ? "runId" in result
                      ? String(result.runId)
                      : "id" in result
                        ? String(result.id)
                        : null
                    : null;
                if (workflowRunId) {
                  await adapter.updateRun(khotanRunId, {
                    status: "running",
                    workflowRunId,
                  });
                }
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : "Unknown error";
                await adapter.updateRun(khotanRunId, {
                  status: "failed",
                  completedAt: new Date(),
                  failed: 1,
                  error: message,
                });
                throw err;
              }
            }

            for (const p of passes) {
              if (
                Array.isArray(p.events) &&
                p.events.length > 0 &&
                !p.events.includes(eventType)
              ) {
                continue;
              }
              const handlerRow = dbHandlers.find(
                (h) => h["name"] === p.name && h["type"] === "pass",
              );
              if (handlerRow?.["enabled"] === false) {
                continue;
              }
              let destVars: Record<string, string> = {};
              const destPlug = allPlugs.find((dp) => dp["name"] === p.to);
              if (destPlug) {
                const destPlugId = destPlug["id"] as string;
                const encrypted =
                  await adapter.getEncryptedVariables(destPlugId);
                if (encrypted && secret) {
                  try {
                    const json = await decryptVars(encrypted, secret);
                    destVars = JSON.parse(json) as Record<string, string>;
                  } catch {
                    /* empty */
                  }
                }
              }
              const handlerId = handlerRow
                ? (handlerRow["id"] as string)
                : null;
              const { id: khotanRunId } = await adapter.insertRun({
                webhookHandlerId: handlerId,
                wireId,
                workflowRunId: null,
                runType: "webhook",
                status: "running",
              });
              if (handlerId && wireId) {
                await adapter.insertWebhookEvent({
                  wireId,
                  webhookHandlerId: handlerId,
                  khotanRunId,
                  eventType,
                  payload: event,
                  headers,
                });
              }
              try {
                const result = await startWorkflow(p.workflow, [
                  {
                    event,
                    eventType,
                    headers,
                    destVars,
                    khotanRunId,
                    khotanInstanceId: instanceId,
                  },
                ]);
                const workflowRunId =
                  result && typeof result === "object"
                    ? "runId" in result
                      ? String(result.runId)
                      : "id" in result
                        ? String(result.id)
                        : null
                    : null;
                if (workflowRunId) {
                  await adapter.updateRun(khotanRunId, {
                    status: "running",
                    workflowRunId,
                  });
                }
              } catch (err) {
                const message =
                  err instanceof Error ? err.message : "Unknown error";
                await adapter.updateRun(khotanRunId, {
                  status: "failed",
                  completedAt: new Date(),
                  failed: 1,
                  error: message,
                });
                throw err;
              }
            }
          } catch (err) {
            kd("webhook", `${plugName}: workflow start failed:`, err);
          }
        });

        return Response.json({ received: true }, { status: 202 });
      }

      // POST .../debug/:plugName — dev-only proxy through plug
      if (debugIdx !== -1 && debugIdx === segments.length - 2) {
        if (!isDebugEnabled()) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        const plugName = segments[debugIdx + 1]!;
        const plugReg = plugs.find((p) => p.name === plugName);
        if (!plugReg) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }

        const body = (await request.json()) as {
          method: string;
          path: string;
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const opts: any = { vars };
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
      }

      // POST .../variables/:plugName
      if (variablesIdx !== -1 && variablesIdx === segments.length - 2) {
        const plugName = segments[variablesIdx + 1]!;
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
      }

      // POST .../runs/:id/cancel
      if (
        runsIdx !== -1 &&
        runsIdx === segments.length - 3 &&
        segments[runsIdx + 2] === "cancel"
      ) {
        const runId = segments[runsIdx + 1]!;
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
      }

      // POST .../runs/:id/retry
      if (
        runsIdx !== -1 &&
        runsIdx === segments.length - 3 &&
        segments[runsIdx + 2] === "retry"
      ) {
        const runId = segments[runsIdx + 1]!;
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
        const runType =
          typeof run["runType"] === "string" ? run["runType"] : "full";
        return triggerFlowRun(flowId, { runType });
      }

      // POST .../flows/:id/runs
      if (
        flowsIdx !== -1 &&
        flowsIdx === segments.length - 3 &&
        segments[flowsIdx + 2] === "runs"
      ) {
        const flowId = segments[flowsIdx + 1]!;
        const body = await request.json().catch(() => ({}));
        return triggerFlowRun(flowId, body);
      }

      // POST .../wires/:plugName
      if (wiresIdx !== -1 && wiresIdx === segments.length - 2) {
        const plugName = segments[wiresIdx + 1]!;
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
      }

      // POST .../mappings/lookup
      if (
        mappingsIdx !== -1 &&
        mappingsIdx === segments.length - 2 &&
        segments[mappingsIdx + 1] === "lookup"
      ) {
        const body = (await request.json()) as
          | {
              resourceId: string;
              connectValue: string | string[];
            }
          | {
              resourceId: string;
              plugName: string;
              ref: string;
            };
        if (
          !body ||
          typeof body !== "object" ||
          typeof body["resourceId"] !== "string"
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
              error:
                "Lookup requires either connectValue or plugName with ref",
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
      }

      // POST .../mappings
      if (mappingsIdx !== -1 && mappingsIdx === segments.length - 1) {
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
      }
    }

    if (request.method === "PATCH") {
      // PATCH .../plugs/:id
      if (plugsIdx !== -1 && plugsIdx === segments.length - 2) {
        const plugId = segments[plugsIdx + 1]!;
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
      }

      // PATCH .../flows/:id
      if (flowsIdx !== -1 && flowsIdx === segments.length - 2) {
        const flowId = segments[flowsIdx + 1]!;
        const body = (await request.json()) as { enabled?: boolean };
        if (typeof body.enabled === "boolean") {
          await adapter.toggleFlowEnabled(flowId, body.enabled);
        }
        return Response.json({ id: flowId, ...body });
      }

      // PATCH .../webhook-handlers/:id
      if (
        webhookHandlersIdx !== -1 &&
        webhookHandlersIdx === segments.length - 2
      ) {
        const handlerId = segments[webhookHandlersIdx + 1]!;
        const body = (await request.json()) as { enabled?: boolean };
        if (typeof body.enabled === "boolean") {
          await adapter.toggleWebhookHandlerEnabled(handlerId, body.enabled);
        }
        return Response.json({ id: handlerId, ...body });
      }
    }

    if (request.method === "PUT") {
      // PUT .../mappings/:id
      if (mappingsIdx !== -1 && mappingsIdx === segments.length - 2) {
        const mappingId = segments[mappingsIdx + 1]!;
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
      }
    }

    if (request.method === "DELETE") {
      if (cachesIdx !== -1 && cachesIdx === segments.length - 3) {
        const cacheName = decodeURIComponent(segments[cachesIdx + 1]!);
        const key = decodeURIComponent(segments[cachesIdx + 2]!);

        try {
          await createCacheInstance(cacheName).delete(key);
          return new Response(null, { status: 204 });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Invalid cache request";
          return Response.json({ error: message }, { status: 400 });
        }
      }

      // DELETE .../variables/:plugName
      if (variablesIdx !== -1 && variablesIdx === segments.length - 2) {
        const plugName = segments[variablesIdx + 1]!;
        if (!plugNames.has(plugName)) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        await clearVars(plugName);
        return new Response(null, { status: 204 });
      }

      // DELETE .../wires/:plugName
      if (wiresIdx !== -1 && wiresIdx === segments.length - 2) {
        const plugName = segments[wiresIdx + 1]!;
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
      }

      // DELETE .../mappings/:id
      if (mappingsIdx !== -1 && mappingsIdx === segments.length - 2) {
        const mappingId = segments[mappingsIdx + 1]!;
        const existing = await adapter.getMapping(mappingId);
        if (!existing) {
          return Response.json({ error: "Mapping not found" }, { status: 404 });
        }
        await adapter.deleteMapping(mappingId);
        return new Response(null, { status: 204 });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const secret = config.secret ?? process.env["KHOTAN_SECRET"] ?? "";

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

  khotanRuntimeRegistry.set(instanceId, {
    cache: createCacheInstance,
    listMappings,
    lookupMapping,
    upsertMapping,
    updateMapping,
    deleteMapping,
  });

  return {
    handler,
    init,
    flow,
    wire,
    cache: createCacheInstance,
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
