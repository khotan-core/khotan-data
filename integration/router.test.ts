/**
 * Integration tests for the khotan runtime HTTP router.
 *
 * These hit a live brs-khotan-connector dev server (default http://localhost:3000).
 * They are NOT part of the normal vitest suite — run manually:
 *
 *   npx vitest run --config vitest.integration.ts
 *
 * Prerequisites:
 *   1. brs-khotan-connector dev server running on $KHOTAN_TEST_URL (default localhost:3000)
 *   2. KHOTAN_SECRET set in the test app's .env (needed for CLI auth token tests)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { deriveCliToken } from "../src/factory.js";

const BASE = process.env["KHOTAN_TEST_URL"] ?? "http://localhost:3000";
const API = `${BASE}/api/khotan`;

// Read the test app's KHOTAN_SECRET for CLI token auth
const KHOTAN_SECRET = process.env["KHOTAN_SECRET"] ?? "";

async function fetchApi(
  path: string,
  options: RequestInit & { expectStatus?: number } = {},
): Promise<{ status: number; body: unknown }> {
  const { expectStatus, ...fetchOpts } = options;
  const res = await fetch(`${API}${path}`, fetchOpts);
  let body: unknown;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("json")) {
    body = await res.json();
  } else if (res.status === 204) {
    body = null;
  } else {
    body = await res.text();
  }
  if (expectStatus !== undefined) {
    expect(res.status).toBe(expectStatus);
  }
  return { status: res.status, body };
}

async function authedFetch(
  path: string,
  options: RequestInit & { expectStatus?: number } = {},
): Promise<{ status: number; body: unknown }> {
  if (!KHOTAN_SECRET) {
    throw new Error(
      "KHOTAN_SECRET env var is required for authenticated integration tests",
    );
  }
  const timestamp = String(Date.now());
  const hmac = await deriveCliToken(KHOTAN_SECRET, timestamp);
  const headers = new Headers(options.headers);
  headers.set("Authorization", `KhotanCLI ${timestamp}.${hmac}`);
  return fetchApi(path, { ...options, headers });
}

// ---------------------------------------------------------------------------
// Connectivity check
// ---------------------------------------------------------------------------

describe("server connectivity", () => {
  beforeAll(async () => {
    try {
      await fetch(BASE, { signal: AbortSignal.timeout(5_000) });
    } catch {
      throw new Error(
        `Cannot reach test server at ${BASE}. ` +
          "Start the brs-khotan-connector dev server first.",
      );
    }
  });

  it("responds to a basic request", async () => {
    const res = await fetch(BASE);
    expect(res.status).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// Auth gate (2.2 + 2.9)
// ---------------------------------------------------------------------------

describe("auth gate", () => {
  it("rejects unauthenticated management requests with 401", async () => {
    const { status, body } = await fetchApi("/plugs");
    expect(status).toBe(401);
    expect(body).toMatchObject({
      error: "Unauthorized",
      code: "authorize_rejected",
    });
    expect((body as Record<string, unknown>)["hint"]).toBeDefined();
  });

  it("allows unauthenticated cron requests (non-production)", async () => {
    const { status, body } = await fetchApi("/cron");
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true });
  });

  it("allows unauthenticated debug requests when KHOTAN_DEBUG is set", async () => {
    const { status, body } = await fetchApi("/debug");
    expect(status).toBe(200);
    expect(body).toMatchObject({ enabled: true });
  });

  it("authenticates via CLI token when KHOTAN_SECRET is available", async () => {
    if (!KHOTAN_SECRET) return;
    const { status, body } = await authedFetch("/plugs");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Declarative router — GET routes (2.1)
// ---------------------------------------------------------------------------

describe("GET routes", () => {
  if (!KHOTAN_SECRET) return;

  it("GET /plugs returns array of registered plugs", async () => {
    const { status, body } = await authedFetch("/plugs");
    expect(status).toBe(200);
    const plugs = body as Record<string, unknown>[];
    expect(Array.isArray(plugs)).toBe(true);
    expect(plugs.length).toBeGreaterThan(0);
    expect(plugs[0]).toHaveProperty("name");
    expect(plugs[0]).toHaveProperty("id");
  });

  it("GET /plugs/:id returns a single plug with flows", async () => {
    const { body: plugs } = await authedFetch("/plugs", { expectStatus: 200 });
    const first = (plugs as Record<string, unknown>[])[0]!;
    const plugId = first["id"] as string;

    const { status, body } = await authedFetch(`/plugs/${plugId}`);
    expect(status).toBe(200);
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("flows");
  });

  it("GET /plugs/:bad returns 404", async () => {
    const { status } = await authedFetch("/plugs/nonexistent-id");
    expect(status).toBe(404);
  });

  it("GET /flows returns array of registered flows", async () => {
    const { status, body } = await authedFetch("/flows");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /resources returns array of registered resources", async () => {
    const { status, body } = await authedFetch("/resources");
    expect(status).toBe(200);
    const resources = body as Record<string, unknown>[];
    expect(Array.isArray(resources)).toBe(true);
    if (resources.length > 0) {
      expect(resources[0]).toHaveProperty("mapping");
    }
  });

  it("GET /runs returns paginated runs", async () => {
    const { status, body } = await authedFetch("/runs?limit=5");
    expect(status).toBe(200);
    const data = body as Record<string, unknown>;
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("page");
    expect(Array.isArray(data["items"])).toBe(true);
    const page = data["page"] as Record<string, unknown>;
    expect(page["limit"]).toBe(5);
  });

  it("GET /runs/:id returns a single run or 404", async () => {
    const { body: runsPage } = await authedFetch("/runs?limit=1", {
      expectStatus: 200,
    });
    const items = (runsPage as { items: Record<string, unknown>[] }).items;
    if (items.length === 0) return;

    const runId = items[0]!["id"] as string;
    const { status, body } = await authedFetch(`/runs/${runId}`);
    expect(status).toBe(200);
    expect(body).toHaveProperty("id");
  });

  it("GET /webhook-events returns paginated events", async () => {
    const { status, body } = await authedFetch("/webhook-events?limit=3");
    expect(status).toBe(200);
    const data = body as Record<string, unknown>;
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("page");
  });
});

// ---------------------------------------------------------------------------
// Debug routes (2.1 + 2.8)
// ---------------------------------------------------------------------------

describe("debug routes", () => {
  it("GET /debug/:plugName returns plug info", async () => {
    // Debug routes don't require authorize — they check KHOTAN_DEBUG
    const { body: plugs } = await authedFetch("/plugs", { expectStatus: 200 });
    const first = (plugs as Record<string, unknown>[])[0];
    if (!first) return;
    const plugName = first["name"] as string;

    const { status, body } = await fetchApi(`/debug/${plugName}`);
    expect(status).toBe(200);
    const data = body as Record<string, unknown>;
    expect(data["name"]).toBe(plugName);
    expect(data).toHaveProperty("baseUrl");
    expect(data).toHaveProperty("endpoints");
    expect(data).toHaveProperty("vars");
  });

  it("GET /debug/:nonexistent returns 404", async () => {
    const { status } = await fetchApi("/debug/nonexistent-plug-xyz");
    expect(status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Variables routes (2.1)
// ---------------------------------------------------------------------------

describe("variables routes", () => {
  if (!KHOTAN_SECRET) return;

  it("GET /variables/:plugName returns var fields and masked values", async () => {
    const { body: plugs } = await authedFetch("/plugs", { expectStatus: 200 });
    const first = (plugs as Record<string, unknown>[])[0];
    if (!first) return;
    const plugName = first["name"] as string;

    const { status, body } = await authedFetch(`/variables/${plugName}`);
    expect(status).toBe(200);
    const data = body as Record<string, unknown>;
    expect(data).toHaveProperty("fields");
    expect(data).toHaveProperty("configured");
  });

  it("GET /variables/:nonexistent returns 404", async () => {
    const { status } = await authedFetch("/variables/fake-plug");
    expect(status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Cron dispatch (2.1)
// ---------------------------------------------------------------------------

describe("cron dispatch", () => {
  it("GET /cron dispatches scheduled flows", async () => {
    const { status, body } = await fetchApi("/cron");
    expect(status).toBe(200);
    const data = body as Record<string, unknown>;
    expect(data["ok"]).toBe(true);
    expect(data).toHaveProperty("tickAt");
    expect(data).toHaveProperty("triggered");
    expect(data).toHaveProperty("skipped");
    expect(typeof data["evaluated"]).toBe("number");
  });

  it("POST /cron with custom runType", async () => {
    const { status, body } = await fetchApi("/cron", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runType: "test" }),
    });
    expect(status).toBe(200);
    const data = body as Record<string, unknown>;
    expect(data["ok"]).toBe(true);
    expect(data["runType"]).toBe("test");
  });
});

// ---------------------------------------------------------------------------
// 404 handling (2.1)
// ---------------------------------------------------------------------------

describe("404 handling", () => {
  it("returns 404 for unknown routes", async () => {
    const { status, body } = await fetchApi("/this-route-does-not-exist");
    expect(status).toBe(404);
    expect(body).toMatchObject({ error: "Not found" });
  });

  it("returns 404 for wrong method on known pattern", async () => {
    // PATCH /debug is not a route
    const { status } = await fetchApi("/debug", { method: "PATCH" });
    expect(status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Resource mappings (2.1)
// ---------------------------------------------------------------------------

describe("resource mappings", () => {
  if (!KHOTAN_SECRET) return;

  it("GET /resources/:id/mappings returns mappings for a resource", async () => {
    const { body: resources } = await authedFetch("/resources", {
      expectStatus: 200,
    });
    const first = (resources as Record<string, unknown>[])[0];
    if (!first) return;
    const resourceId = first["id"] as string;

    const { status, body } = await authedFetch(
      `/resources/${resourceId}/mappings`,
    );
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /resources/:id/mappings with pagination params", async () => {
    const { body: resources } = await authedFetch("/resources", {
      expectStatus: 200,
    });
    const first = (resources as Record<string, unknown>[])[0];
    if (!first) return;
    const resourceId = first["id"] as string;

    const { status, body } = await authedFetch(
      `/resources/${resourceId}/mappings?limit=2&offset=0`,
    );
    expect(status).toBe(200);
    const data = body as Record<string, unknown>;
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("page");
  });
});
