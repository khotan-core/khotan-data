import { afterEach, describe, expect, it, vi } from "vitest";
import { varsCommand } from "./commands/plug-vars.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function runPlugVarsAction(args: string[]) {
  const writes: string[] = [];
  const writeSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      if (chunk === undefined || chunk === null) return true;
      writes.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    });
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number) => {
    throw new Error(`EXIT:${String(code ?? 0)}`);
  });

  let thrown: unknown = null;
  try {
    await varsCommand.parseAsync(args, { from: "user" });
  } catch (error) {
    thrown = error;
  } finally {
    writeSpy.mockRestore();
    exitSpy.mockRestore();
  }

  const parsed = writes
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => JSON.parse(w) as Record<string, unknown>);

  return { parsed, thrown };
}

describe("plug vars command", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows variables for a plug", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([{ name: "pollinate" }]))
      .mockResolvedValueOnce(
        jsonResponse({
          configured: true,
          fields: [{ key: "apiKey", label: "API Key", type: "password", secret: true }],
          values: { apiKey: "••••••••" },
        }),
      );

    const { parsed, thrown } = await runPlugVarsAction([
      "pollinate",
      "--base-path",
      "/api/khotan",
    ]);

    expect(thrown).toBeNull();
    expect(parsed[0]).toEqual({
      ok: true,
      plugName: "pollinate",
      configured: true,
      fields: [{ key: "apiKey", label: "API Key", type: "password", secret: true }],
      values: { apiKey: "••••••••" },
    });
  });

  it("sets variables using JSON payload", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([{ name: "pollinate" }]))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const { parsed, thrown } = await runPlugVarsAction([
      "pollinate",
      "set",
      "--json",
      '{"apiKey":"secret","orgId":"org_123"}',
      "--base-path",
      "/api/khotan",
    ]);

    expect(thrown).toBeNull();
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3000/api/khotan/variables/pollinate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ apiKey: "secret", orgId: "org_123" }),
      }),
    );
    expect(parsed[0]).toEqual({
      ok: true,
      action: "set",
      plugName: "pollinate",
    });
  });

  it("lists variable state for all plugs", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([{ name: "pollinate" }, { name: "shopify" }]))
      .mockResolvedValueOnce(jsonResponse([{ name: "pollinate" }, { name: "shopify" }]))
      .mockResolvedValueOnce(
        jsonResponse({
          configured: true,
          fields: [{ key: "apiKey", label: "API Key", type: "password", secret: true }],
          values: { apiKey: "••••••••" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          configured: false,
          fields: [],
          values: {},
        }),
      );

    const { parsed, thrown } = await runPlugVarsAction([
      "--list",
      "--base-path",
      "/api/khotan",
    ]);

    expect(thrown).toBeNull();
    expect(parsed[0]).toEqual({
      ok: true,
      variables: [
        {
          plugName: "pollinate",
          configured: true,
          fields: [{ key: "apiKey", label: "API Key", type: "password", secret: true }],
          values: { apiKey: "••••••••" },
        },
        {
          plugName: "shopify",
          configured: false,
          fields: [],
          values: {},
        },
      ],
    });
  });
});
