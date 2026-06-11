import { afterEach, describe, expect, it, vi } from "vitest";
import { wireCommand } from "./commands/wire.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function runWireAction(args: string[]) {
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
    await wireCommand.parseAsync(args, { from: "user" });
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

describe("wire command", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists plug wire state", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([{ name: "pollinate" }, { name: "shopify" }]))
      .mockResolvedValueOnce(jsonResponse([{ name: "pollinate" }, { name: "shopify" }]))
      .mockResolvedValueOnce(jsonResponse({ wire: { id: "wire_1", status: "active" }, configured: true }))
      .mockResolvedValueOnce(jsonResponse({ wire: null, configured: false }));

    const { parsed, thrown } = await runWireAction(["--list", "--base-path", "/api/khotan"]);

    expect(thrown).toBeNull();
    expect(parsed[0]).toEqual({
      ok: true,
      wires: [
        {
          plugName: "pollinate",
          configured: true,
          connected: true,
          wire: { id: "wire_1", status: "active" },
        },
        {
          plugName: "shopify",
          configured: false,
          connected: false,
          wire: null,
        },
      ],
    });
  });

  it("connects a wire using the khotan catch-all webhook path", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([{ name: "pollinate" }]))
      .mockResolvedValueOnce(jsonResponse({
        wire: {
          id: "wire_1",
          callbackUrl: "https://example.ngrok.app/api/khotan/webhook/pollinate",
          status: "active",
        },
      }, 201));

    const { parsed, thrown } = await runWireAction([
      "pollinate",
      "connect",
      "--base-path",
      "/api/khotan",
      "--webhook-origin",
      "https://example.ngrok.app",
    ]);

    expect(thrown).toBeNull();
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3000/api/khotan/wires/pollinate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          callbackUrl: "https://example.ngrok.app/api/khotan/webhook/pollinate",
        }),
      }),
    );
    expect(parsed[0]?.["ok"]).toBe(true);
  });

  it("disconnects the current wire when no wire id is provided", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse([{ name: "pollinate" }]))
      .mockResolvedValueOnce(jsonResponse({ wire: { id: "wire_1" }, configured: true }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const { parsed, thrown } = await runWireAction([
      "pollinate",
      "disconnect",
      "--base-path",
      "/api/khotan",
    ]);

    expect(thrown).toBeNull();
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      3,
      "http://localhost:3000/api/khotan/wires/pollinate",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ wireId: "wire_1" }),
      }),
    );
    expect(parsed[0]).toEqual({
      ok: true,
      action: "disconnect",
      plugName: "pollinate",
      wireId: "wire_1",
    });
  });
});
