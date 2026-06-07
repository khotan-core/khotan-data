import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createPlugClient, defineContract, type PlugLike } from "./plug-client.js";

function createMockPlug(
  response: unknown = { id: "1", name: "Widget" },
): PlugLike & { calls: Array<{ method: string; path: string; options?: unknown }> } {
  const calls: Array<{ method: string; path: string; options?: unknown }> = [];
  return {
    calls,
    async request<T>(
      method: string,
      path: string,
      options?: Record<string, unknown>,
    ): Promise<T> {
      calls.push({ method, path, options });
      return response as T;
    },
  };
}

function createErrorPlug(status: number, body: unknown): PlugLike {
  return {
    async request(): Promise<never> {
      const err = new Error(`Request failed with ${status}`) as Error & {
        status: number;
        body: unknown;
        statusText: string;
        url: string;
        method: string;
      };
      err.name = "PlugError";
      err.status = status;
      err.body = typeof body === "string" ? body : JSON.stringify(body);
      err.statusText = "Error";
      err.url = "http://test.com";
      err.method = "GET";
      throw err;
    },
  };
}

const testContract = defineContract({
  getProduct: {
    method: "GET",
    path: "/products/:id",
    responses: {
      200: z.object({
        id: z.string(),
        name: z.string(),
      }),
      404: z.object({
        error: z.string(),
      }),
    },
  },
  listProducts: {
    method: "GET",
    path: "/products",
    query: z.object({
      page: z.number(),
      limit: z.number().optional(),
    }),
    responses: {
      200: z.object({
        data: z.array(z.object({ id: z.string() })),
        total: z.number(),
      }),
    },
  },
  createProduct: {
    method: "POST",
    path: "/products",
    body: z.object({
      name: z.string(),
      price: z.number(),
    }),
    responses: {
      201: z.object({
        id: z.string(),
        name: z.string(),
        price: z.number(),
      }),
    },
  },
  updateVariant: {
    method: "PUT",
    path: "/products/:productId/variants/:variantId",
    body: z.object({
      color: z.string(),
    }),
    responses: {
      200: z.object({ ok: z.boolean() }),
    },
  },
});

// ---------------------------------------------------------------------------
// 6.1 Path interpolation
// ---------------------------------------------------------------------------

describe("createPlugClient — path interpolation", () => {
  it("replaces single :param with provided value", async () => {
    const plug = createMockPlug({ id: "abc", name: "Test" });
    const client = createPlugClient(testContract, plug);

    await client.getProduct({ params: { id: "abc" } });

    expect(plug.calls[0]!.path).toBe("/products/abc");
    expect(plug.calls[0]!.method).toBe("GET");
  });

  it("replaces multiple :params in a single path", async () => {
    const plug = createMockPlug({ ok: true });
    const client = createPlugClient(testContract, plug);

    await client.updateVariant({
      params: { productId: "p1", variantId: "v2" },
      body: { color: "red" },
    });

    expect(plug.calls[0]!.path).toBe("/products/p1/variants/v2");
  });

  it("encodes special characters in path params", async () => {
    const plug = createMockPlug({ id: "a/b", name: "Test" });
    const client = createPlugClient(testContract, plug);

    await client.getProduct({ params: { id: "a/b" } });

    expect(plug.calls[0]!.path).toBe("/products/a%2Fb");
  });
});

// ---------------------------------------------------------------------------
// 6.2 Input validation
// ---------------------------------------------------------------------------

describe("createPlugClient — input validation", () => {
  it("passes valid query params through", async () => {
    const plug = createMockPlug({ data: [{ id: "1" }], total: 1 });
    const client = createPlugClient(testContract, plug);

    await client.listProducts({ query: { page: 1, limit: 10 } });

    expect(plug.calls[0]!.options).toEqual(
      expect.objectContaining({ params: { page: 1, limit: 10 } }),
    );
  });

  it("throws ZodError for invalid query params before making request", async () => {
    const plug = createMockPlug();
    const client = createPlugClient(testContract, plug);

    await expect(
      // @ts-expect-error intentionally passing wrong type
      client.listProducts({ query: { page: "not-a-number" } }),
    ).rejects.toThrow();

    expect(plug.calls).toHaveLength(0);
  });

  it("passes valid body through", async () => {
    const plug = createMockPlug({ id: "new", name: "Widget", price: 10 });
    const client = createPlugClient(testContract, plug);

    await client.createProduct({ body: { name: "Widget", price: 10 } });

    expect(plug.calls[0]!.options).toEqual(
      expect.objectContaining({ body: { name: "Widget", price: 10 } }),
    );
  });

  it("throws ZodError for invalid body before making request", async () => {
    const plug = createMockPlug();
    const client = createPlugClient(testContract, plug);

    await expect(
      // @ts-expect-error intentionally passing wrong type
      client.createProduct({ body: { name: 123, price: "bad" } }),
    ).rejects.toThrow();

    expect(plug.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6.3 Response validation
// ---------------------------------------------------------------------------

describe("createPlugClient — response validation", () => {
  it("validates and returns successful response body", async () => {
    const plug = createMockPlug({ id: "abc", name: "Widget" });
    const client = createPlugClient(testContract, plug);

    const result = await client.getProduct({ params: { id: "abc" } });

    expect(result).toEqual({ status: 200, body: { id: "abc", name: "Widget" } });
  });

  it("strips unknown fields from response (Zod default)", async () => {
    const plug = createMockPlug({
      id: "abc",
      name: "Widget",
      extraField: "should be stripped",
    });
    const client = createPlugClient(testContract, plug);

    const result = await client.getProduct({ params: { id: "abc" } });

    expect(result.body).toEqual({ id: "abc", name: "Widget" });
    expect((result.body as Record<string, unknown>)["extraField"]).toBeUndefined();
  });

  it("throws ZodError when response is invalid", async () => {
    const plug = createMockPlug({ id: 123 }); // id should be string
    const client = createPlugClient(testContract, plug);

    await expect(
      client.getProduct({ params: { id: "abc" } }),
    ).rejects.toThrow();
  });

  it("skips validation when validateResponse is false per-request", async () => {
    const plug = createMockPlug({ id: 123, unexpected: true });
    const client = createPlugClient(testContract, plug);

    const result = await client.getProduct({
      params: { id: "abc" },
      validateResponse: false,
    });

    expect(result.body).toEqual({ id: 123, unexpected: true });
  });

  it("skips validation when validateResponse is false globally", async () => {
    const plug = createMockPlug({ id: 123, unexpected: true });
    const client = createPlugClient(testContract, plug, {
      validateResponse: false,
    });

    const result = await client.getProduct({ params: { id: "abc" } });

    expect(result.body).toEqual({ id: 123, unexpected: true });
  });
});

// ---------------------------------------------------------------------------
// 6.4 Status-code-aware responses
// ---------------------------------------------------------------------------

describe("createPlugClient — status-code-aware responses", () => {
  it("returns { status: 200, body } on success", async () => {
    const plug = createMockPlug({ id: "abc", name: "Widget" });
    const client = createPlugClient(testContract, plug);

    const result = await client.getProduct({ params: { id: "abc" } });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({ id: "abc", name: "Widget" });
  });

  it("returns { status: 404, body } for defined error status codes", async () => {
    const plug = createErrorPlug(404, { error: "not_found" });
    const client = createPlugClient(testContract, plug);

    const result = await client.getProduct({ params: { id: "missing" } });

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "not_found" });
  });

  it("throws PlugError for undefined status codes", async () => {
    const plug = createErrorPlug(500, "internal error");
    const client = createPlugClient(testContract, plug);

    await expect(
      client.getProduct({ params: { id: "abc" } }),
    ).rejects.toThrow("Request failed with 500");
  });
});

// ---------------------------------------------------------------------------
// 6.5 Delegates auth/retry to Plug
// ---------------------------------------------------------------------------

describe("createPlugClient — delegates to Plug", () => {
  it("passes headers to Plug request", async () => {
    const plug = createMockPlug({ id: "abc", name: "Widget" });
    const client = createPlugClient(testContract, plug);

    await client.getProduct({
      params: { id: "abc" },
      headers: { "X-Request-Id": "req-123" },
    });

    expect(plug.calls[0]!.options).toEqual(
      expect.objectContaining({ headers: { "X-Request-Id": "req-123" } }),
    );
  });

  it("delegates HTTP method to Plug", async () => {
    const plug = createMockPlug({ id: "new", name: "Widget", price: 10 });
    const client = createPlugClient(testContract, plug);

    await client.createProduct({ body: { name: "Widget", price: 10 } });

    expect(plug.calls[0]!.method).toBe("POST");
  });

  it("uses Plug for all requests (auth/retry are Plug's responsibility)", async () => {
    const requestSpy = vi.fn().mockResolvedValue({ id: "1", name: "Test" });
    const plug: PlugLike = { request: requestSpy };
    const client = createPlugClient(testContract, plug);

    await client.getProduct({ params: { id: "1" } });

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy).toHaveBeenCalledWith("GET", "/products/1", {});
  });
});
