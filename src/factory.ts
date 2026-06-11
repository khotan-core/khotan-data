import { eq, desc, sql, count, inArray } from "drizzle-orm";

declare const process: { env: Record<string, string | undefined> };

const _khotanDebug = typeof process !== "undefined" && process.env?.["KHOTAN_DEBUG"];
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
    unique("khotan_webhook_handlers_wire_id_name_unique").on(table.wireId, table.name),
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
    index("khotan_webhook_events_webhook_handler_id_idx").on(table.webhookHandlerId),
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
      enum: ["pending", "running", "completed", "partial", "failed", "cancelled"],
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

const khotanMappings = pgTable(
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

// ---------------------------------------------------------------------------
// Encryption — AES-256-GCM for var store
// ---------------------------------------------------------------------------

async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoded = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptVars(
  plaintext: string,
  secret: string,
): Promise<string> {
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

async function decryptVars(
  encrypted: string,
  secret: string,
): Promise<string> {
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
// Types
// ---------------------------------------------------------------------------

export interface ResourceRegistration {
  name: string;
  connectField: string;
  description?: string;
}

export type FlowType = "inflow" | "outflow" | "relay" | "webhook";

export type KhotanRunStatus = "pending" | "running" | "completed" | "partial" | "failed" | "cancelled";
export type KhotanTerminalRunStatus = "completed" | "partial" | "failed" | "cancelled";

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

export interface FlowRunContext {
  plug: { get<T>(path: string, options?: { params?: Record<string, unknown>; headers?: Record<string, string> }): Promise<T>; post<T>(path: string, options?: { body?: unknown; headers?: Record<string, string> }): Promise<T>; put<T>(path: string, options?: { body?: unknown; headers?: Record<string, string> }): Promise<T>; patch<T>(path: string, options?: { body?: unknown; headers?: Record<string, string> }): Promise<T>; delete<T>(path: string, options?: { headers?: Record<string, string> }): Promise<T> };
  flow: { id: string; name: string; type: FlowType; resource?: string | null; to?: string | null };
  runType: string;
  body?: unknown;
  vars: Record<string, string>;
  setVars(updates: Record<string, string>): Promise<void>;
}

export interface FlowWorkflowContext {
  flow: { id: string; name: string; type: FlowType; resource?: string | null; to?: string | null };
  runType: string;
  body?: unknown;
  vars: Record<string, string>;
  khotanRunId: string;
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
  plug: { get<T>(path: string, options?: { params?: Record<string, unknown>; headers?: Record<string, string> }): Promise<T>; post<T>(path: string, options?: { body?: unknown; headers?: Record<string, string> }): Promise<T>; put<T>(path: string, options?: { body?: unknown; headers?: Record<string, string> }): Promise<T>; patch<T>(path: string, options?: { body?: unknown; headers?: Record<string, string> }): Promise<T>; delete<T>(path: string, options?: { headers?: Record<string, string> }): Promise<T> };
  callbackUrl: string;
  events: string[];
  wireVars: Record<string, string>;
  setWireVars(updates: Record<string, string>): Promise<void>;
}

export interface WireUnsubscribeContext {
  plug: { get<T>(path: string, options?: { params?: Record<string, unknown>; headers?: Record<string, string> }): Promise<T>; post<T>(path: string, options?: { body?: unknown; headers?: Record<string, string> }): Promise<T>; put<T>(path: string, options?: { body?: unknown; headers?: Record<string, string> }): Promise<T>; patch<T>(path: string, options?: { body?: unknown; headers?: Record<string, string> }): Promise<T>; delete<T>(path: string, options?: { headers?: Record<string, string> }): Promise<T> };
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
  workflow: (ctx: { event: Record<string, unknown>; eventType: string; headers: Record<string, string>; khotanRunId: string }) => Promise<void>;
}

export interface PassRegistration {
  type: "pass";
  name: string;
  to: string;
  events?: string[];
  workflow: (ctx: { event: Record<string, unknown>; eventType: string; headers: Record<string, string>; destVars: Record<string, string>; khotanRunId: string }) => Promise<void>;
}

export type WebhookRegistration = CatchRegistration | PassRegistration;

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
  plug: { baseUrl: string; authType: string; varFields?: readonly VarField[]; endpoints?: Record<string, { method: string; path: string; description?: string; body?: { _def?: unknown; shape?: Record<string, unknown> }; query?: { _def?: unknown; shape?: Record<string, unknown> }; responses?: Record<number, { _def?: unknown; shape?: Record<string, unknown> }> }>; get<T>(path: string, options?: { params?: Record<string, unknown>; headers?: Record<string, string>; vars?: Record<string, string>; _setVars?: (updates: Record<string, string>) => Promise<void>; _skipHooks?: boolean }): Promise<T>; post<T>(path: string, options?: { body?: unknown; headers?: Record<string, string>; vars?: Record<string, string>; _setVars?: (updates: Record<string, string>) => Promise<void>; _skipHooks?: boolean }): Promise<T>; put<T>(path: string, options?: { body?: unknown; headers?: Record<string, string>; vars?: Record<string, string>; _setVars?: (updates: Record<string, string>) => Promise<void>; _skipHooks?: boolean }): Promise<T>; patch<T>(path: string, options?: { body?: unknown; headers?: Record<string, string>; vars?: Record<string, string>; _setVars?: (updates: Record<string, string>) => Promise<void>; _skipHooks?: boolean }): Promise<T>; delete<T>(path: string, options?: { headers?: Record<string, string>; vars?: Record<string, string>; _setVars?: (updates: Record<string, string>) => Promise<void>; _skipHooks?: boolean }): Promise<T> };
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
    connectField: string;
    description?: string | null;
  }): Promise<{ id: string }>;
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
  listMappings(resourceId: string): Promise<Record<string, unknown>[]>;
  deleteMapping(id: string): Promise<void>;
  lookupMapping(params: {
    resourceId: string;
    plugName: string;
    ref: string;
  }): Promise<Record<string, unknown> | null>;

  updateFlowResourceId(flowId: string, resourceId: string): Promise<void>;
  togglePlugEnabled(plugId: string, enabled: boolean): Promise<void>;
  toggleFlowEnabled(flowId: string, enabled: boolean): Promise<void>;
  toggleWebhookHandlerEnabled(handlerId: string, enabled: boolean): Promise<void>;

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
  updateWireStatus(wireId: string, status: "active" | "disabled" | "pending"): Promise<void>;
  updateWireDetails(wireId: string, details: { remoteId: string; callbackUrl: string; eventTypes: string[]; status: "active" }): Promise<void>;
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
  getLatestWebhookHandlerRun(handlerId: string): Promise<Record<string, unknown> | null>;

  insertRun(run: {
    flowId?: string | null;
    wireId?: string | null;
    webhookHandlerId?: string | null;
    workflowRunId?: string | null;
    runType: string;
    status: string;
  }): Promise<{ id: string }>;
  updateRun(runId: string, updates: {
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
  }): Promise<void>;
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
  updateFlowLastRun(flowId: string, updates: {
    lastRunAt: Date;
    lastRunStatus: KhotanTerminalRunStatus;
  }): Promise<void>;
}

export interface KhotanConfig {
  adapter: KhotanAdapter;
  plugs: PlugRegistration[];
  resources?: ResourceRegistration[];
  secret?: string;
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

      const flowIds = [...new Set(
        pageRows
          .map((row) => row.flowId)
          .filter((value): value is string => typeof value === "string"),
      )];
      const handlerIds = [...new Set(
        pageRows
          .map((row) => row.webhookHandlerId)
          .filter((value): value is string => typeof value === "string"),
      )];

      const flowRows = flowIds.length > 0
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

      const handlerRows = handlerIds.length > 0
        ? await db
            .select({
              id: khotanWebhookHandlers.id,
              name: khotanWebhookHandlers.name,
              type: khotanWebhookHandlers.type,
              plugName: khotanPlugs.name,
            })
            .from(khotanWebhookHandlers)
            .leftJoin(khotanWires, eq(khotanWebhookHandlers.wireId, khotanWires.id))
            .leftJoin(khotanPlugs, eq(khotanWires.plugId, khotanPlugs.id))
            .where(inArray(khotanWebhookHandlers.id, handlerIds))
        : [];

      const flowMap = new Map(flowRows.map((row) => [row.id, row]));
      const handlerMap = new Map(handlerRows.map((row) => [row.id, row]));

      return {
        items: pageRows.map((row) => {
          const flow = row.flowId ? flowMap.get(row.flowId) : null;
          const handler = row.webhookHandlerId ? handlerMap.get(row.webhookHandlerId) : null;
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
          connectField: resource.connectField,
          description: resource.description ?? null,
        })
        .onConflictDoUpdate({
          target: khotanResources.name,
          set: {
            connectField: resource.connectField,
            description: resource.description ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: khotanResources.id });
      return { id: rows[0]!.id };
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
          resourceId: khotanMappings.resourceId,
          mappingCount: count(khotanMappings.id).as("mapping_count"),
        })
        .from(khotanMappings)
        .groupBy(khotanMappings.resourceId)
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

      return rows;
    },

    async getResource(id) {
      const rows = await db
        .select()
        .from(khotanResources)
        .where(eq(khotanResources.id, id))
        .limit(1);
      return rows[0] ?? null;
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
          .update(khotanMappings)
          .set({
            resourceId: mapping.resourceId,
            connectValue: mapping.connectValue,
            refs: mapping.refs,
            metadata: mapping.metadata ?? null,
            updatedAt: new Date(),
          })
          .where(eq(khotanMappings.id, mapping.id))
          .returning({ id: khotanMappings.id });
        return { id: rows[0]!.id, created: false };
      }

      const existing = await db
        .select({ id: khotanMappings.id })
        .from(khotanMappings)
        .where(
          sql`${khotanMappings.resourceId} = ${mapping.resourceId} and ${khotanMappings.connectValue} = ${mapping.connectValue}`,
        )
        .limit(1);

      const rows = await db
        .insert(khotanMappings)
        .values({
          resourceId: mapping.resourceId,
          connectValue: mapping.connectValue,
          refs: mapping.refs,
          metadata: mapping.metadata ?? null,
        })
        .onConflictDoUpdate({
          target: [khotanMappings.resourceId, khotanMappings.connectValue],
          set: {
            refs: sql`${khotanMappings.refs} || ${JSON.stringify(mapping.refs)}::jsonb`,
            metadata: mapping.metadata ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: khotanMappings.id });
      return { id: rows[0]!.id, created: existing.length === 0 };
    },

    async getMapping(id) {
      const rows = await db
        .select()
        .from(khotanMappings)
        .where(eq(khotanMappings.id, id))
        .limit(1);
      return rows[0] ?? null;
    },

    async listMappings(resourceId) {
      return db
        .select()
        .from(khotanMappings)
        .where(eq(khotanMappings.resourceId, resourceId));
    },

    async deleteMapping(id) {
      await db.delete(khotanMappings).where(eq(khotanMappings.id, id));
    },

    async lookupMapping({ resourceId, plugName, ref }) {
      const rows = await db
        .select()
        .from(khotanMappings)
        .where(
          sql`${khotanMappings.resourceId} = ${resourceId} and ${khotanMappings.refs}->>${plugName} = ${ref}`,
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
          runType: run.runType as "full" | "delta" | "backfill" | "reconcile" | "dry-run" | "webhook",
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
      let rows: Array<{
        id: string;
        wireId: string | null;
        webhookHandlerId: string | null;
        khotanRunId: string;
        eventType: string;
        payload: Record<string, unknown>;
        headers: Record<string, string>;
        receivedAt: Date;
      }>;

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

        const rawRows: Array<Record<string, unknown>> =
          Array.isArray(legacyResult)
            ? (legacyResult as Array<Record<string, unknown>>)
            : "rows" in legacyResult && Array.isArray(legacyResult.rows)
              ? (legacyResult.rows as Array<Record<string, unknown>>)
              : [];

        rows = rawRows.map((row) => ({
          id: String(row["id"]),
          wireId:
            typeof row["wire_id"] === "string" ? row["wire_id"] : null,
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

      const handlerIds = [...new Set(
        pageRows
          .map((row) => row.webhookHandlerId)
          .filter((value): value is string => typeof value === "string"),
      )];
      const runIds = [...new Set(
        pageRows
          .map((row) => row.khotanRunId)
          .filter((value): value is string => typeof value === "string"),
      )];

      const handlerRows = handlerIds.length > 0
        ? await db
            .select({
              id: khotanWebhookHandlers.id,
              name: khotanWebhookHandlers.name,
              type: khotanWebhookHandlers.type,
              plugName: khotanPlugs.name,
            })
            .from(khotanWebhookHandlers)
            .leftJoin(khotanWires, eq(khotanWebhookHandlers.wireId, khotanWires.id))
            .leftJoin(khotanPlugs, eq(khotanWires.plugId, khotanPlugs.id))
            .where(inArray(khotanWebhookHandlers.id, handlerIds))
        : [];

      const runRows = runIds.length > 0
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
type WorkflowStartFn = (workflowFn: (...args: any[]) => any, args: unknown[]) => Promise<unknown>;
type WorkflowRunHandle = {
  runId?: string;
  status?: Promise<string>;
  returnValue?: Promise<unknown>;
  cancel?: () => Promise<void>;
  getReadable?: (options?: { startIndex?: number; namespace?: string }) => ReadableStream;
};
type WorkflowGetRunFn = (runId: string) => WorkflowRunHandle;
type WorkflowGetWritableFn = <T = unknown>(options?: { namespace?: string }) => WritableStream<T>;

let _workflowStart: WorkflowStartFn | null = null;
let _workflowGetRun: WorkflowGetRunFn | null = null;
let _workflowGetWritable: WorkflowGetWritableFn | null = null;

export function __setWorkflowStartForTests(start: WorkflowStartFn | null): void {
  _workflowStart = start;
}

export function __setWorkflowGetRunForTests(getRun: WorkflowGetRunFn | null): void {
  _workflowGetRun = getRun;
}

export function __setWorkflowGetWritableForTests(getWritable: WorkflowGetWritableFn | null): void {
  _workflowGetWritable = getWritable;
}

async function importWorkflowStart(): Promise<WorkflowStartFn> {
  if (_workflowStart) return _workflowStart;
  try {
    const mod = await import(/* webpackIgnore: true */ "workflow/api") as {
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
    const mod = await import(/* webpackIgnore: true */ "workflow/api") as {
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
    const mod = await import(/* webpackIgnore: true */ "workflow") as {
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
  const payload = typeof update === "string"
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
  if ("runId" in result) return String((result as { runId: unknown }).runId);
  if ("id" in result) return String((result as { id: unknown }).id);
  return null;
}

function getWorkflowReturnValue(result: unknown): Promise<unknown> | null {
  if (!result || typeof result !== "object" || !("returnValue" in result)) {
    return null;
  }
  const returnValue = (result as { returnValue: unknown }).returnValue;
  return returnValue && typeof (returnValue as Promise<unknown>).then === "function"
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

function isWorkflowCancelledError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const name = typeof record["name"] === "string" ? record["name"] : "";
  const status = typeof record["status"] === "string" ? record["status"] : "";
  const message = typeof record["message"] === "string" ? record["message"] : "";
  return (
    name === "WorkflowRunCancelledError" ||
    status === "cancelled" ||
    message.toLowerCase().includes("cancelled")
  );
}

function toFlowRunResult(value: unknown): FlowRunResult | undefined {
  return value && typeof value === "object"
    ? (value as FlowRunResult)
    : undefined;
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
  const candidates = body["eventTypes"] ?? body["event_types"] ?? body["events"] ?? body["enabled_events"];
  if (Array.isArray(candidates)) return candidates as string[];
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeZodSchema(schema: any): Record<string, unknown> | null {
  if (!schema) return null;
  try {
    const def = schema?._def ?? schema?.def ?? null;
    const rawTypeName: string = typeof def?.typeName === "string"
      ? def.typeName
      : typeof def?.type === "string"
        ? `Zod${def.type.charAt(0).toUpperCase()}${def.type.slice(1)}`
        : "";
    const inner = def?.innerType
      ?? def?.element
      ?? (typeof def?.type === "object" ? def.type : null)
      ?? null;

    if ((rawTypeName === "ZodOptional" || rawTypeName === "ZodNullable") && inner) {
      return serializeZodSchema(inner);
    }

    const shape = typeof schema.shape === "function"
      ? schema.shape()
      : schema.shape ?? (typeof def?.shape === "function" ? def.shape() : def?.shape);
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
      } as Record<string, unknown>;
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
  const typeName: string = typeof def.typeName === "string"
    ? def.typeName
    : typeof def.type === "string"
      ? `Zod${def.type.charAt(0).toUpperCase()}${def.type.slice(1)}`
      : "";
  const inner = def.innerType
    ?? def.element
    ?? (typeof def.type === "object" ? def.type : null)
    ?? null;

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
      return serialized.includes(" | null") ? serialized : `${serialized} | null`;
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
  endpoints: Record<string, { method: string; path: string; description?: string; body?: unknown; query?: unknown; responses?: Record<number, unknown> }> | null,
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
        Object.entries(ep.responses).map(([code, schema]) => [code, serializeZodSchema(schema)]),
      );
    }
    result[name] = entry;
  }
  return result;
}

export function khotan(config: KhotanConfig): KhotanInstance {
  const { adapter, plugs, resources = [] } = config;

  // Validate: no duplicate resource names
  const resourceNames = new Set<string>();
  for (const resource of resources) {
    if (resourceNames.has(resource.name)) {
      throw new Error(`Duplicate resource name: "${resource.name}"`);
    }
    resourceNames.add(resource.name);
  }

  // Validate: no duplicate plug names
  const plugNames = new Set<string>();
  for (const plug of plugs) {
    if (plugNames.has(plug.name)) {
      throw new Error(`Duplicate plug name: "${plug.name}"`);
    }
    plugNames.add(plug.name);

    // Validate: flow resource references must match a registered resource
    if (plug.flows) {
      for (const flow of plug.flows) {
        if (flow.resource && !resourceNames.has(flow.resource)) {
          throw new Error(
            `Flow "${flow.name}" references unknown resource: "${flow.resource}"`,
          );
        }
      }
    }
  }

  const registeredFlowKeys = new Set(
    plugs.flatMap((plug) =>
      (plug.flows ?? []).map((flow) => `${plug.name}\0${flow.name}\0${flow.type}`),
    ),
  );

  function isRegisteredFlowRecord(flow: Record<string, unknown>): boolean {
    return (
      typeof flow["plugName"] === "string" &&
      typeof flow["name"] === "string" &&
      typeof flow["type"] === "string" &&
      registeredFlowKeys.has(`${flow["plugName"]}\0${flow["name"]}\0${flow["type"]}`)
    );
  }

  function getWebhookHandlersForPlug(plug: PlugRegistration): WebhookRegistration[] {
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

  async function doInit(): Promise<void> {
    if (initialized) return;

    // Upsert resources first, collect name→id map
    const resourceIdMap = new Map<string, string>();
    for (const resource of resources) {
      const { id } = await adapter.upsertResource({
        name: resource.name,
        connectField: resource.connectField,
        description: resource.description ?? null,
      });
      resourceIdMap.set(resource.name, id);
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
            const resourceId = resourceIdMap.get(flow.resource)!;
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
            const destPlugRow = await adapter.listPlugs().then(
              (all) => all.find((row) => row["name"] === handler.to),
            );
            await adapter.upsertWebhookHandler({
              wireId,
              name: handler.name,
              type: "pass",
              destinationPlugId: destPlugRow ? (destPlugRow["id"] as string) : null,
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

  function wire(plugName: string): WireInstance {
    const plugReg = plugs.find((p) => p.name === plugName);
    if (!plugReg) {
      throw new Error(`Plug "${plugName}" not registered`);
    }
    if (!plugReg.wires || plugReg.wires.length === 0) {
      throw new Error(`Plug "${plugName}" has no wire configuration`);
    }
    const wireConfig = plugReg.wires[0]!;

    function createBoundPlug(vars: Record<string, string>, _setVars?: (updates: Record<string, string>) => Promise<void>) {
      const plug = plugReg!.plug;
      const opts = (extra?: { body?: unknown; headers?: Record<string, string>; params?: Record<string, unknown> }) => ({
        ...extra,
        vars,
        ...(_setVars && { _setVars }),
      });
      return {
        get<T>(path: string, extra?: { params?: Record<string, unknown>; headers?: Record<string, string> }) { return plug.get<T>(path, opts(extra)); },
        post<T>(path: string, extra?: { body?: unknown; headers?: Record<string, string> }) { return plug.post<T>(path, opts(extra)); },
        put<T>(path: string, extra?: { body?: unknown; headers?: Record<string, string> }) { return plug.put<T>(path, opts(extra)); },
        patch<T>(path: string, extra?: { body?: unknown; headers?: Record<string, string> }) { return plug.patch<T>(path, opts(extra)); },
        delete<T>(path: string, extra?: { headers?: Record<string, string> }) { return plug.delete<T>(path, opts(extra)); },
      };
    }

    async function getWireVars(wireId: string): Promise<Record<string, string>> {
      const raw = await adapter.getWireMetadata(wireId);
      if (!raw) return {};
      if (!secret) {
        try { return JSON.parse(raw) as Record<string, string>; } catch { return {}; }
      }
      try {
        const decrypted = await decryptVars(raw, secret);
        return JSON.parse(decrypted) as Record<string, string>;
      } catch {
        try { return JSON.parse(raw) as Record<string, string>; } catch { return {}; }
      }
    }

    async function setWireVars(wireId: string, vars: Record<string, string>): Promise<void> {
      const serialized = JSON.stringify(vars);
      const toStore = secret ? await encryptVars(serialized, secret) : serialized;
      await adapter.updateWireMetadata(wireId, toStore);
    }

    return {
      async create(callbackUrl: string) {
        await init();
        kd("wire", `${plugName}: creating subscription, callbackUrl=${callbackUrl}`);

        const allPlugs = await adapter.listPlugs();
        const dbPlug = allPlugs.find((p) => p["name"] === plugName);
        if (!dbPlug) {
          throw new Error(`Plug "${plugName}" not found in database`);
        }
        const plugId = dbPlug["id"] as string;

        const existingWire = await adapter.getPlugWire(plugId);
        const wireId = existingWire
          ? (existingWire["id"] as string)
          : (await adapter.insertWire({ plugId, remoteId: "", callbackUrl, eventTypes: wireConfig.events })).id;

        const vars = secret ? await getVars(plugName).catch(() => ({})) : {};
        const _setVars = secret ? (updates: Record<string, string>) => setVars(plugName, { ...vars, ...updates }) : undefined;
        const boundPlug = createBoundPlug(vars, _setVars);

        const wireVars = await getWireVars(wireId);

        const result = await wireConfig.onSubscribe({
          plug: boundPlug,
          callbackUrl,
          events: wireConfig.events,
          wireVars,
          setWireVars: (updates) => setWireVars(wireId, { ...wireVars, ...updates }),
        });

        kd("wire", `${plugName}: subscription created, remoteId=${result.remoteId}`);

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

        const remoteId = (wireRecord["remoteId"] ?? wireRecord["remote_id"]) as string;
        kd("wire", `${plugName}: remoteId=${remoteId}`);
        if (!remoteId) {
          await adapter.updateWireStatus(wireId, "disabled");
          return;
        }

        const vars = secret ? await getVars(plugName).catch(() => ({})) : {};
        const _setVars = secret ? (updates: Record<string, string>) => setVars(plugName, { ...vars, ...updates }) : undefined;
        const boundPlug = createBoundPlug(vars, _setVars);

        const wireVars = await getWireVars(wireId);

        await wireConfig.onUnsubscribe({
          plug: boundPlug,
          remoteId,
          wireVars,
          setWireVars: (updates) => setWireVars(wireId, { ...wireVars, ...updates }),
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

  async function triggerFlowRun(flowId: string, body: unknown): Promise<Response> {
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

    const requestBody = body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
    const runType = typeof requestBody["runType"] === "string"
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
      const opts = (extra?: { body?: unknown; headers?: Record<string, string>; params?: Record<string, unknown> }) => ({
        ...extra,
        vars,
        ...(secret ? { _setVars: setFlowVars } : {}),
      });
      const boundPlug = {
        get<T>(path: string, extra?: { params?: Record<string, unknown>; headers?: Record<string, string> }) { return plugReg.plug.get<T>(path, opts(extra)); },
        post<T>(path: string, extra?: { body?: unknown; headers?: Record<string, string> }) { return plugReg.plug.post<T>(path, opts(extra)); },
        put<T>(path: string, extra?: { body?: unknown; headers?: Record<string, string> }) { return plugReg.plug.put<T>(path, opts(extra)); },
        patch<T>(path: string, extra?: { body?: unknown; headers?: Record<string, string> }) { return plugReg.plug.patch<T>(path, opts(extra)); },
        delete<T>(path: string, extra?: { headers?: Record<string, string> }) { return plugReg.plug.delete<T>(path, opts(extra)); },
      };

      const flowContext = {
        id: flowId,
        name: flowReg.name,
        type: flowReg.type,
        resource: flowReg.resource ?? null,
        to: flowReg.to ?? null,
      };

      if (flowReg.workflow) {
        const startWorkflow = await importWorkflowStart();
        const result = await startWorkflow(flowReg.workflow, [{
          flow: flowContext,
          runType,
          body: requestBody["body"],
          vars,
          khotanRunId: runId,
        }]);
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
          const message = payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error: unknown }).error)
            : `Failed to start flow "${flowNameOrId}"`;
          throw new Error(message);
        }

        return payload as Record<string, unknown>;
      },
    };
  }

  async function getRunWithWorkflowStatus(runId: string): Promise<Record<string, unknown> | null> {
    const run = await adapter.getRun(runId);
    if (!run) return null;

    const workflowRunId = typeof run["workflowRunId"] === "string"
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
      const workflowStatus = workflowRun.status ? await workflowRun.status : null;
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
    const mappingsIdx = segments.indexOf("mappings");
    const runsIdx = segments.indexOf("runs");
    const wiresIdx = segments.indexOf("wires");
    const webhookHandlersIdx = segments.indexOf("webhook-handlers");
    const webhookEventsIdx = segments.indexOf("webhook-events");
    const variablesIdx = segments.indexOf("variables");

    const debugIdx = segments.indexOf("debug");

    const limit = Math.min(
      Math.max(Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1),
      100,
    );
    const offset = Math.max(
      Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
      0,
    );

    if (request.method === "GET") {
      // GET .../debug — check if debug mode is active
      if (debugIdx !== -1 && debugIdx === segments.length - 1) {
        const debugActive = typeof process !== "undefined" && process.env?.["KHOTAN_DEBUG"];
        if (!debugActive) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json({ enabled: true });
      }

      // GET .../debug/:plugName — plug metadata for the debugger UI
      if (debugIdx !== -1 && debugIdx === segments.length - 2) {
        const debugActive = typeof process !== "undefined" && process.env?.["KHOTAN_DEBUG"];
        if (!debugActive) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        const plugName = segments[debugIdx + 1]!;
        const plugReg = plugs.find((p) => p.name === plugName);
        if (!plugReg) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const fields = plugReg.vars ?? plugReg.plug.varFields ?? [];
        const hasConfigured = await hasVars(plugName).catch(() => false);
        const rawEndpoints = plugReg.plug.endpoints ?? plugReg.endpoints ?? null;

        let varValues: Record<string, string> = {};
        if (hasConfigured || Object.keys(getDefaultVars(plugName)).length > 0) {
          try {
            const raw = await getVars(plugName);
            varValues = Object.fromEntries(
              Object.entries(maskVars(plugName, raw))
                .filter(([key]) => {
                  const field = (fields as readonly VarField[]).find((f) => f.key === key);
                  return field && !field.hidden;
                }),
            );
          } catch { /* no secret configured */ }
        }

        return Response.json({
          name: plugReg.name,
          baseUrl: plugReg.plug.baseUrl,
          authType: plugReg.plug.authType,
          endpoints: serializeEndpoints(rawEndpoints as Record<string, { method: string; path: string; description?: string; body?: unknown; query?: unknown; responses?: Record<number, unknown> }> | null),
          vars: {
            fields: (fields as readonly VarField[]).filter((f) => !f.hidden),
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
      if (webhookHandlersIdx !== -1 && webhookHandlersIdx === segments.length - 2) {
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
        for (const handler of plugReg ? getWebhookHandlersForPlug(plugReg) : []) {
          configuredHandlerEvents.set(`${handler.type}:${handler.name}`, handler.events);
        }
        const handlersWithRuns = await Promise.all(
          handlers.map(async (handler) => {
            const handlerId = handler["id"];
            if (typeof handlerId !== "string") return handler;
            const latestRun = await adapter.getLatestWebhookHandlerRun(handlerId);
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
        const parsedStartIndex = startIndexParam == null
          ? null
          : Number.parseInt(startIndexParam, 10);
        const namespace = url.searchParams.get("namespace") ?? undefined;
        const getRun = await importWorkflowGetRun();
        const workflowRun = getRun(workflowRunId);
        const streamOptions: { startIndex?: number; namespace?: string } = {};
        if (typeof parsedStartIndex === "number" && Number.isFinite(parsedStartIndex)) {
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
        return Response.json(filtered);
      }

      // GET .../resources/:id/mappings
      if (
        resourcesIdx !== -1 &&
        resourcesIdx === segments.length - 3 &&
        segments[resourcesIdx + 2] === "mappings"
      ) {
        const resourceId = segments[resourcesIdx + 1]!;
        const data = await adapter.listMappings(resourceId);
        return Response.json(data);
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
        return Response.json({ ...resource, flows });
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
      // POST .../webhook/:plugName — receive inbound webhooks
      const webhookIdx = segments.indexOf("webhook");
      if (webhookIdx !== -1 && webhookIdx === segments.length - 2) {
        const plugName = segments[webhookIdx + 1]!;
        const plugReg = plugs.find((p) => p.name === plugName);
        if (!plugReg) {
          return Response.json({ error: `Unknown plug: ${plugName}` }, { status: 404 });
        }

        const wireConfig = plugReg.wires?.[0];
        if (!wireConfig || !wireConfig.onVerify) {
          return Response.json({ error: `No active wire for plug: ${plugName}` }, { status: 404 });
        }

        const rawBody = await request.text();

        // Get wireVars for verification
        const allPlugs = await adapter.listPlugs();
        const dbPlug = allPlugs.find((p) => p["name"] === plugName);
        if (!dbPlug) {
          return Response.json({ error: `Plug "${plugName}" not found in database` }, { status: 404 });
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
                try { wireVars = JSON.parse(raw) as Record<string, string>; } catch { /* empty */ }
              }
            } else {
              try { wireVars = JSON.parse(raw) as Record<string, string>; } catch { /* empty */ }
            }
          }
        }

        // Convert headers to plain Record
        const headers: Record<string, string> = {};
        request.headers.forEach((value, key) => { headers[key] = value; });

        const verified = await wireConfig.onVerify({ headers, body: rawBody, wireVars });
        if (!verified) {
          return Response.json({ error: "Webhook verification failed" }, { status: 401 });
        }

        // Parse JSON after verification
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          event = {};
        }
        const eventType = typeof event["type"] === "string" ? event["type"] : "unknown";

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
            const dbHandlers = wireId ? await adapter.listWebhookHandlers(wireId) : [];

            for (const c of catches) {
              if (Array.isArray(c.events) && c.events.length > 0 && !c.events.includes(eventType)) {
                continue;
              }
              const handlerRow = dbHandlers.find((h) => h["name"] === c.name && h["type"] === "catch");
              if (handlerRow && handlerRow["enabled"] === false) {
                continue;
              }
              const handlerId = handlerRow ? (handlerRow["id"] as string) : null;
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
                const result = await startWorkflow(c.workflow, [{ event, eventType, headers, khotanRunId }]);
                const workflowRunId = result && typeof result === "object"
                  ? ("runId" in result
                      ? String((result as { runId: unknown }).runId)
                      : "id" in result
                        ? String((result as { id: unknown }).id)
                        : null)
                  : null;
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

            for (const p of passes) {
              if (Array.isArray(p.events) && p.events.length > 0 && !p.events.includes(eventType)) {
                continue;
              }
              const handlerRow = dbHandlers.find((h) => h["name"] === p.name && h["type"] === "pass");
              if (handlerRow && handlerRow["enabled"] === false) {
                continue;
              }
              let destVars: Record<string, string> = {};
              const destPlug = allPlugs.find((dp) => dp["name"] === p.to);
              if (destPlug) {
                const destPlugId = destPlug["id"] as string;
                const encrypted = await adapter.getEncryptedVariables(destPlugId);
                if (encrypted && secret) {
                  try {
                    const json = await decryptVars(encrypted, secret);
                    destVars = JSON.parse(json) as Record<string, string>;
                  } catch { /* empty */ }
                }
              }
              const handlerId = handlerRow ? (handlerRow["id"] as string) : null;
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
                const result = await startWorkflow(p.workflow, [{ event, eventType, headers, destVars, khotanRunId }]);
                const workflowRunId = result && typeof result === "object"
                  ? ("runId" in result
                      ? String((result as { runId: unknown }).runId)
                      : "id" in result
                        ? String((result as { id: unknown }).id)
                        : null)
                  : null;
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
          } catch (err) {
            kd("webhook", `${plugName}: workflow start failed:`, err);
          }
        });

        return Response.json({ received: true }, { status: 202 });
      }

      // POST .../debug/:plugName — dev-only proxy through plug
      if (debugIdx !== -1 && debugIdx === segments.length - 2) {
        const debugActive = typeof process !== "undefined" && process.env?.["KHOTAN_DEBUG"];
        if (!debugActive) {
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
            ? (updates: Record<string, string>) => setVars(plugName, { ...vars, ...updates })
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

          const allEndpoints: Record<string, { method: string; path: string }> | undefined =
            plugReg.plug.endpoints ?? plugReg.endpoints;
          if (allEndpoints) {
            const matched = Object.entries(allEndpoints).find(
              ([, ep]) => ep.method.toUpperCase() === method && ep.path === reqPath,
            );
            if (matched) {
              response["endpoint"] = { name: matched[0], method: matched[1].method, path: matched[1].path };
            }
          }

          return Response.json(response);
        } catch (err) {
          const timing = Date.now() - start;
          const error = err instanceof Error ? err.message : "Unknown error";
          const errBody = err && typeof err === "object" && "body" in err ? (err as { body: unknown }).body : null;
          const errStatus = err && typeof err === "object" && "status" in err ? (err as { status: number }).status : 500;

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
          const message = error instanceof Error ? error.message : "Unknown error";
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
        const runType = typeof run["runType"] === "string" ? run["runType"] : "full";
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
          return Response.json({ error: "callbackUrl is required" }, { status: 400 });
        }
        try {
          const record = await wire(plugName).create(body.callbackUrl);
          return Response.json({ wire: record }, { status: 201 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          kd("wire", `${plugName}: create failed:`, message);
          if (error && typeof error === "object" && "body" in error) {
            kd("wire", `${plugName}: response body:`, (error as { body: unknown }).body);
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
        const body = (await request.json()) as {
          resourceId: string;
          plugName: string;
          ref: string;
        };
        const mapping = await adapter.lookupMapping(body);
        if (!mapping) {
          return Response.json({ error: "Mapping not found" }, { status: 404 });
        }
        return Response.json(mapping);
      }

      // POST .../mappings
      if (mappingsIdx !== -1 && mappingsIdx === segments.length - 1) {
        const body = (await request.json()) as {
          resourceId: string;
          connectValue: string;
          refs: Record<string, string>;
          metadata?: Record<string, unknown> | null;
        };
        const result = await adapter.upsertMapping(body);
        return Response.json(
          { id: result.id },
          { status: result.created ? 201 : 200 },
        );
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
      if (webhookHandlersIdx !== -1 && webhookHandlersIdx === segments.length - 2) {
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
          connectValue: string;
          refs: Record<string, string>;
          metadata?: Record<string, unknown> | null;
        };
        const result = await adapter.upsertMapping({ ...body, id: mappingId });
        return Response.json(result);
      }
    }

    if (request.method === "DELETE") {
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
          return Response.json({ error: "wireId is required" }, { status: 400 });
        }
        try {
          await wire(plugName).delete(body.wireId);
          return new Response(null, { status: 204 });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          kd("wire", `${plugName}: delete failed: ${message}`);
          return Response.json({ error: message }, { status: 500 });
        }
      }

      // DELETE .../mappings/:id
      if (mappingsIdx !== -1 && mappingsIdx === segments.length - 2) {
        const mappingId = segments[mappingsIdx + 1]!;
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

  async function getStoredVarsByPlugId(plugId: string): Promise<Record<string, string>> {
    if (!secret) {
      throw new Error("KHOTAN_SECRET is required for var operations");
    }
    const encrypted = await adapter.getEncryptedVariables(plugId);
    if (!encrypted) return {};
    const json = await decryptVars(encrypted, secret);
    return JSON.parse(json) as Record<string, string>;
  }

  async function setVarsByPlugId(plugId: string, vars: Record<string, string>): Promise<void> {
    if (!secret) {
      throw new Error("KHOTAN_SECRET is required for var operations");
    }
    const json = JSON.stringify(vars);
    const encrypted = await encryptVars(json, secret);
    await adapter.setEncryptedVariables(plugId, encrypted);
  }

  async function seedDefaultVarsForPlug(plugId: string, plugName: string): Promise<void> {
    const defaults = getDefaultVars(plugName);
    if (!secret || Object.keys(defaults).length === 0) {
      return;
    }

    const storedVars: Record<string, string> = await getStoredVarsByPlugId(plugId).catch(
      () => ({} as Record<string, string>),
    );
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

  async function setVars(plugName: string, vars: Record<string, string>): Promise<void> {
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

  return { handler, init, flow, wire, getVars, setVars, clearVars, hasVars, getVarFields, getPlug };
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
