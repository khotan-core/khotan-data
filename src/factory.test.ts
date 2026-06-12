import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  __setWorkflowGetRunForTests,
  __setWorkflowGetWritableForTests,
  __setWorkflowStartForTests,
  khotan,
  toNextJsHandler,
  type KhotanAdapter,
  type PlugRegistration,
  type ResourceRegistration,
} from "./factory.js";
import { z } from "zod";

interface StoredFlow {
  id: string;
  plugId: string;
  name: string;
  type: string;
  schedule: string | null;
  resourceId: string | null;
  enabled: boolean;
  lastRunAt: Date | null;
  lastRunStatus: "completed" | "partial" | "failed" | "cancelled" | null;
}

interface StoredMapping {
  id: string;
  resourceId: string;
  connectValue: string;
  refs: Record<string, string>;
  metadata: Record<string, unknown> | null;
}

interface StoredRun {
  id: string;
  flowId: string | null;
  wireId: string | null;
  webhookHandlerId: string | null;
  workflowRunId: string | null;
  runType: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  extracted: number;
  transformed: number;
  created: number;
  updated: number;
  deleted: number;
  failed: number;
  error: string | null;
  metadata: Record<string, unknown> | null;
}

interface StoredWebhookEvent {
  id: string;
  wireId: string;
  webhookHandlerId: string;
  khotanRunId: string;
  eventType: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  receivedAt: Date;
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
  const flowStore = new Map<string, StoredFlow>();
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
  const runStore = new Map<string, StoredRun>();
  const webhookEventStore = new Map<string, StoredWebhookEvent>();
  const variableStore = new Map<string, string>();
  let plugCounter = 0;
  let flowCounter = 0;
  let resourceCounter = 0;
  let mappingCounter = 0;
  let runCounter = 0;

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

    upsertFlow: vi.fn(async (flow) => {
      const existing = [...flowStore.values()].find(
        (f) => f.plugId === flow.plugId && f.name === flow.name,
      );
      if (existing) {
        existing.type = flow.type;
        existing.schedule = flow.schedule ?? null;
        return { id: existing.id };
      }
      const id = `flow-${++flowCounter}`;
      flowStore.set(id, {
        id,
        plugId: flow.plugId,
        name: flow.name,
        type: flow.type,
        schedule: flow.schedule ?? null,
        resourceId: null,
        enabled: true,
        lastRunAt: null,
        lastRunStatus: null,
      });
      return { id };
    }),

    listPlugs: vi.fn(async () => {
      return [...plugStore.values()].map((p) => ({
        ...p,
        status: "idle",
        flowCount: [...flowStore.values()].filter(
          (flow) => flow.plugId === p.id,
        ).length,
      }));
    }),

    getPlug: vi.fn(async (id: string) => {
      return plugStore.get(id) ?? null;
    }),

    getPlugFlows: vi.fn(async (plugId: string) => {
      return [...flowStore.values()].filter((flow) => flow.plugId === plugId);
    }),

    getFlow: vi.fn(async (flowId: string) => {
      const flow = flowStore.get(flowId);
      if (!flow) return null;
      return {
        ...flow,
        plugName: plugStore.get(flow.plugId)?.name ?? null,
      };
    }),

    listFlows: vi.fn(async () => {
      return [...flowStore.values()].map((flow) => ({
        ...flow,
        plugName: plugStore.get(flow.plugId)?.name ?? null,
      }));
    }),

    listRuns: vi.fn(async (flowId: string) => {
      return [...runStore.values()].filter((run) => run.flowId === flowId);
    }),

    getRun: vi.fn(async (runId: string) => {
      return runStore.get(runId) ?? null;
    }),

    listRunsPage: vi.fn(
      async ({ limit, offset }: { limit: number; offset: number }) => {
        const rows = [...runStore.values()]
          .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
          .slice(offset, offset + limit + 1);
        return {
          items: rows.slice(0, limit).map((run) => ({
            ...run,
            sourceType: run.flowId
              ? "flow"
              : run.webhookHandlerId
                ? "webhook"
                : "unknown",
            sourceName: run.flowId
              ? (flowStore.get(run.flowId)?.name ?? null)
              : null,
            sourceKind: null,
            plugName:
              run.flowId && flowStore.get(run.flowId)
                ? (plugStore.get(flowStore.get(run.flowId)!.plugId)?.name ??
                  null)
                : null,
          })),
          hasMore: rows.length > limit,
        };
      },
    ),

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
        flowCount: [...flowStore.values()].filter(
          (flow) => flow.resourceId === r.id,
        ).length,
        mappingCount: [...mappingStore.values()].filter(
          (m) => m.resourceId === r.id,
        ).length,
      }));
    }),

    getResource: vi.fn(async (id: string) => {
      return resourceStore.get(id) ?? null;
    }),

    getResourceFlows: vi.fn(async (resourceId: string) => {
      return [...flowStore.values()].filter(
        (flow) => flow.resourceId === resourceId,
      );
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

    updateFlowResourceId: vi.fn(async (flowId: string, resourceId: string) => {
      const flow = flowStore.get(flowId);
      if (flow) flow.resourceId = resourceId;
    }),

    togglePlugEnabled: vi.fn(async (plugId: string, enabled: boolean) => {
      const plug = plugStore.get(plugId);
      if (plug) plug.enabled = enabled;
    }),

    toggleFlowEnabled: vi.fn(async (flowId: string, enabled: boolean) => {
      const flow = flowStore.get(flowId);
      if (flow) flow.enabled = enabled;
    }),

    getEncryptedVariables: vi.fn(async (plugId: string) => {
      return variableStore.get(plugId) ?? null;
    }),

    setEncryptedVariables: vi.fn(async (plugId: string, encrypted: string) => {
      variableStore.set(plugId, encrypted);
    }),

    clearEncryptedVariables: vi.fn(async (plugId: string) => {
      variableStore.delete(plugId);
    }),

    insertRun: vi.fn(async (run) => {
      const id = `run-${++runCounter}`;
      runStore.set(id, {
        id,
        flowId: run.flowId ?? null,
        wireId: run.wireId ?? null,
        webhookHandlerId: run.webhookHandlerId ?? null,
        workflowRunId: run.workflowRunId ?? null,
        runType: run.runType,
        status: run.status,
        startedAt: new Date(),
        completedAt: null,
        durationMs: null,
        extracted: 0,
        transformed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        failed: 0,
        error: null,
        metadata: null,
      });
      return { id };
    }),

    updateRun: vi.fn(async (runId, updates) => {
      const run = runStore.get(runId);
      if (run) Object.assign(run, updates);
    }),

    insertWebhookEvent: vi.fn(async (event) => {
      const id = `webhook-event-${webhookEventStore.size + 1}`;
      webhookEventStore.set(id, {
        id,
        wireId: event.wireId,
        webhookHandlerId: event.webhookHandlerId,
        khotanRunId: event.khotanRunId,
        eventType: event.eventType,
        payload: event.payload,
        headers: event.headers,
        receivedAt: new Date(),
      });
      return { id };
    }),

    listWebhookEventsPage: vi.fn(
      async ({ limit, offset }: { limit: number; offset: number }) => {
        const rows = [...webhookEventStore.values()]
          .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
          .slice(offset, offset + limit + 1);
        return {
          items: rows.slice(0, limit).map((event) => ({
            ...event,
            handlerName: null,
            handlerType: null,
            plugName: null,
            workflowRunId:
              runStore.get(event.khotanRunId)?.workflowRunId ?? null,
            runStatus: runStore.get(event.khotanRunId)?.status ?? null,
            runStartedAt: runStore.get(event.khotanRunId)?.startedAt ?? null,
          })),
          hasMore: rows.length > limit,
        };
      },
    ),

    updateFlowLastRun: vi.fn(async (flowId, updates) => {
      const flow = flowStore.get(flowId);
      if (flow) {
        flow.lastRunAt = updates.lastRunAt;
        flow.lastRunStatus = updates.lastRunStatus;
      }
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

async function waitForBackgroundTasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("khotan factory", () => {
  let adapter: KhotanAdapter;

  beforeEach(() => {
    adapter = createMockAdapter();
    __setWorkflowStartForTests(null);
    __setWorkflowGetRunForTests(null);
    __setWorkflowGetWritableForTests(null);
  });

  describe("registration validation", () => {
    it("throws on duplicate plug names", () => {
      const plugs: PlugRegistration[] = [
        {
          name: "stripe",
          plug: { baseUrl: "https://api.stripe.com", authType: "bearer" },
        },
        {
          name: "stripe",
          plug: { baseUrl: "https://api.stripe.com/v2", authType: "bearer" },
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
          plug: { baseUrl: "https://api.stripe.com", authType: "bearer" },
        },
        {
          name: "github",
          plug: { baseUrl: "https://api.github.com", authType: "bearer" },
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

    it("throws when flow references unknown resource", () => {
      const plugs: PlugRegistration[] = [
        {
          name: "shopify",
          plug: { baseUrl: "https://shopify.com", authType: "bearer" },
          flows: [
            { name: "products-inflow", type: "inflow", resource: "products" },
          ],
        },
      ];

      expect(() => khotan({ adapter, plugs })).toThrow(
        'Flow "products-inflow" references unknown resource: "products"',
      );
    });

    it("accepts flow with valid resource reference", () => {
      const resources: ResourceRegistration[] = [
        { name: "products", connectField: "sku" },
      ];
      const plugs: PlugRegistration[] = [
        {
          name: "shopify",
          plug: { baseUrl: "https://shopify.com", authType: "bearer" },
          flows: [
            { name: "products-inflow", type: "inflow", resource: "products" },
          ],
        },
      ];

      expect(() => khotan({ adapter, plugs, resources })).not.toThrow();
    });
  });

  describe("init()", () => {
    it("upserts registered plugs and flows", async () => {
      const plugs: PlugRegistration[] = [
        {
          name: "stripe",
          plug: { baseUrl: "https://api.stripe.com", authType: "bearer" },
          flows: [
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
      expect(adapter.upsertFlow).toHaveBeenCalledTimes(2);
      expect(adapter.upsertFlow).toHaveBeenCalledWith({
        plugId: "plug-1",
        name: "products-inflow",
        type: "inflow",
        schedule: "0 * * * *",
      });
      expect(adapter.upsertFlow).toHaveBeenCalledWith({
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
          plug: { baseUrl: "https://api.stripe.com", authType: "bearer" },
        },
      ];

      const instance = khotan({ adapter, plugs });
      await Promise.all([instance.init(), instance.init(), instance.init()]);

      expect(adapter.upsertPlug).toHaveBeenCalledTimes(1);
    });

    it("handles plugs without flows", async () => {
      const plugs: PlugRegistration[] = [
        {
          name: "stripe",
          plug: { baseUrl: "https://api.stripe.com", authType: "bearer" },
        },
      ];

      const instance = khotan({ adapter, plugs });
      await instance.init();

      expect(adapter.upsertPlug).toHaveBeenCalledTimes(1);
      expect(adapter.upsertFlow).not.toHaveBeenCalled();
    });

    it("upserts resources before plugs and flows", async () => {
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
          plug: { baseUrl: "https://shopify.com", authType: "bearer" },
          flows: [
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

    it("links flows to resource_id after upserting", async () => {
      const resources: ResourceRegistration[] = [
        { name: "products", connectField: "sku" },
      ];
      const plugs: PlugRegistration[] = [
        {
          name: "shopify",
          plug: { baseUrl: "https://shopify.com", authType: "bearer" },
          flows: [
            { name: "products-inflow", type: "inflow", resource: "products" },
          ],
        },
      ];

      const instance = khotan({ adapter, plugs, resources });
      await instance.init();

      expect(adapter.updateFlowResourceId).toHaveBeenCalledWith(
        "flow-1",
        "resource-1",
      );
    });

    it("does not call updateFlowResourceId for flows without resource", async () => {
      const plugs: PlugRegistration[] = [
        {
          name: "stripe",
          plug: { baseUrl: "https://api.stripe.com", authType: "bearer" },
          flows: [{ name: "payments", type: "inflow" }],
        },
      ];

      const instance = khotan({ adapter, plugs });
      await instance.init();

      expect(adapter.updateFlowResourceId).not.toHaveBeenCalled();
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
            plug: { baseUrl: "https://api.stripe.com", authType: "bearer" },
            flows: [{ name: "products", type: "inflow" }],
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
      expect(data[0]).toHaveProperty("flowCount");
    });

    it("GET /api/khotan/plugs/:id returns plug with flows", async () => {
      await instance.init();
      const res = await instance.handler(
        makeRequest("/api/khotan/plugs/plug-1"),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("stripe");
      expect(data.flows).toHaveLength(1);
    });

    it("GET /api/khotan/plugs/:id returns 404 for unknown plug", async () => {
      const res = await instance.handler(
        makeRequest("/api/khotan/plugs/nonexistent"),
      );
      expect(res.status).toBe(404);
    });

    it("GET /api/khotan/flows lists flows", async () => {
      const res = await instance.handler(makeRequest("/api/khotan/flows"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it("GET /api/khotan/flows/:id/runs lists runs", async () => {
      const res = await instance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs"),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it("GET /api/khotan/runs returns paginated log rows", async () => {
      await adapter.insertRun({
        flowId: "flow-1",
        runType: "manual",
        status: "completed",
      });
      await adapter.insertRun({
        flowId: "flow-1",
        runType: "manual",
        status: "failed",
      });
      await adapter.insertRun({
        flowId: "flow-1",
        runType: "delta",
        status: "running",
      });

      const res = await instance.handler(
        makeRequest("/api/khotan/runs?limit=2"),
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.items).toHaveLength(2);
      expect(data.page).toMatchObject({
        limit: 2,
        offset: 0,
        hasMore: true,
        prevOffset: 0,
        nextOffset: 2,
      });
      expect(data.items[0]).toHaveProperty("sourceType");
    });

    it("GET /api/khotan/webhook-events returns paginated log rows", async () => {
      const { id: runId1 } = await adapter.insertRun({
        flowId: "flow-1",
        runType: "webhook",
        status: "completed",
      });
      const { id: runId2 } = await adapter.insertRun({
        flowId: "flow-1",
        runType: "webhook",
        status: "running",
      });

      await adapter.insertWebhookEvent({
        wireId: "wire-1",
        webhookHandlerId: "handler-1",
        khotanRunId: runId1,
        eventType: "order.created",
        payload: { id: "evt-1" },
        headers: { "x-test": "1" },
      });
      await adapter.insertWebhookEvent({
        wireId: "wire-1",
        webhookHandlerId: "handler-1",
        khotanRunId: runId2,
        eventType: "order.updated",
        payload: { id: "evt-2" },
        headers: { "x-test": "2" },
      });

      const res = await instance.handler(
        makeRequest("/api/khotan/webhook-events?limit=1"),
      );
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.items).toHaveLength(1);
      expect(data.page).toMatchObject({
        limit: 1,
        offset: 0,
        hasMore: true,
        prevOffset: 0,
        nextOffset: 1,
      });
      expect(data.items[0]).toHaveProperty("eventType");
    });

    it("POST /api/khotan/flows/:id/runs executes a flow and updates run lifecycle", async () => {
      const run = vi.fn(async () => ({
        extracted: 2,
        transformed: 2,
        created: 1,
        updated: 1,
        metadata: { source: "test" },
      }));
      const flowInstance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            flows: [{ name: "products", type: "inflow", run }],
          },
        ],
      });

      await flowInstance.init();
      const res = await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs", "POST", {
          runType: "delta",
          body: { limit: 10 },
        }),
      );

      expect(res.status).toBe(200);
      expect(run).toHaveBeenCalledWith(
        expect.objectContaining({
          runType: "delta",
          body: { limit: 10 },
          flow: expect.objectContaining({ id: "flow-1", name: "products" }),
        }),
      );
      expect(adapter.insertRun).toHaveBeenCalledWith({
        flowId: "flow-1",
        runType: "delta",
        status: "running",
      });
      expect(adapter.updateRun).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({
          status: "completed",
          extracted: 2,
          transformed: 2,
          created: 1,
          updated: 1,
          failed: 0,
          metadata: { source: "test" },
        }),
      );
      expect(adapter.updateFlowLastRun).toHaveBeenCalledWith(
        "flow-1",
        expect.objectContaining({ lastRunStatus: "completed" }),
      );
    });

    it("POST /api/khotan/flows/:id/runs marks successful runs with failed records as partial", async () => {
      const run = vi.fn(async () => ({
        extracted: 10,
        transformed: 10,
        updated: 8,
        failed: 2,
        metadata: { source: "test" },
      }));
      const flowInstance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            flows: [{ name: "products", type: "inflow", run }],
          },
        ],
      });

      await flowInstance.init();
      const res = await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs", "POST"),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        id: "run-1",
        status: "partial",
        failed: 2,
      });
      expect(adapter.updateRun).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({
          status: "partial",
          failed: 2,
        }),
      );
      expect(adapter.updateFlowLastRun).toHaveBeenCalledWith(
        "flow-1",
        expect.objectContaining({ lastRunStatus: "partial" }),
      );
    });

    it("POST /api/khotan/flows/:id/runs honors explicit terminal status from run results", async () => {
      const run = vi.fn(async () => ({
        status: "cancelled" as const,
        extracted: 5,
        updated: 2,
        error: "Stopped by preflight",
        metadata: { reason: "preflight" },
      }));
      const flowInstance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            flows: [{ name: "products", type: "inflow", run }],
          },
        ],
      });

      await flowInstance.init();
      const res = await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs", "POST"),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        id: "run-1",
        status: "cancelled",
        extracted: 5,
        updated: 2,
        error: "Stopped by preflight",
      });
      expect(adapter.updateRun).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({
          status: "cancelled",
          error: "Stopped by preflight",
          metadata: { reason: "preflight" },
        }),
      );
      expect(adapter.updateFlowLastRun).toHaveBeenCalledWith(
        "flow-1",
        expect.objectContaining({ lastRunStatus: "cancelled" }),
      );
    });

    it("POST /api/khotan/flows/:id/runs reconciles completed workflow runs", async () => {
      const workflow = vi.fn(async () => undefined);
      const returnValue = Promise.resolve({
        extracted: 3,
        transformed: 3,
        updated: 3,
        metadata: { source: "workflow" },
      });
      const startWorkflow = vi.fn(async () => ({
        runId: "workflow-run-1",
        returnValue,
      }));
      __setWorkflowStartForTests(startWorkflow);

      const flowInstance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            flows: [{ name: "products", type: "inflow", workflow }],
          },
        ],
      });

      await flowInstance.init();
      const res = await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs", "POST", {
          runType: "full",
        }),
      );

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        id: "run-1",
        flowId: "flow-1",
        workflowRunId: "workflow-run-1",
        status: "running",
      });
      expect(startWorkflow).toHaveBeenCalledWith(workflow, [
        expect.objectContaining({
          khotanRunId: "run-1",
          runType: "full",
          flow: expect.objectContaining({ id: "flow-1", name: "products" }),
        }),
      ]);

      await returnValue;
      await waitForBackgroundTasks();

      const runsRes = await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs"),
      );
      const runs = (await runsRes.json()) as Array<Record<string, unknown>>;
      expect(runs[0]).toMatchObject({
        id: "run-1",
        status: "completed",
        workflowRunId: "workflow-run-1",
        extracted: 3,
        transformed: 3,
        updated: 3,
        metadata: { source: "workflow" },
      });
      expect(adapter.updateFlowLastRun).toHaveBeenCalledWith(
        "flow-1",
        expect.objectContaining({ lastRunStatus: "completed" }),
      );
    });

    it("POST /api/khotan/flows/:id/runs reconciles failed workflow runs", async () => {
      const workflow = vi.fn(async () => undefined);
      const returnValue = Promise.reject(new Error("workflow boom"));
      const startWorkflow = vi.fn(async () => ({
        runId: "workflow-run-1",
        returnValue,
      }));
      __setWorkflowStartForTests(startWorkflow);

      const flowInstance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            flows: [{ name: "products", type: "inflow", workflow }],
          },
        ],
      });

      await flowInstance.init();
      const res = await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs", "POST"),
      );

      expect(res.status).toBe(200);
      await returnValue.catch(() => undefined);
      await waitForBackgroundTasks();

      const runsRes = await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs"),
      );
      const runs = (await runsRes.json()) as Array<Record<string, unknown>>;
      expect(runs[0]).toMatchObject({
        id: "run-1",
        status: "failed",
        workflowRunId: "workflow-run-1",
        failed: 1,
        error: "workflow boom",
      });
      expect(adapter.updateFlowLastRun).toHaveBeenCalledWith(
        "flow-1",
        expect.objectContaining({ lastRunStatus: "failed" }),
      );
    });

    it("GET /api/khotan/runs/:id returns live workflow status", async () => {
      const workflow = vi.fn(async () => undefined);
      __setWorkflowStartForTests(
        vi.fn(async () => ({
          runId: "workflow-run-1",
          returnValue: new Promise(() => {}),
        })),
      );
      __setWorkflowGetRunForTests(
        vi.fn(() => ({
          status: Promise.resolve("running"),
        })),
      );

      const flowInstance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            flows: [{ name: "products", type: "inflow", workflow }],
          },
        ],
      });

      await flowInstance.init();
      await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs", "POST"),
      );

      const res = await flowInstance.handler(
        makeRequest("/api/khotan/runs/run-1"),
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        id: "run-1",
        workflowRunId: "workflow-run-1",
        workflowStatus: "running",
      });
    });

    it("GET /api/khotan/runs/:id/stream returns the workflow stream", async () => {
      const encoder = new TextEncoder();
      const workflow = vi.fn(async () => undefined);
      __setWorkflowStartForTests(
        vi.fn(async () => ({
          runId: "workflow-run-1",
          returnValue: new Promise(() => {}),
        })),
      );
      __setWorkflowGetRunForTests(
        vi.fn(() => ({
          getReadable: () =>
            new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode('{"message":"hello"}\n'));
                controller.close();
              },
            }),
        })),
      );

      const flowInstance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            flows: [{ name: "products", type: "inflow", workflow }],
          },
        ],
      });

      await flowInstance.init();
      await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs", "POST"),
      );

      const res = await flowInstance.handler(
        makeRequest("/api/khotan/runs/run-1/stream?startIndex=-50"),
      );
      expect(res.status).toBe(200);
      await expect(res.text()).resolves.toContain("hello");
    });

    it("POST /api/khotan/runs/:id/cancel cancels workflow runs", async () => {
      const cancel = vi.fn(async () => undefined);
      const workflow = vi.fn(async () => undefined);
      __setWorkflowStartForTests(
        vi.fn(async () => ({
          runId: "workflow-run-1",
          returnValue: new Promise(() => {}),
        })),
      );
      __setWorkflowGetRunForTests(vi.fn(() => ({ cancel })));

      const flowInstance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            flows: [{ name: "products", type: "inflow", workflow }],
          },
        ],
      });

      await flowInstance.init();
      await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs", "POST"),
      );

      const res = await flowInstance.handler(
        makeRequest("/api/khotan/runs/run-1/cancel", "POST"),
      );
      expect(res.status).toBe(200);
      expect(cancel).toHaveBeenCalled();

      const runsRes = await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs"),
      );
      const runs = (await runsRes.json()) as Array<Record<string, unknown>>;
      expect(runs[0]).toMatchObject({
        id: "run-1",
        status: "cancelled",
        error: "Cancelled",
      });
    });

    it("POST /api/khotan/flows/:id/runs reconciles cancelled workflow runs", async () => {
      const workflow = vi.fn(async () => undefined);
      const cancelError = Object.assign(
        new Error("Workflow run was cancelled"),
        {
          name: "WorkflowRunCancelledError",
        },
      );
      const returnValue = Promise.reject(cancelError);
      __setWorkflowStartForTests(
        vi.fn(async () => ({
          runId: "workflow-run-1",
          returnValue,
        })),
      );

      const flowInstance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            flows: [{ name: "products", type: "inflow", workflow }],
          },
        ],
      });

      await flowInstance.init();
      await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs", "POST"),
      );
      await returnValue.catch(() => undefined);
      await waitForBackgroundTasks();

      const runsRes = await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs"),
      );
      const runs = (await runsRes.json()) as Array<Record<string, unknown>>;
      expect(runs[0]).toMatchObject({
        id: "run-1",
        status: "cancelled",
        workflowRunId: "workflow-run-1",
        failed: 0,
      });
      expect(adapter.updateFlowLastRun).toHaveBeenCalledWith(
        "flow-1",
        expect.objectContaining({ lastRunStatus: "cancelled" }),
      );
    });

    it("POST /api/khotan/runs/:id/retry starts another flow run", async () => {
      const run = vi.fn(async () => ({ updated: 1 }));
      const flowInstance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            flows: [{ name: "products", type: "inflow", run }],
          },
        ],
      });

      await flowInstance.init();
      await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs", "POST", {
          runType: "delta",
        }),
      );

      const res = await flowInstance.handler(
        makeRequest("/api/khotan/runs/run-1/retry", "POST"),
      );
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        id: "run-2",
        flowId: "flow-1",
        status: "completed",
        runType: "delta",
      });
      expect(run).toHaveBeenCalledTimes(2);
    });

    it("flow().start starts a registered flow by name", async () => {
      const run = vi.fn(async () => ({
        extracted: 1,
        transformed: 1,
        updated: 1,
      }));
      const flowInstance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            flows: [{ name: "products", type: "inflow", run }],
          },
        ],
      });

      const data = await flowInstance.flow("products").start({
        runType: "delta",
        body: { limit: 5 },
      });

      expect(data).toMatchObject({
        id: "run-1",
        flowId: "flow-1",
        status: "completed",
        runType: "delta",
        extracted: 1,
        transformed: 1,
        updated: 1,
      });
      expect(run).toHaveBeenCalledWith(
        expect.objectContaining({
          runType: "delta",
          body: { limit: 5 },
          flow: expect.objectContaining({ id: "flow-1", name: "products" }),
        }),
      );
    });

    it("flow().start requires plugName when a flow name is ambiguous", async () => {
      const run = vi.fn(async () => undefined);
      const flowInstance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            flows: [{ name: "products", type: "inflow", run }],
          },
          {
            name: "shopify",
            plug: {
              baseUrl: "https://shopify.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            flows: [{ name: "products", type: "outflow", run }],
          },
        ],
      });

      await expect(flowInstance.flow("products").start()).rejects.toThrow(
        'Flow "products" is registered on multiple plugs',
      );

      await expect(
        flowInstance.flow("products", { plugName: "shopify" }).start(),
      ).resolves.toMatchObject({ flowId: "flow-2", status: "completed" });
    });

    it("POST /api/khotan/flows/:id/runs records failed flow runs", async () => {
      const run = vi.fn(async () => {
        throw new Error("boom");
      });
      const flowInstance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            flows: [{ name: "products", type: "inflow", run }],
          },
        ],
      });

      await flowInstance.init();
      const res = await flowInstance.handler(
        makeRequest("/api/khotan/flows/flow-1/runs", "POST"),
      );

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toMatchObject({
        id: "run-1",
        flowId: "flow-1",
        status: "failed",
        error: "boom",
      });
      expect(adapter.updateRun).toHaveBeenCalledWith(
        "run-1",
        expect.objectContaining({
          status: "failed",
          failed: 1,
          error: "boom",
        }),
      );
      expect(adapter.updateFlowLastRun).toHaveBeenCalledWith(
        "flow-1",
        expect.objectContaining({ lastRunStatus: "failed" }),
      );
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
            plug: { baseUrl: "https://shopify.com", authType: "bearer" },
            flows: [
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

    it("GET .../resources/:id returns resource with flows", async () => {
      await instance.init();
      const res = await instance.handler(
        makeRequest("/api/khotan/resources/resource-1"),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("products");
      expect(data.flows).toHaveLength(1);
      expect(data.flows[0].name).toBe("products-inflow");
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
            plug: { baseUrl: "https://api.stripe.com", authType: "bearer" },
            flows: [{ name: "products", type: "inflow" }],
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

    it("PATCH .../flows/:id toggles flow enabled", async () => {
      await instance.init();
      const res = await instance.handler(
        makeRequest("/api/khotan/flows/flow-1", "PATCH", { enabled: false }),
      );
      expect(res.status).toBe(200);
      expect(adapter.toggleFlowEnabled).toHaveBeenCalledWith("flow-1", false);
      const data = await res.json();
      expect(data).toHaveProperty("id", "flow-1");
      expect(data).toHaveProperty("enabled", false);
    });

    it("PATCH .../flows/:id ignores non-boolean enabled", async () => {
      await instance.init();
      const res = await instance.handler(
        makeRequest("/api/khotan/flows/flow-1", "PATCH", { enabled: "yes" }),
      );
      expect(res.status).toBe(200);
      expect(adapter.toggleFlowEnabled).not.toHaveBeenCalled();
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
            plug: { baseUrl: "https://api.stripe.com", authType: "bearer" },
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
            plug: { baseUrl: "https://api.stripe.com", authType: "bearer" },
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

    it("GET /flows excludes flows from unregistered plugs", async () => {
      const instance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: { baseUrl: "https://api.stripe.com", authType: "bearer" },
            flows: [{ name: "payments", type: "inflow" }],
          },
        ],
      });
      await instance.init();

      // Insert an orphaned plug with a flow
      const { id: orphanPlugId } = await adapter.upsertPlug({
        name: "orphaned",
        baseUrl: "https://orphaned.com",
        authType: "bearer",
      });
      await adapter.upsertFlow({
        plugId: orphanPlugId,
        name: "orphan-flow",
        type: "inflow",
      });

      const res = await instance.handler(makeRequest("/api/khotan/flows"));
      const data = await res.json();
      const names = data.map((flow: { name: string }) => flow.name);
      expect(names).toContain("payments");
      expect(names).not.toContain("orphan-flow");
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
            plug: { baseUrl: "https://api.stripe.com", authType: "bearer" },
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

describe("debug route", () => {
  let adapter: KhotanAdapter;

  beforeEach(() => {
    adapter = createMockAdapter();
  });

  it("returns 404 when KHOTAN_DEBUG is unset", async () => {
    const originalEnv = process.env["KHOTAN_DEBUG"];
    delete process.env["KHOTAN_DEBUG"];
    try {
      const instance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(async () => ({ ok: true })),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
          },
        ],
      });

      const res = await instance.handler(
        makeRequest("/api/khotan/debug/stripe", "POST", {
          method: "GET",
          path: "/products",
        }),
      );
      expect(res.status).toBe(404);
    } finally {
      if (originalEnv !== undefined) process.env["KHOTAN_DEBUG"] = originalEnv;
    }
  });

  it("proxies a GET request and returns timing + response", async () => {
    const originalEnv = process.env["KHOTAN_DEBUG"];
    process.env["KHOTAN_DEBUG"] = "1";
    try {
      const mockGet = vi.fn(async () => ({ products: [{ id: "p1" }] }));
      const instance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: mockGet,
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
          },
        ],
      });

      const res = await instance.handler(
        makeRequest("/api/khotan/debug/stripe", "POST", {
          method: "GET",
          path: "/products",
          params: { limit: "10" },
        }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe(200);
      expect(data.body).toEqual({ products: [{ id: "p1" }] });
      expect(typeof data.timing).toBe("number");
      expect(data.timing).toBeGreaterThanOrEqual(0);
      expect(mockGet).toHaveBeenCalledWith(
        "/products",
        expect.objectContaining({ params: { limit: "10" } }),
      );
    } finally {
      if (originalEnv !== undefined) {
        process.env["KHOTAN_DEBUG"] = originalEnv;
      } else {
        delete process.env["KHOTAN_DEBUG"];
      }
    }
  });

  it("handles plug errors gracefully", async () => {
    const originalEnv = process.env["KHOTAN_DEBUG"];
    process.env["KHOTAN_DEBUG"] = "1";
    try {
      const error = Object.assign(new Error("Unauthorized"), {
        status: 401,
        body: { message: "Invalid API key" },
      });
      const mockGet = vi.fn(async () => {
        throw error;
      });
      const instance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: mockGet,
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
          },
        ],
      });

      const res = await instance.handler(
        makeRequest("/api/khotan/debug/stripe", "POST", {
          method: "GET",
          path: "/charges",
        }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
      expect(data.body).toEqual({ message: "Invalid API key" });
      expect(typeof data.timing).toBe("number");
    } finally {
      if (originalEnv !== undefined) {
        process.env["KHOTAN_DEBUG"] = originalEnv;
      } else {
        delete process.env["KHOTAN_DEBUG"];
      }
    }
  });

  it("returns 404 for unknown plug name", async () => {
    const originalEnv = process.env["KHOTAN_DEBUG"];
    process.env["KHOTAN_DEBUG"] = "1";
    try {
      const instance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
          },
        ],
      });

      const res = await instance.handler(
        makeRequest("/api/khotan/debug/nonexistent", "POST", {
          method: "GET",
          path: "/test",
        }),
      );
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Plug not found");
    } finally {
      if (originalEnv !== undefined) {
        process.env["KHOTAN_DEBUG"] = originalEnv;
      } else {
        delete process.env["KHOTAN_DEBUG"];
      }
    }
  });

  it("includes varsConfigured in GET /plugs responses", async () => {
    const instance = khotan({
      adapter,
      plugs: [
        {
          name: "stripe",
          plug: {
            baseUrl: "https://api.stripe.com",
            authType: "bearer",
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
          },
        },
      ],
    });

    const res = await instance.handler(makeRequest("/api/khotan/plugs"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0]).toMatchObject({
      name: "stripe",
      varsConfigured: false,
    });
  });

  it("seeds default variable values into storage on init", async () => {
    const instance = khotan({
      adapter,
      secret: "test-secret",
      plugs: [
        {
          name: "stripe",
          plug: {
            baseUrl: "https://api.stripe.com",
            authType: "bearer",
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
            varFields: [
              {
                key: "region",
                label: "Region",
                type: "text",
                defaultValue: "au",
                required: false,
              },
              {
                key: "apiKey",
                label: "API Key",
                type: "password",
                secret: true,
                defaultValue: "seed-secret",
              },
            ],
          },
        },
      ],
    });

    await instance.init();

    await expect(instance.getVars("stripe")).resolves.toEqual({
      region: "au",
      apiKey: "seed-secret",
    });

    const res = await instance.handler(
      makeRequest("/api/khotan/variables/stripe"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      configured: true,
      values: {
        region: "au",
        apiKey: "••••••••",
      },
    });
  });

  it("merges variable updates so omitted secrets are preserved", async () => {
    const instance = khotan({
      adapter,
      secret: "test-secret",
      plugs: [
        {
          name: "stripe",
          plug: {
            baseUrl: "https://api.stripe.com",
            authType: "bearer",
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
            varFields: [
              {
                key: "apiKey",
                label: "API Key",
                type: "password",
                secret: true,
              },
              {
                key: "orgId",
                label: "Org ID",
                type: "text",
              },
            ],
          },
        },
      ],
    });

    await instance.init();
    await instance.setVars("stripe", {
      apiKey: "existing-secret",
      orgId: "old-org",
    });

    const saveRes = await instance.handler(
      makeRequest("/api/khotan/variables/stripe", "POST", {
        orgId: "new-org",
      }),
    );
    expect(saveRes.status).toBe(200);

    await expect(instance.getVars("stripe")).resolves.toEqual({
      apiKey: "existing-secret",
      orgId: "new-org",
    });

    const res = await instance.handler(
      makeRequest("/api/khotan/variables/stripe"),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.values).toMatchObject({
      apiKey: "••••••••",
      orgId: "new-org",
    });
  });

  it("serializes nested response schemas in debug metadata", async () => {
    const originalEnv = process.env["KHOTAN_DEBUG"];
    process.env["KHOTAN_DEBUG"] = "1";
    try {
      const instance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
              endpoints: {
                listProducts: {
                  method: "GET",
                  path: "/products",
                  responses: {
                    200: z.object({
                      data: z.object({
                        items: z.array(
                          z.object({
                            id: z.string(),
                            name: z.string(),
                          }),
                        ),
                      }),
                    }),
                  },
                },
              },
            },
          },
        ],
      });

      const res = await instance.handler(
        makeRequest("/api/khotan/debug/stripe"),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.endpoints.listProducts.responses["200"]).toEqual({
        data: {
          items: {
            _type: "array",
            items: {
              id: "string",
              name: "string",
            },
          },
        },
      });
    } finally {
      if (originalEnv !== undefined) {
        process.env["KHOTAN_DEBUG"] = originalEnv;
      } else {
        delete process.env["KHOTAN_DEBUG"];
      }
    }
  });

  it("serializes v4-style schema defs in debug metadata", async () => {
    const originalEnv = process.env["KHOTAN_DEBUG"];
    process.env["KHOTAN_DEBUG"] = "1";
    try {
      const v4StyleBodySchema = {
        _def: {
          type: "object",
          shape: {
            partnershipId: { _def: { type: "string" } },
            status: {
              _def: {
                type: "enum",
                entries: { draft: "draft", accepted: "accepted" },
              },
            },
            totalAmount: { _def: { type: "number" } },
            notes: {
              _def: {
                type: "optional",
                innerType: { _def: { type: "string" } },
              },
            },
            lines: {
              _def: {
                type: "array",
                element: {
                  _def: {
                    type: "object",
                    shape: {
                      quantity: { _def: { type: "number" } },
                      description: { _def: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const instance = khotan({
        adapter,
        plugs: [
          {
            name: "pollinate",
            plug: {
              baseUrl: "https://api.pollinate.tech",
              authType: "bearer",
              get: vi.fn(),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
              endpoints: {
                createOrder: {
                  method: "POST",
                  path: "/orders",
                  body: v4StyleBodySchema,
                },
              },
            },
          },
        ],
      });

      const res = await instance.handler(
        makeRequest("/api/khotan/debug/pollinate"),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.endpoints.createOrder.body).toEqual({
        partnershipId: "string",
        status: '"draft" | "accepted"',
        totalAmount: "number",
        notes: "string?",
        lines: {
          _type: "array",
          items: {
            quantity: "number",
            description: "string",
          },
        },
      });
    } finally {
      if (originalEnv !== undefined) {
        process.env["KHOTAN_DEBUG"] = originalEnv;
      } else {
        delete process.env["KHOTAN_DEBUG"];
      }
    }
  });

  it("includes endpoint metadata when path matches typed endpoint", async () => {
    const originalEnv = process.env["KHOTAN_DEBUG"];
    process.env["KHOTAN_DEBUG"] = "1";
    try {
      const instance = khotan({
        adapter,
        plugs: [
          {
            name: "stripe",
            plug: {
              baseUrl: "https://api.stripe.com",
              authType: "bearer",
              get: vi.fn(async () => []),
              post: vi.fn(),
              put: vi.fn(),
              patch: vi.fn(),
              delete: vi.fn(),
            },
            endpoints: {
              listProducts: { method: "GET", path: "/products" },
              createCharge: { method: "POST", path: "/charges" },
            },
          },
        ],
      });

      const res = await instance.handler(
        makeRequest("/api/khotan/debug/stripe", "POST", {
          method: "GET",
          path: "/products",
        }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.endpoint).toEqual({
        name: "listProducts",
        method: "GET",
        path: "/products",
      });
    } finally {
      if (originalEnv !== undefined) {
        process.env["KHOTAN_DEBUG"] = originalEnv;
      } else {
        delete process.env["KHOTAN_DEBUG"];
      }
    }
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

    const req = new Request("http://localhost/api/khotan/flows/1/runs", {
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
