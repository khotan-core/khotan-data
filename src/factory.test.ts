import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  khotan,
  toNextJsHandler,
  type KhotanAdapter,
  type PlugRegistration,
  type ResourceRegistration,
} from "./factory.js";

interface StoredSync {
  id: string;
  plugId: string;
  name: string;
  type: string;
  schedule: string | null;
  resourceId: string | null;
}

interface StoredMapping {
  id: string;
  resourceId: string;
  connectValue: string;
  refs: Record<string, string>;
  metadata: Record<string, unknown> | null;
}

function createMockAdapter(): KhotanAdapter {
  const plugStore = new Map<
    string,
    {
      id: string;
      name: string;
      baseUrl: string;
      authType: string;
      enabled: boolean;
    }
  >();
  const syncStore = new Map<string, StoredSync & { enabled: boolean }>();
  const resourceStore = new Map<
    string,
    {
      id: string;
      name: string;
      connectField: string;
      description: string | null;
    }
  >();
  const mappingStore = new Map<string, StoredMapping>();
  let plugCounter = 0;
  let syncCounter = 0;
  let resourceCounter = 0;
  let mappingCounter = 0;

  return {
    upsertPlug: vi.fn(async (plug) => {
      const existing = [...plugStore.values()].find(
        (p) => p.name === plug.name,
      );
      if (existing) {
        existing.baseUrl = plug.baseUrl;
        existing.authType = plug.authType;
        return { id: existing.id };
      }
      const id = `plug-${++plugCounter}`;
      plugStore.set(id, { id, ...plug, enabled: true });
      return { id };
    }),

    upsertSync: vi.fn(async (sync) => {
      const existing = [...syncStore.values()].find(
        (s) => s.plugId === sync.plugId && s.name === sync.name,
      );
      if (existing) {
        existing.type = sync.type;
        existing.schedule = sync.schedule ?? null;
        return { id: existing.id };
      }
      const id = `sync-${++syncCounter}`;
      syncStore.set(id, {
        id,
        plugId: sync.plugId,
        name: sync.name,
        type: sync.type,
        schedule: sync.schedule ?? null,
        resourceId: null,
        enabled: true,
      });
      return { id };
    }),

    listPlugs: vi.fn(async () => {
      return [...plugStore.values()].map((p) => ({
        ...p,
        status: "idle",
        syncCount: [...syncStore.values()].filter((s) => s.plugId === p.id)
          .length,
      }));
    }),

    getPlug: vi.fn(async (id: string) => {
      return plugStore.get(id) ?? null;
    }),

    getPlugSyncs: vi.fn(async (plugId: string) => {
      return [...syncStore.values()].filter((s) => s.plugId === plugId);
    }),

    listSyncs: vi.fn(async () => {
      return [...syncStore.values()].map((s) => ({
        ...s,
        plugName: plugStore.get(s.plugId)?.name ?? null,
      }));
    }),

    listRuns: vi.fn(async () => []),

    upsertResource: vi.fn(async (resource) => {
      const existing = [...resourceStore.values()].find(
        (r) => r.name === resource.name,
      );
      if (existing) {
        existing.connectField = resource.connectField;
        existing.description = resource.description ?? null;
        return { id: existing.id };
      }
      const id = `resource-${++resourceCounter}`;
      resourceStore.set(id, {
        id,
        name: resource.name,
        connectField: resource.connectField,
        description: resource.description ?? null,
      });
      return { id };
    }),

    listResources: vi.fn(async () => {
      return [...resourceStore.values()].map((r) => ({
        ...r,
        syncCount: [...syncStore.values()].filter((s) => s.resourceId === r.id)
          .length,
        mappingCount: [...mappingStore.values()].filter(
          (m) => m.resourceId === r.id,
        ).length,
      }));
    }),

    getResource: vi.fn(async (id: string) => {
      return resourceStore.get(id) ?? null;
    }),

    getResourceSyncs: vi.fn(async (resourceId: string) => {
      return [...syncStore.values()].filter((s) => s.resourceId === resourceId);
    }),

    upsertMapping: vi.fn(async (mapping) => {
      if (mapping.id) {
        const existing = mappingStore.get(mapping.id);
        if (existing) {
          existing.refs = mapping.refs;
          existing.metadata = mapping.metadata ?? null;
          return { id: existing.id, created: false };
        }
      }
      const existing = [...mappingStore.values()].find(
        (m) =>
          m.resourceId === mapping.resourceId &&
          m.connectValue === mapping.connectValue,
      );
      if (existing) {
        existing.refs = { ...existing.refs, ...mapping.refs };
        existing.metadata = mapping.metadata ?? null;
        return { id: existing.id, created: false };
      }
      const id = `mapping-${++mappingCounter}`;
      mappingStore.set(id, {
        id,
        resourceId: mapping.resourceId,
        connectValue: mapping.connectValue,
        refs: mapping.refs,
        metadata: mapping.metadata ?? null,
      });
      return { id, created: true };
    }),

    getMapping: vi.fn(async (id: string) => {
      return mappingStore.get(id) ?? null;
    }),

    listMappings: vi.fn(async (resourceId: string) => {
      return [...mappingStore.values()].filter(
        (m) => m.resourceId === resourceId,
      );
    }),

    deleteMapping: vi.fn(async (id: string) => {
      mappingStore.delete(id);
    }),

    lookupMapping: vi.fn(
      async ({
        resourceId,
        plugName,
        ref,
      }: {
        resourceId: string;
        plugName: string;
        ref: string;
      }) => {
        const found = [...mappingStore.values()].find(
          (m) => m.resourceId === resourceId && m.refs[plugName] === ref,
        );
        return found ?? null;
      },
    ),

    updateSyncResourceId: vi.fn(async (syncId: string, resourceId: string) => {
      const sync = syncStore.get(syncId);
      if (sync) sync.resourceId = resourceId;
    }),

    togglePlugEnabled: vi.fn(async (plugId: string, enabled: boolean) => {
      const plug = plugStore.get(plugId);
      if (plug) plug.enabled = enabled;
    }),

    toggleSyncEnabled: vi.fn(async (syncId: string, enabled: boolean) => {
      const sync = syncStore.get(syncId);
      if (sync) sync.enabled = enabled;
    }),
  };
}

function makeRequest(path: string, method = "GET", body?: unknown): Request {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(`http://localhost${path}`, init);
}

describe("khotan factory", () => {
  let adapter: KhotanAdapter;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  describe("registration validation", () => {
    it("throws on duplicate plug names", () => {
      const plugs: PlugRegistration[] = [
        {
          name: "stripe",
          baseUrl: "https://api.stripe.com",
          authType: "bearer",
        },
        {
          name: "stripe",
          baseUrl: "https://api.stripe.com/v2",
          authType: "bearer",
        },
      ];

      expect(() => khotan({ adapter, plugs })).toThrow(
        'Duplicate plug name: "stripe"',
      );
    });

    it("accepts an empty plugs array", () => {
      const instance = khotan({ adapter, plugs: [] });
      expect(instance).toHaveProperty("handler");
      expect(instance).toHaveProperty("init");
    });

    it("accepts unique plug names", () => {
      const plugs: PlugRegistration[] = [
        {
          name: "stripe",
          baseUrl: "https://api.stripe.com",
          authType: "bearer",
        },
        {
          name: "github",
          baseUrl: "https://api.github.com",
          authType: "bearer",
        },
      ];

      expect(() => khotan({ adapter, plugs })).not.toThrow();
    });

    it("throws on duplicate resource names", () => {
      const resources: ResourceRegistration[] = [
        { name: "products", connectField: "sku" },
        { name: "products", connectField: "product_id" },
      ];

      expect(() => khotan({ adapter, plugs: [], resources })).toThrow(
        'Duplicate resource name: "products"',
      );
    });

    it("throws when sync references unknown resource", () => {
      const plugs: PlugRegistration[] = [
        {
          name: "shopify",
          baseUrl: "https://shopify.com",
          authType: "bearer",
          syncs: [
            { name: "products-inflow", type: "inflow", resource: "products" },
          ],
        },
      ];

      expect(() => khotan({ adapter, plugs })).toThrow(
        'Sync "products-inflow" references unknown resource: "products"',
      );
    });

    it("accepts sync with valid resource reference", () => {
      const resources: ResourceRegistration[] = [
        { name: "products", connectField: "sku" },
      ];
      const plugs: PlugRegistration[] = [
        {
          name: "shopify",
          baseUrl: "https://shopify.com",
          authType: "bearer",
          syncs: [
            { name: "products-inflow", type: "inflow", resource: "products" },
          ],
        },
      ];

      expect(() => khotan({ adapter, plugs, resources })).not.toThrow();
    });
  });

  describe("init()", () => {
    it("upserts registered plugs and syncs", async () => {
      const plugs: PlugRegistration[] = [
        {
          name: "stripe",
          baseUrl: "https://api.stripe.com",
          authType: "bearer",
          syncs: [
            { name: "products-inflow", type: "inflow", schedule: "0 * * * *" },
            { name: "invoices-inflow", type: "inflow" },
          ],
        },
      ];

      const instance = khotan({ adapter, plugs });
      await instance.init();

      expect(adapter.upsertPlug).toHaveBeenCalledWith({
        name: "stripe",
        baseUrl: "https://api.stripe.com",
        authType: "bearer",
      });
      expect(adapter.upsertSync).toHaveBeenCalledTimes(2);
      expect(adapter.upsertSync).toHaveBeenCalledWith({
        plugId: "plug-1",
        name: "products-inflow",
        type: "inflow",
        schedule: "0 * * * *",
      });
      expect(adapter.upsertSync).toHaveBeenCalledWith({
        plugId: "plug-1",
        name: "invoices-inflow",
        type: "inflow",
        schedule: null,
      });
    });

    it("runs only once even when called multiple times", async () => {
      const plugs: PlugRegistration[] = [
        {
          name: "stripe",
          baseUrl: "https://api.stripe.com",
          authType: "bearer",
        },
      ];

      const instance = khotan({ adapter, plugs });
      await Promise.all([instance.init(), instance.init(), instance.init()]);

      expect(adapter.upsertPlug).toHaveBeenCalledTimes(1);
    });

    it("handles plugs without syncs", async () => {
      const plugs: PlugRegistration[] = [
        {
          name: "stripe",
          baseUrl: "https://api.stripe.com",
          authType: "bearer",
        },
      ];

      const instance = khotan({ adapter, plugs });
      await instance.init();

      expect(adapter.upsertPlug).toHaveBeenCalledTimes(1);
      expect(adapter.upsertSync).not.toHaveBeenCalled();
    });

    it("upserts resources before plugs and syncs", async () => {
      const resources: ResourceRegistration[] = [
        {
          name: "products",
          connectField: "sku",
          description: "Product catalog",
        },
      ];
      const plugs: PlugRegistration[] = [
        {
          name: "shopify",
          baseUrl: "https://shopify.com",
          authType: "bearer",
          syncs: [
            { name: "products-inflow", type: "inflow", resource: "products" },
          ],
        },
      ];

      const instance = khotan({ adapter, plugs, resources });
      await instance.init();

      expect(adapter.upsertResource).toHaveBeenCalledWith({
        name: "products",
        connectField: "sku",
        description: "Product catalog",
      });
      expect(adapter.upsertResource).toHaveBeenCalledBefore(
        adapter.upsertPlug as ReturnType<typeof vi.fn>,
      );
    });

    it("links syncs to resource_id after upserting", async () => {
      const resources: ResourceRegistration[] = [
        { name: "products", connectField: "sku" },
      ];
      const plugs: PlugRegistration[] = [
        {
          name: "shopify",
          baseUrl: "https://shopify.com",
          authType: "bearer",
          syncs: [
            { name: "products-inflow", type: "inflow", resource: "products" },
          ],
        },
      ];

      const instance = khotan({ adapter, plugs, resources });
      await instance.init();

      expect(adapter.updateSyncResourceId).toHaveBeenCalledWith(
        "sync-1",
        "resource-1",
      );
    });

    it("does not call updateSyncResourceId for syncs without resource", async () => {
      const plugs: PlugRegistration[] = [
        {
          name: "stripe",
          baseUrl: "https://api.stripe.com",
          authType: "bearer",
          syncs: [{ name: "payments", type: "inflow" }],
        },
      ];

      const instance = khotan({ adapter, plugs });
      await instance.init();

      expect(adapter.updateSyncResourceId).not.toHaveBeenCalled();
    });
  });

  describe("handler routing", () => {
    let instance: ReturnType<typeof khotan>;

    beforeEach(() => {
      instance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            baseUrl: "https://api.stripe.com",
            authType: "bearer",
            syncs: [{ name: "products", type: "inflow" }],
          },
        ],
      });
    });

    it("GET /api/khotan/plugs lists plugs", async () => {
      const res = await instance.handler(makeRequest("/api/khotan/plugs"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data[0]).toHaveProperty("name", "stripe");
      expect(data[0]).toHaveProperty("syncCount");
    });

    it("GET /api/khotan/plugs/:id returns plug with syncs", async () => {
      await instance.init();
      const res = await instance.handler(
        makeRequest("/api/khotan/plugs/plug-1"),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("stripe");
      expect(data.syncs).toHaveLength(1);
    });

    it("GET /api/khotan/plugs/:id returns 404 for unknown plug", async () => {
      const res = await instance.handler(
        makeRequest("/api/khotan/plugs/nonexistent"),
      );
      expect(res.status).toBe(404);
    });

    it("GET /api/khotan/syncs lists syncs", async () => {
      const res = await instance.handler(makeRequest("/api/khotan/syncs"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it("GET /api/khotan/syncs/:id/runs lists runs", async () => {
      const res = await instance.handler(
        makeRequest("/api/khotan/syncs/sync-1/runs"),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it("returns 404 for unknown routes", async () => {
      const res = await instance.handler(makeRequest("/api/khotan/unknown"));
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toHaveProperty("error", "Not found");
    });

    it("returns 404 for POST requests (no POST routes defined)", async () => {
      const res = await instance.handler(
        makeRequest("/api/khotan/plugs", "POST"),
      );
      expect(res.status).toBe(404);
    });

    it("initializes lazily on first handler call", async () => {
      expect(adapter.upsertPlug).not.toHaveBeenCalled();
      await instance.handler(makeRequest("/api/khotan/plugs"));
      expect(adapter.upsertPlug).toHaveBeenCalledTimes(1);
    });

    it("handles empty plugs list", async () => {
      const emptyInstance = khotan({ adapter, plugs: [] });
      const res = await emptyInstance.handler(makeRequest("/api/khotan/plugs"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([]);
    });
  });

  describe("resource and mapping routes", () => {
    let instance: ReturnType<typeof khotan>;

    beforeEach(() => {
      instance = khotan({
        adapter,
        plugs: [
          {
            name: "shopify",
            baseUrl: "https://shopify.com",
            authType: "bearer",
            syncs: [
              { name: "products-inflow", type: "inflow", resource: "products" },
            ],
          },
        ],
        resources: [{ name: "products", connectField: "sku" }],
      });
    });

    it("GET .../resources lists resources", async () => {
      const res = await instance.handler(makeRequest("/api/khotan/resources"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it("GET .../resources/:id returns resource with syncs", async () => {
      await instance.init();
      const res = await instance.handler(
        makeRequest("/api/khotan/resources/resource-1"),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("products");
      expect(data.syncs).toHaveLength(1);
      expect(data.syncs[0].name).toBe("products-inflow");
    });

    it("GET .../resources/:id returns 404 for unknown resource", async () => {
      const res = await instance.handler(
        makeRequest("/api/khotan/resources/nonexistent"),
      );
      expect(res.status).toBe(404);
    });

    it("GET .../resources/:id/mappings lists mappings for resource", async () => {
      const res = await instance.handler(
        makeRequest("/api/khotan/resources/resource-1/mappings"),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it("POST .../mappings creates a mapping with 201", async () => {
      const body = {
        resourceId: "resource-1",
        connectValue: "SKU-001",
        refs: { shopify: "prod_123" },
        metadata: { name: "Blue Widget" },
      };
      const res = await instance.handler(
        makeRequest("/api/khotan/mappings", "POST", body),
      );
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data).toHaveProperty("id");
    });

    it("POST .../mappings returns 200 on upsert of existing mapping", async () => {
      await instance.handler(
        makeRequest("/api/khotan/mappings", "POST", {
          resourceId: "resource-1",
          connectValue: "SKU-001",
          refs: { shopify: "prod_123" },
        }),
      );

      const res = await instance.handler(
        makeRequest("/api/khotan/mappings", "POST", {
          resourceId: "resource-1",
          connectValue: "SKU-001",
          refs: { cin7: "P-456" },
        }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("id");
    });

    it("GET .../mappings/:id returns a mapping", async () => {
      // Create first
      await instance.handler(
        makeRequest("/api/khotan/mappings", "POST", {
          resourceId: "resource-1",
          connectValue: "SKU-001",
          refs: { shopify: "prod_123" },
        }),
      );

      const res = await instance.handler(
        makeRequest("/api/khotan/mappings/mapping-1"),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.connectValue).toBe("SKU-001");
    });

    it("GET .../mappings/:id returns 404 for unknown mapping", async () => {
      const res = await instance.handler(
        makeRequest("/api/khotan/mappings/nonexistent"),
      );
      expect(res.status).toBe(404);
    });

    it("PUT .../mappings/:id updates a mapping", async () => {
      // Create first
      await instance.handler(
        makeRequest("/api/khotan/mappings", "POST", {
          resourceId: "resource-1",
          connectValue: "SKU-001",
          refs: { shopify: "prod_123" },
        }),
      );

      const res = await instance.handler(
        makeRequest("/api/khotan/mappings/mapping-1", "PUT", {
          resourceId: "resource-1",
          connectValue: "SKU-001",
          refs: { shopify: "prod_123", cin7: "P-456" },
        }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("id", "mapping-1");
    });

    it("DELETE .../mappings/:id deletes a mapping", async () => {
      // Create first
      await instance.handler(
        makeRequest("/api/khotan/mappings", "POST", {
          resourceId: "resource-1",
          connectValue: "SKU-001",
          refs: { shopify: "prod_123" },
        }),
      );

      const res = await instance.handler(
        makeRequest("/api/khotan/mappings/mapping-1", "DELETE"),
      );
      expect(res.status).toBe(204);
    });

    it("POST .../mappings/lookup finds mapping by plug ref", async () => {
      // Create first
      await instance.handler(
        makeRequest("/api/khotan/mappings", "POST", {
          resourceId: "resource-1",
          connectValue: "SKU-001",
          refs: { shopify: "prod_123" },
        }),
      );

      const res = await instance.handler(
        makeRequest("/api/khotan/mappings/lookup", "POST", {
          resourceId: "resource-1",
          plugName: "shopify",
          ref: "prod_123",
        }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.connectValue).toBe("SKU-001");
    });

    it("POST .../mappings/lookup returns 404 when not found", async () => {
      const res = await instance.handler(
        makeRequest("/api/khotan/mappings/lookup", "POST", {
          resourceId: "resource-1",
          plugName: "shopify",
          ref: "nonexistent",
        }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("PATCH toggle endpoints", () => {
    let instance: ReturnType<typeof khotan>;

    beforeEach(() => {
      instance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            baseUrl: "https://api.stripe.com",
            authType: "bearer",
            syncs: [{ name: "products", type: "inflow" }],
          },
        ],
      });
    });

    it("PATCH .../plugs/:id toggles plug enabled", async () => {
      await instance.init();
      const res = await instance.handler(
        makeRequest("/api/khotan/plugs/plug-1", "PATCH", { enabled: false }),
      );
      expect(res.status).toBe(200);
      expect(adapter.togglePlugEnabled).toHaveBeenCalledWith("plug-1", false);
    });

    it("PATCH .../plugs/:id returns 404 for unknown plug", async () => {
      await instance.init();
      const res = await instance.handler(
        makeRequest("/api/khotan/plugs/nonexistent", "PATCH", {
          enabled: true,
        }),
      );
      expect(res.status).toBe(404);
    });

    it("PATCH .../syncs/:id toggles sync enabled", async () => {
      await instance.init();
      const res = await instance.handler(
        makeRequest("/api/khotan/syncs/sync-1", "PATCH", { enabled: false }),
      );
      expect(res.status).toBe(200);
      expect(adapter.toggleSyncEnabled).toHaveBeenCalledWith("sync-1", false);
      const data = await res.json();
      expect(data).toHaveProperty("id", "sync-1");
      expect(data).toHaveProperty("enabled", false);
    });

    it("PATCH .../syncs/:id ignores non-boolean enabled", async () => {
      await instance.init();
      const res = await instance.handler(
        makeRequest("/api/khotan/syncs/sync-1", "PATCH", { enabled: "yes" }),
      );
      expect(res.status).toBe(200);
      expect(adapter.toggleSyncEnabled).not.toHaveBeenCalled();
    });

    it("PATCH returns 404 for unmatched routes", async () => {
      const res = await instance.handler(
        makeRequest("/api/khotan/unknown", "PATCH", { enabled: true }),
      );
      expect(res.status).toBe(404);
    });
  });

  describe("config-driven filtering", () => {
    it("GET /plugs excludes plugs not in config", async () => {
      const instance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            baseUrl: "https://api.stripe.com",
            authType: "bearer",
          },
        ],
      });
      await instance.init();

      // Manually insert an orphaned plug into the store via adapter
      await adapter.upsertPlug({
        name: "orphaned",
        baseUrl: "https://orphaned.com",
        authType: "bearer",
      });

      const res = await instance.handler(makeRequest("/api/khotan/plugs"));
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("stripe");
    });

    it("GET /plugs/:id returns 404 for orphaned plug", async () => {
      const instance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            baseUrl: "https://api.stripe.com",
            authType: "bearer",
          },
        ],
      });
      await instance.init();

      await adapter.upsertPlug({
        name: "orphaned",
        baseUrl: "https://orphaned.com",
        authType: "bearer",
      });

      const res = await instance.handler(
        makeRequest("/api/khotan/plugs/plug-2"),
      );
      expect(res.status).toBe(404);
    });

    it("GET /syncs excludes syncs from unregistered plugs", async () => {
      const instance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            baseUrl: "https://api.stripe.com",
            authType: "bearer",
            syncs: [{ name: "payments", type: "inflow" }],
          },
        ],
      });
      await instance.init();

      // Insert an orphaned plug with a sync
      const { id: orphanPlugId } = await adapter.upsertPlug({
        name: "orphaned",
        baseUrl: "https://orphaned.com",
        authType: "bearer",
      });
      await adapter.upsertSync({
        plugId: orphanPlugId,
        name: "orphan-sync",
        type: "inflow",
      });

      const res = await instance.handler(makeRequest("/api/khotan/syncs"));
      const data = await res.json();
      const names = data.map((s: { name: string }) => s.name);
      expect(names).toContain("payments");
      expect(names).not.toContain("orphan-sync");
    });

    it("GET /resources excludes unregistered resources", async () => {
      const instance = khotan({
        adapter,
        plugs: [],
        resources: [{ name: "products", connectField: "sku" }],
      });
      await instance.init();

      await adapter.upsertResource({
        name: "orphaned-resource",
        connectField: "id",
      });

      const res = await instance.handler(makeRequest("/api/khotan/resources"));
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("products");
    });

    it("GET /resources/:id returns 404 for orphaned resource", async () => {
      const instance = khotan({
        adapter,
        plugs: [],
        resources: [{ name: "products", connectField: "sku" }],
      });
      await instance.init();

      await adapter.upsertResource({
        name: "orphaned-resource",
        connectField: "id",
      });

      const res = await instance.handler(
        makeRequest("/api/khotan/resources/resource-2"),
      );
      expect(res.status).toBe(404);
    });

    it("PATCH /plugs/:id returns 404 for orphaned plug", async () => {
      const instance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            baseUrl: "https://api.stripe.com",
            authType: "bearer",
          },
        ],
      });
      await instance.init();

      await adapter.upsertPlug({
        name: "orphaned",
        baseUrl: "https://orphaned.com",
        authType: "bearer",
      });

      const res = await instance.handler(
        makeRequest("/api/khotan/plugs/plug-2", "PATCH", { enabled: false }),
      );
      expect(res.status).toBe(404);
      expect(adapter.togglePlugEnabled).not.toHaveBeenCalled();
    });
  });
});

describe("toNextJsHandler", () => {
  it("wraps handler into GET/POST/PUT/PATCH/DELETE exports", () => {
    const mockHandler = vi.fn(async () => Response.json({ ok: true }));
    const handlers = toNextJsHandler(mockHandler);

    expect(handlers).toHaveProperty("GET");
    expect(handlers).toHaveProperty("POST");
    expect(handlers).toHaveProperty("PUT");
    expect(handlers).toHaveProperty("PATCH");
    expect(handlers).toHaveProperty("DELETE");
  });

  it("delegates GET to the factory handler", async () => {
    const mockHandler = vi.fn(async () => Response.json({ ok: true }));
    const handlers = toNextJsHandler(mockHandler);

    const req = new Request("http://localhost/api/khotan/plugs");
    const res = await handlers.GET(req);
    expect(res.status).toBe(200);
    expect(mockHandler).toHaveBeenCalledWith(req);
  });

  it("delegates POST to the factory handler", async () => {
    const mockHandler = vi.fn(async () =>
      Response.json({ created: true }, { status: 201 }),
    );
    const handlers = toNextJsHandler(mockHandler);

    const req = new Request("http://localhost/api/khotan/syncs/1/trigger", {
      method: "POST",
    });
    const res = await handlers.POST(req);
    expect(res.status).toBe(201);
    expect(mockHandler).toHaveBeenCalledWith(req);
  });

  it("delegates PATCH to the factory handler", async () => {
    const mockHandler = vi.fn(async () => Response.json({ updated: true }));
    const handlers = toNextJsHandler(mockHandler);

    const req = new Request("http://localhost/api/khotan/plugs/1", {
      method: "PATCH",
      body: JSON.stringify({ enabled: false }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await handlers.PATCH(req);
    expect(res.status).toBe(200);
    expect(mockHandler).toHaveBeenCalledWith(req);
  });
});
