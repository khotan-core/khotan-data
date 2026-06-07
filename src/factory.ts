import { eq, desc, sql, count } from "drizzle-orm";

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

const khotanSyncs = pgTable(
  "khotan_syncs",
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
      enum: ["ok", "failed"],
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("khotan_syncs_plug_id_name_unique").on(table.plugId, table.name),
    index("khotan_syncs_plug_id_idx").on(table.plugId),
    index("khotan_syncs_resource_id_idx").on(table.resourceId),
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

const khotanRuns = pgTable(
  "khotan_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    syncId: text("sync_id"),
    wireId: text("wire_id"),
    runType: text("run_type", {
      enum: ["full", "delta", "backfill", "reconcile", "dry-run"],
    }).notNull(),
    status: text("status", {
      enum: ["pending", "running", "ok", "failed"],
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
    index("khotan_runs_sync_id_idx").on(table.syncId),
    index("khotan_runs_wire_id_idx").on(table.wireId),
    index("khotan_runs_status_idx").on(table.status),
    index("khotan_runs_sync_id_started_at_idx").on(
      table.syncId,
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

export interface SyncRegistration {
  name: string;
  type: "inflow" | "outflow" | "relay" | "webhook";
  schedule?: string;
  resource?: string;
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

export interface WireRegistration {
  events: string[];
  onSubscribe(ctx: WireSubscribeContext): Promise<{ remoteId: string }>;
  onUnsubscribe(ctx: WireUnsubscribeContext): Promise<void>;
  onVerify?(ctx: { headers: Headers; body: unknown; wireVars: Record<string, string> }): Promise<boolean>;
}

export interface VarField {
  readonly key: string;
  label: string;
  type: "text" | "password" | "url";
  secret?: boolean;
  hidden?: boolean;
  required?: boolean;
  placeholder?: string;
}

export interface PlugRegistration {
  name: string;
  plug: { baseUrl: string; authType: string; varFields?: readonly VarField[]; get<T>(path: string, options?: { params?: Record<string, unknown>; headers?: Record<string, string>; vars?: Record<string, string>; _setVars?: (updates: Record<string, string>) => Promise<void>; _skipHooks?: boolean }): Promise<T>; post<T>(path: string, options?: { body?: unknown; headers?: Record<string, string>; vars?: Record<string, string>; _setVars?: (updates: Record<string, string>) => Promise<void>; _skipHooks?: boolean }): Promise<T>; put<T>(path: string, options?: { body?: unknown; headers?: Record<string, string>; vars?: Record<string, string>; _setVars?: (updates: Record<string, string>) => Promise<void>; _skipHooks?: boolean }): Promise<T>; patch<T>(path: string, options?: { body?: unknown; headers?: Record<string, string>; vars?: Record<string, string>; _setVars?: (updates: Record<string, string>) => Promise<void>; _skipHooks?: boolean }): Promise<T>; delete<T>(path: string, options?: { headers?: Record<string, string>; vars?: Record<string, string>; _setVars?: (updates: Record<string, string>) => Promise<void>; _skipHooks?: boolean }): Promise<T> };
  vars?: VarField[];
  syncs?: SyncRegistration[];
  endpoints?: Record<string, { method: string; path: string }>;
  wires?: WireRegistration[];
}

export interface KhotanAdapter {
  upsertPlug(plug: {
    name: string;
    baseUrl: string;
    authType: string;
  }): Promise<{ id: string }>;
  upsertSync(sync: {
    plugId: string;
    name: string;
    type: string;
    schedule?: string | null;
  }): Promise<{ id: string }>;
  listPlugs(): Promise<Record<string, unknown>[]>;
  getPlug(id: string): Promise<Record<string, unknown> | null>;
  getPlugSyncs(plugId: string): Promise<Record<string, unknown>[]>;
  listSyncs(): Promise<Record<string, unknown>[]>;
  listRuns(syncId: string): Promise<Record<string, unknown>[]>;

  upsertResource(resource: {
    name: string;
    connectField: string;
    description?: string | null;
  }): Promise<{ id: string }>;
  listResources(): Promise<Record<string, unknown>[]>;
  getResource(id: string): Promise<Record<string, unknown> | null>;
  getResourceSyncs(resourceId: string): Promise<Record<string, unknown>[]>;

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

  updateSyncResourceId(syncId: string, resourceId: string): Promise<void>;
  togglePlugEnabled(plugId: string, enabled: boolean): Promise<void>;
  toggleSyncEnabled(syncId: string, enabled: boolean): Promise<void>;

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
  getEncryptedCredentials(plugId: string): Promise<string | null>;
  setEncryptedCredentials(plugId: string, encrypted: string): Promise<void>;
  clearEncryptedCredentials(plugId: string): Promise<void>;
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

export interface KhotanInstance {
  handler: KhotanHandler;
  init(): Promise<void>;
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

    async upsertSync(sync) {
      const rows = await db
        .insert(khotanSyncs)
        .values({
          plugId: sync.plugId,
          name: sync.name,
          type: sync.type as "inflow" | "outflow" | "relay" | "webhook",
          schedule: sync.schedule ?? null,
        })
        .onConflictDoUpdate({
          target: [khotanSyncs.plugId, khotanSyncs.name],
          set: {
            type: sync.type as "inflow" | "outflow" | "relay" | "webhook",
            schedule: sync.schedule ?? null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: khotanSyncs.id });
      return { id: rows[0]!.id };
    },

    async listPlugs() {
      const syncCounts = db
        .select({
          plugId: khotanSyncs.plugId,
          syncCount: count(khotanSyncs.id).as("sync_count"),
        })
        .from(khotanSyncs)
        .groupBy(khotanSyncs.plugId)
        .as("sync_counts");

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
          syncCount: sql<number>`coalesce(${syncCounts.syncCount}, 0)`,
        })
        .from(khotanPlugs)
        .leftJoin(syncCounts, eq(khotanPlugs.id, syncCounts.plugId));

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

    async getPlugSyncs(plugId) {
      return db
        .select()
        .from(khotanSyncs)
        .where(eq(khotanSyncs.plugId, plugId));
    },

    async listSyncs() {
      const rows = await db
        .select({
          id: khotanSyncs.id,
          plugId: khotanSyncs.plugId,
          name: khotanSyncs.name,
          type: khotanSyncs.type,
          enabled: khotanSyncs.enabled,
          schedule: khotanSyncs.schedule,
          lastRunAt: khotanSyncs.lastRunAt,
          lastRunStatus: khotanSyncs.lastRunStatus,
          createdAt: khotanSyncs.createdAt,
          updatedAt: khotanSyncs.updatedAt,
          plugName: khotanPlugs.name,
        })
        .from(khotanSyncs)
        .leftJoin(khotanPlugs, eq(khotanSyncs.plugId, khotanPlugs.id));

      return rows;
    },

    async listRuns(syncId) {
      return db
        .select()
        .from(khotanRuns)
        .where(eq(khotanRuns.syncId, syncId))
        .orderBy(desc(khotanRuns.startedAt));
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
      const syncCounts = db
        .select({
          resourceId: khotanSyncs.resourceId,
          syncCount: count(khotanSyncs.id).as("sync_count"),
        })
        .from(khotanSyncs)
        .where(sql`${khotanSyncs.resourceId} is not null`)
        .groupBy(khotanSyncs.resourceId)
        .as("sync_counts");

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
          syncCount: sql<number>`coalesce(${syncCounts.syncCount}, 0)`,
          mappingCount: sql<number>`coalesce(${mappingCounts.mappingCount}, 0)`,
        })
        .from(khotanResources)
        .leftJoin(syncCounts, eq(khotanResources.id, syncCounts.resourceId))
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

    async getResourceSyncs(resourceId) {
      return db
        .select()
        .from(khotanSyncs)
        .where(eq(khotanSyncs.resourceId, resourceId));
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

    async updateSyncResourceId(syncId, resourceId) {
      await db
        .update(khotanSyncs)
        .set({ resourceId, updatedAt: new Date() })
        .where(eq(khotanSyncs.id, syncId));
    },

    async togglePlugEnabled(plugId, enabled) {
      await db
        .update(khotanPlugs)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(khotanPlugs.id, plugId));
    },

    async toggleSyncEnabled(syncId, enabled) {
      await db
        .update(khotanSyncs)
        .set({ enabled, updatedAt: new Date() })
        .where(eq(khotanSyncs.id, syncId));
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

    async getEncryptedCredentials(plugId) {
      const rows = await db
        .select({ encryptedVars: khotanPlugs.encryptedVars })
        .from(khotanPlugs)
        .where(eq(khotanPlugs.id, plugId))
        .limit(1);
      return rows[0]?.encryptedVars ?? null;
    },

    async setEncryptedCredentials(plugId, encrypted) {
      await db
        .update(khotanPlugs)
        .set({ encryptedVars: encrypted, updatedAt: new Date() })
        .where(eq(khotanPlugs.id, plugId));
    },

    async clearEncryptedCredentials(plugId) {
      await db
        .update(khotanPlugs)
        .set({ encryptedVars: null, updatedAt: new Date() })
        .where(eq(khotanPlugs.id, plugId));
    },
  };
}

// ---------------------------------------------------------------------------
// khotan factory
// ---------------------------------------------------------------------------

function extractEventTypes(body: Record<string, unknown>): string[] {
  const candidates = body["eventTypes"] ?? body["event_types"] ?? body["events"] ?? body["enabled_events"];
  if (Array.isArray(candidates)) return candidates as string[];
  return [];
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

    // Validate: sync resource references must match a registered resource
    if (plug.syncs) {
      for (const sync of plug.syncs) {
        if (sync.resource && !resourceNames.has(sync.resource)) {
          throw new Error(
            `Sync "${sync.name}" references unknown resource: "${sync.resource}"`,
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

      if (plug.syncs) {
        for (const sync of plug.syncs) {
          const { id: syncId } = await adapter.upsertSync({
            plugId,
            name: sync.name,
            type: sync.type,
            schedule: sync.schedule ?? null,
          });

          if (sync.resource) {
            const resourceId = resourceIdMap.get(sync.resource)!;
            await adapter.updateSyncResourceId(syncId, resourceId);
          }
        }
      }

      if (plug.wires) {
        for (const _wire of plug.wires) {
          await adapter.upsertWire({ plugId });
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

        const vars = secret ? await getVars(plugName) : {};
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

        const vars = secret ? await getVars(plugName) : {};
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

  async function handler(request: Request): Promise<Response> {
    await init();

    const url = new URL(request.url);
    const segments = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean);

    const plugsIdx = segments.indexOf("plugs");
    const syncsIdx = segments.indexOf("syncs");
    const resourcesIdx = segments.indexOf("resources");
    const mappingsIdx = segments.indexOf("mappings");
    const wiresIdx = segments.indexOf("wires");
    const credentialsIdx = segments.indexOf("credentials");

    if (request.method === "GET") {
      // GET .../credentials/:plugName
      if (credentialsIdx !== -1 && credentialsIdx === segments.length - 2) {
        const plugName = segments[credentialsIdx + 1]!;
        if (!plugNames.has(plugName)) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const fields = getVarFields(plugName);
        const hasValues = await hasVars(plugName);
        let masked: Record<string, string> = {};
        if (hasValues) {
          try {
            const vars = await getVars(plugName);
            masked = Object.fromEntries(
              Object.entries(vars).map(([key, value]) => {
                const field = fields.find((f) => f.key === key);
                if (field?.secret) {
                  return [key, value ? "••••••••" : ""];
                }
                return [key, value];
              }),
            );
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

      // GET .../plugs
      if (plugsIdx !== -1 && plugsIdx === segments.length - 1) {
        const data = await adapter.listPlugs();
        const filtered = data.filter(
          (p) => typeof p["name"] === "string" && plugNames.has(p["name"]),
        );
        return Response.json(filtered);
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
        const syncs = await adapter.getPlugSyncs(plugId);
        return Response.json({ ...plug, syncs });
      }

      // GET .../syncs — only syncs belonging to registered plugs
      if (syncsIdx !== -1 && syncsIdx === segments.length - 1) {
        const data = await adapter.listSyncs();
        const filtered = data.filter(
          (s) =>
            typeof s["plugName"] === "string" && plugNames.has(s["plugName"]),
        );
        return Response.json(filtered);
      }

      // GET .../syncs/:id/runs
      if (
        syncsIdx !== -1 &&
        syncsIdx === segments.length - 3 &&
        segments[syncsIdx + 2] === "runs"
      ) {
        const syncId = segments[syncsIdx + 1]!;
        const data = await adapter.listRuns(syncId);
        return Response.json(data);
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
        const syncs = await adapter.getResourceSyncs(resourceId);
        return Response.json({ ...resource, syncs });
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
      // POST .../debug/:plugName — dev-only proxy through plug
      const debugIdx = segments.indexOf("debug");
      if (debugIdx !== -1 && debugIdx === segments.length - 2) {
        if (!_khotanDebug) {
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
          const opts: { body?: unknown; params?: Record<string, unknown>; headers?: Record<string, string> } = {};
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

          if (plugReg.endpoints) {
            const matched = Object.entries(plugReg.endpoints).find(
              ([, ep]) => ep.method.toUpperCase() === method && ep.path === reqPath,
            );
            if (matched) {
              response.endpoint = { name: matched[0], method: matched[1].method, path: matched[1].path };
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

      // POST .../credentials/:plugName
      if (credentialsIdx !== -1 && credentialsIdx === segments.length - 2) {
        const plugName = segments[credentialsIdx + 1]!;
        if (!plugNames.has(plugName)) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const body = (await request.json()) as Record<string, string>;
        const fields = getVarFields(plugName);

        const missing = fields
          .filter((f) => f.required !== false && !body[f.key])
          .map((f) => f.key);
        if (missing.length > 0) {
          return Response.json(
            { error: `Missing required fields: ${missing.join(", ")}` },
            { status: 400 },
          );
        }

        const vars: Record<string, string> = {};
        for (const field of fields) {
          const value = body[field.key];
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

      // PATCH .../syncs/:id
      if (syncsIdx !== -1 && syncsIdx === segments.length - 2) {
        const syncId = segments[syncsIdx + 1]!;
        const body = (await request.json()) as { enabled?: boolean };
        if (typeof body.enabled === "boolean") {
          await adapter.toggleSyncEnabled(syncId, body.enabled);
        }
        return Response.json({ id: syncId, ...body });
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
      // DELETE .../credentials/:plugName
      if (credentialsIdx !== -1 && credentialsIdx === segments.length - 2) {
        const plugName = segments[credentialsIdx + 1]!;
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

  async function getVars(plugName: string): Promise<Record<string, string>> {
    if (!secret) {
      throw new Error("KHOTAN_SECRET is required for var operations");
    }
    const plugId = await resolvePlugId(plugName);
    const encrypted = await adapter.getEncryptedCredentials(plugId);
    if (!encrypted) return {};
    const json = await decryptVars(encrypted, secret);
    return JSON.parse(json) as Record<string, string>;
  }

  async function setVars(plugName: string, vars: Record<string, string>): Promise<void> {
    if (!secret) {
      throw new Error("KHOTAN_SECRET is required for var operations");
    }
    const plugId = await resolvePlugId(plugName);
    const json = JSON.stringify(vars);
    const encrypted = await encryptVars(json, secret);
    await adapter.setEncryptedCredentials(plugId, encrypted);
  }

  async function clearVars(plugName: string): Promise<void> {
    const plugId = await resolvePlugId(plugName);
    await adapter.clearEncryptedCredentials(plugId);
  }

  async function hasVars(plugName: string): Promise<boolean> {
    const plugId = await resolvePlugId(plugName);
    const encrypted = await adapter.getEncryptedCredentials(plugId);
    return encrypted !== null && encrypted !== "";
  }

  function getVarFields(plugName: string): readonly VarField[] {
    const plugReg = plugs.find((p) => p.name === plugName);
    if (!plugReg) {
      throw new Error(`Plug "${plugName}" not registered`);
    }
    return plugReg.vars ?? plugReg.plug.varFields ?? [];
  }

  function getPlug(plugName: string): PlugRegistration["plug"] {
    const plugReg = plugs.find((p) => p.name === plugName);
    if (!plugReg) {
      throw new Error(`Plug "${plugName}" not registered`);
    }
    return plugReg.plug;
  }

  return { handler, init, wire, getVars, setVars, clearVars, hasVars, getVarFields, getPlug };
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
