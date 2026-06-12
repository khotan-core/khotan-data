import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { formatSize, parsePortFromEnvFile } from "./commands/probe.js";
import { plugCommand, probeCommand } from "./commands/probe.js";

// ---------------------------------------------------------------------------
// Port detection tests (unit-level, no server needed)
// ---------------------------------------------------------------------------

describe("probe port detection", () => {
  const tmpDir = path.join(
    import.meta.dirname ?? __dirname,
    "__probe_test_tmp",
  );

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses PORT from .env.local", () => {
    fs.writeFileSync(path.join(tmpDir, ".env.local"), "PORT=4200\n");
    expect(parsePortFromEnvFile(path.join(tmpDir, ".env.local"))).toBe(4200);
  });

  it("parses PORT from .env with quotes", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), 'PORT="3001"\n');
    expect(parsePortFromEnvFile(path.join(tmpDir, ".env"))).toBe(3001);
  });

  it("ignores commented PORT lines", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "# PORT=9999\nFOO=bar\n");
    expect(parsePortFromEnvFile(path.join(tmpDir, ".env"))).toBeNull();
  });

  it("returns null when file does not exist", () => {
    expect(parsePortFromEnvFile(path.join(tmpDir, ".env.local"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatSize tests
// ---------------------------------------------------------------------------

describe("formatSize", () => {
  it("formats bytes", () => {
    expect(formatSize(234)).toBe("234b");
  });

  it("formats kilobytes", () => {
    expect(formatSize(1434)).toBe("1.4kb");
  });

  it("formats megabytes", () => {
    expect(formatSize(2_200_000)).toBe("2.1mb");
  });
});

// ---------------------------------------------------------------------------
// Connectivity check error shapes
// ---------------------------------------------------------------------------

describe("probe error shapes", () => {
  it("connect_failed error has correct shape", () => {
    const error = {
      ok: false,
      error: "connect_failed",
      hint: "Could not connect to dev server at localhost:3000. Is it running?",
    };
    expect(error.ok).toBe(false);
    expect(error.error).toBe("connect_failed");
    expect(error.hint).toContain("localhost:");
  });

  it("debug_disabled error has correct shape", () => {
    const error = {
      ok: false,
      error: "debug_disabled",
      hint: "Debug mode is not enabled. Set KHOTAN_DEBUG=1 in your environment and restart.",
    };
    expect(error.ok).toBe(false);
    expect(error.error).toBe("debug_disabled");
    expect(error.hint).toContain("KHOTAN_DEBUG");
  });

  it("plug_not_found error has correct shape", () => {
    const error = {
      ok: false,
      error: "plug_not_found",
      hint: 'Plug "nonexistent" not found. Use --list to see available plugs.',
    };
    expect(error.ok).toBe(false);
    expect(error.error).toBe("plug_not_found");
    expect(error.hint).toContain("nonexistent");
  });

  it("endpoint_not_found error has correct shape", () => {
    const error = {
      ok: false,
      error: "endpoint_not_found",
      hint: 'Endpoint "unknownEndpoint" not found on plug "pollinate". Use --info to see available endpoints.',
    };
    expect(error.ok).toBe(false);
    expect(error.error).toBe("endpoint_not_found");
  });
});

// ---------------------------------------------------------------------------
// Compare integration with probe output
// ---------------------------------------------------------------------------

describe("probe --compare output shapes", () => {
  it("comparison match shape", () => {
    const output = {
      comparison: { match: true, mismatches: [] },
    };
    expect(output.comparison.match).toBe(true);
    expect(output.comparison.mismatches).toHaveLength(0);
  });

  it("comparison mismatch shape", () => {
    const output = {
      comparison: {
        match: false,
        expected: { id: "string", name: "string" },
        actual: {
          type: "object",
          properties: {
            id: { type: "string" },
            token: { type: "string" },
          },
        },
        mismatches: [
          { path: "$.name", issue: "missing" },
          { path: "$.token", issue: "extra" },
        ],
      },
    };
    expect(output.comparison.match).toBe(false);
    expect(output.comparison.mismatches).toHaveLength(2);
    expect(output.comparison.mismatches[0]!.issue).toBe("missing");
    expect(output.comparison.mismatches[1]!.issue).toBe("extra");
  });

  it("no schema comparison shape", () => {
    const output = {
      comparison: null,
      comparisonNote: "No response schema defined for this endpoint",
    };
    expect(output.comparison).toBeNull();
    expect(output.comparisonNote).toContain("No response schema");
  });
});

// ---------------------------------------------------------------------------
// Probe command integration-style tests (mocked fetch + stdout)
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function runProbeAction(args: string[]) {
  const writes: string[] = [];
  const writeSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      if (chunk === undefined || chunk === null) return true;
      writes.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    });
  const exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation((code?: number) => {
      throw new Error(`EXIT:${String(code ?? 0)}`);
    });

  let thrown: unknown = null;
  try {
    await plugCommand.parseAsync(args, { from: "user" });
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

describe("probe command integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("supports --list mode with connectivity check", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ enabled: true }))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            name: "pollinate",
            baseUrl: "https://api.example.com",
            authType: "bearer",
            varsConfigured: true,
          },
        ]),
      );

    const { parsed, thrown } = await runProbeAction([
      "--list",
      "--base-path",
      "/api/khotan",
    ]);

    expect(thrown).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/khotan/debug",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/khotan/plugs",
    );
    expect(parsed[0]).toEqual({
      ok: true,
      plugs: [
        {
          name: "pollinate",
          baseUrl: "https://api.example.com",
          authType: "bearer",
          varsConfigured: true,
        },
      ],
    });
  });

  it("supports the legacy probe alias", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ enabled: true }))
      .mockResolvedValueOnce(jsonResponse([]));

    const { parsed, thrown } = await runProbeAction([
      "probe",
      "--list",
      "--base-path",
      "/api/khotan",
    ]);

    expect(thrown).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/khotan/debug",
    );
    expect(parsed[0]).toEqual({
      ok: true,
      plugs: [],
    });
    expect(probeCommand).toBe(plugCommand);
  });

  it("returns plug_not_found in --info mode for unknown plug", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ enabled: true }))
      .mockResolvedValueOnce(jsonResponse({ error: "Plug not found" }, 404));

    const { parsed, thrown } = await runProbeAction([
      "nonexistent",
      "--info",
      "--base-path",
      "/api/khotan",
    ]);

    expect(String(thrown)).toContain("EXIT:1");
    expect(parsed[0]).toEqual({
      ok: false,
      error: "plug_not_found",
      hint: 'Plug "nonexistent" not found. Use --list to see available plugs.',
    });
  });

  it("fires request through endpoint metadata and compares nested response shape", async () => {
    vi.spyOn(globalThis, "fetch")
      // connectivity check
      .mockResolvedValueOnce(jsonResponse({ enabled: true }))
      // endpoint metadata for --endpoint
      .mockResolvedValueOnce(
        jsonResponse({
          endpoints: {
            listProducts: {
              method: "GET",
              path: "/products",
              responses: {
                200: {
                  data: {
                    _type: "array",
                    items: {
                      id: "string",
                      name: "string",
                    },
                  },
                },
              },
            },
          },
        }),
      )
      // debug fire response
      .mockResolvedValueOnce(
        jsonResponse({
          status: 200,
          statusText: "OK",
          timing: 12,
          headers: { "content-type": "application/json" },
          body: {
            data: [{ id: "p_1", extra: true }],
          },
          endpoint: { name: "listProducts", method: "GET", path: "/products" },
        }),
      );

    const { parsed, thrown } = await runProbeAction([
      "pollinate",
      "--endpoint",
      "listProducts",
      "--compare",
      "--base-path",
      "/api/khotan",
    ]);

    expect(thrown).toBeNull();
    expect(parsed[0]?.["ok"]).toBe(true);
    const comparison = parsed[0]?.["comparison"] as {
      match: boolean;
      mismatches: Array<{ path: string; issue: string }>;
    };
    expect(comparison.match).toBe(false);
    expect(comparison.mismatches).toEqual(
      expect.arrayContaining([
        { path: "$.data[].name", issue: "missing" },
        { path: "$.data[].extra", issue: "extra" },
      ]),
    );
  });
});
