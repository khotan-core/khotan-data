import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ingest, type IngestIdempotencyStore } from "./ingest.js";

const EventSchema = z.object({
  eventId: z.string(),
  orgKey: z.string(),
  sku: z.string(),
});

type EventBody = z.infer<typeof EventSchema>;
type Org = { id: string };
type Result = { status: "processed" | "parked"; sku?: string };

function post(body: unknown): Request {
  return new Request("https://example.test/api/internal/khotan/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("ingest", () => {
  it("passes a schema-typed body into the handler", async () => {
    const handler = vi.fn(async (_ctx, body: EventBody) => ({
      status: "processed" as const,
      sku: body.sku,
    }));
    const route = ingest({
      name: "inventory",
      schema: EventSchema,
      resolveOrg: ({ body }) => ({ id: body.orgKey }),
      handler,
    });

    const response = await route.POST(
      post({ eventId: "evt_1", orgKey: "org_1", sku: "SKU-1" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      name: "inventory",
      deduped: false,
      parked: false,
      result: { status: "processed", sku: "SKU-1" },
    });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ org: { id: "org_1" } }),
      expect.objectContaining({ sku: "SKU-1" }),
    );
  });

  it("rejects invalid request bodies before resolving orgs", async () => {
    const resolveOrg = vi.fn();
    const route = ingest({
      name: "inventory",
      schema: EventSchema,
      resolveOrg,
      handler: async () => ({ status: "processed" as const }),
    });

    const response = await route.POST(post({ eventId: "evt_1" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "invalid_body",
    });
    expect(resolveOrg).not.toHaveBeenCalled();
  });

  it("dedupes claimed idempotency keys before running the handler", async () => {
    const handler = vi.fn(async () => ({ status: "processed" as const }));
    const store: IngestIdempotencyStore<EventBody, Org, Result> = {
      claim: vi.fn(async () => ({
        status: "duplicate" as const,
        result: { status: "processed", sku: "SKU-1" },
      })),
      complete: vi.fn(),
    };
    const route = ingest({
      name: "inventory",
      schema: EventSchema,
      resolveOrg: ({ body }) => ({ id: body.orgKey }),
      idempotencyKey: (body) => body.eventId,
      idempotencyStore: store,
      handler,
    });

    const response = await route.POST(
      post({ eventId: "evt_1", orgKey: "org_1", sku: "SKU-1" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      deduped: true,
      result: { status: "processed", sku: "SKU-1" },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("parks unresolved org intake and completes the idempotency key", async () => {
    const store: IngestIdempotencyStore<EventBody, Org, Result> = {
      claim: vi.fn(async () => ({ status: "claimed" as const })),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const route = ingest({
      name: "inventory",
      schema: EventSchema,
      resolveOrg: () => null,
      idempotencyKey: (body) => body.eventId,
      idempotencyStore: store,
      onUnresolved: async ({ body }) => ({
        status: "parked" as const,
        sku: body.sku,
      }),
      handler: vi.fn(),
    });

    const response = await route.POST(
      post({ eventId: "evt_1", orgKey: "missing", sku: "SKU-1" }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      parked: true,
      result: { status: "parked", sku: "SKU-1" },
    });
    expect(store.complete).toHaveBeenCalledWith(
      "evt_1",
      { status: "parked", sku: "SKU-1" },
      expect.objectContaining({
        body: expect.objectContaining({ sku: "SKU-1" }),
        parked: true,
      }),
    );
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("preserves parked state when replaying a completed unresolved claim", async () => {
    const handler = vi.fn(async () => ({ status: "processed" as const }));
    const store: IngestIdempotencyStore<EventBody, Org, Result> = {
      claim: vi.fn(async () => ({
        status: "duplicate" as const,
        parked: true,
        result: { status: "parked", sku: "SKU-1" },
      })),
      complete: vi.fn(),
    };
    const route = ingest({
      name: "inventory",
      schema: EventSchema,
      resolveOrg: ({ body }) => ({ id: body.orgKey }),
      idempotencyKey: (body) => body.eventId,
      idempotencyStore: store,
      handler,
    });

    const response = await route.POST(
      post({ eventId: "evt_1", orgKey: "org_1", sku: "SKU-1" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      deduped: true,
      parked: true,
      result: { status: "parked", sku: "SKU-1" },
    });
    expect(handler).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("completes parked idempotency keys when onUnresolved returns no result", async () => {
    const store: IngestIdempotencyStore<EventBody, Org, Result> = {
      claim: vi.fn(async () => ({ status: "claimed" as const })),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const route = ingest({
      name: "inventory",
      schema: EventSchema,
      resolveOrg: () => undefined,
      idempotencyKey: (body) => body.eventId,
      idempotencyStore: store,
      onUnresolved: vi.fn(async () => undefined),
      handler: vi.fn(),
    });

    const response = await route.POST(
      post({ eventId: "evt_1", orgKey: "missing", sku: "SKU-1" }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      deduped: false,
      parked: true,
    });
    expect(store.complete).toHaveBeenCalledWith(
      "evt_1",
      undefined,
      expect.objectContaining({
        body: expect.objectContaining({ sku: "SKU-1" }),
        parked: true,
      }),
    );
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("routes mapping helper calls through the configured mapping store", async () => {
    const upsert = vi.fn(async () => ({ id: "mapping_1" }));
    const route = ingest({
      name: "inventory",
      schema: EventSchema,
      resolveOrg: ({ body }) => ({ id: body.orgKey }),
      mappings: {
        lookup: vi.fn(async () => null),
        upsert,
      },
      handler: async (ctx, body) => {
        await ctx
          .mapping("resource_products")
          .upsertProviderRef("packiyo", "remote_1", body.sku);
        return { status: "processed" as const, sku: body.sku };
      },
    });

    const response = await route.POST(
      post({ eventId: "evt_1", orgKey: "org_1", sku: "SKU-1" }),
    );

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({
      resourceId: "resource_products",
      connectValue: "SKU-1",
      refs: { packiyo: "remote_1" },
    });
  });

  it("requires an idempotency store when idempotencyKey is configured", async () => {
    const route = ingest({
      name: "inventory",
      schema: EventSchema,
      resolveOrg: ({ body }) => ({ id: body.orgKey }),
      idempotencyKey: (body) => body.eventId,
      handler: async () => ({ status: "processed" as const }),
    });

    const response = await route.POST(
      post({ eventId: "evt_1", orgKey: "org_1", sku: "SKU-1" }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "missing_idempotency_store",
    });
  });
});
