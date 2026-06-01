import { eq, desc, sql, count } from "drizzle-orm";
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
  encryptedCredentials: text("encrypted_credentials"),
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

const khotanRuns = pgTable(
  "khotan_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    syncId: text("sync_id").notNull(),
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

export interface PlugRegistration {
  name: string;
  baseUrl: string;
  authType: "bearer" | "basic" | "apiKey" | "custom";
  syncs?: SyncRegistration[];
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
}

export interface KhotanConfig {
  adapter: KhotanAdapter;
  plugs: PlugRegistration[];
  resources?: ResourceRegistration[];
}

export type KhotanHandler = (request: Request) => Promise<Response>;

export interface KhotanInstance {
  handler: KhotanHandler;
  init(): Promise<void>;
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
  };
}

// ---------------------------------------------------------------------------
// khotan factory
// ---------------------------------------------------------------------------

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
        baseUrl: plug.baseUrl,
        authType: plug.authType,
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
    }

    initialized = true;
  }

  async function init(): Promise<void> {
    initPromise ??= doInit();
    return initPromise;
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

    if (request.method === "GET") {
      // GET .../plugs
      if (plugsIdx !== -1 && plugsIdx === segments.length - 1) {
        const data = await adapter.listPlugs();
        return Response.json(data);
      }

      // GET .../plugs/:id
      if (plugsIdx !== -1 && plugsIdx === segments.length - 2) {
        const plugId = segments[plugsIdx + 1]!;
        const plug = await adapter.getPlug(plugId);
        if (!plug) {
          return Response.json({ error: "Plug not found" }, { status: 404 });
        }
        const syncs = await adapter.getPlugSyncs(plugId);
        return Response.json({ ...plug, syncs });
      }

      // GET .../syncs
      if (syncsIdx !== -1 && syncsIdx === segments.length - 1) {
        const data = await adapter.listSyncs();
        return Response.json(data);
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

      // GET .../resources
      if (resourcesIdx !== -1 && resourcesIdx === segments.length - 1) {
        const data = await adapter.listResources();
        return Response.json(data);
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
        if (!resource) {
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
      // DELETE .../mappings/:id
      if (mappingsIdx !== -1 && mappingsIdx === segments.length - 2) {
        const mappingId = segments[mappingsIdx + 1]!;
        await adapter.deleteMapping(mappingId);
        return new Response(null, { status: 204 });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return { handler, init };
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
    DELETE: handle,
  };
}
