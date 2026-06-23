import { Command } from "commander";
import { inferShape, diffSchemas, type SerializedSchema } from "../compare.js";
import { varsCommand } from "./plug-vars.js";
import { cliFetch, unauthorizedHint } from "../cli-auth.js";
import { output, fail, resolvePort, checkConnectivity } from "../cli-api.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)}b`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
}

/**
 * Try to parse a string as JSON. Returns parsed value or the original string.
 */
function tryParseJson(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Check debug route connectivity — only used for operations that actually
 * need the debug endpoint (--info, --endpoint, --compare, and firing requests).
 */
async function checkDebugConnectivity(baseUrl: string): Promise<void> {
  let res: Response;
  try {
    res = await cliFetch(`${baseUrl}/debug`);
  } catch {
    fail(
      "connect_failed",
      `Could not connect to dev server at ${baseUrl.replace("http://", "")}. Is it running?`,
    );
  }

  if (res.status === 401) fail("unauthorized", unauthorizedHint());

  if (res.status === 404) {
    fail(
      "debug_disabled",
      "Debug mode is not enabled. Set KHOTAN_DEBUG=1 in your environment and restart.",
    );
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const plugCommand = new Command("plug")
  .alias("probe")
  .description(
    "Inspect and test plugs via the running dev server's debug route",
  )
  .argument("[plugName]", "Name of the plug to probe")
  .argument("[method]", "HTTP method (GET, POST, PUT, DELETE, PATCH)")
  .argument("[path]", "Request path (e.g. /products)")
  .option("--port <port>", "Dev server port")
  .option("--base-path <path>", "API base path", "/api/khotan")
  .option("--list", "List all registered plugs")
  .option("--info", "Show plug metadata and endpoints")
  .option("--endpoint <name>", "Fire request using a named endpoint")
  .option("--compare", "Compare response against declared schema")
  .option("--body <json>", "Request body (JSON string)")
  .option("--params <json>", "Query params (JSON string)")
  .option("--headers <json>", "Extra headers (JSON string)")
  .action(
    async (
      plugName: string | undefined,
      method: string | undefined,
      reqPath: string | undefined,
      opts: {
        port?: string;
        basePath: string;
        list?: boolean;
        info?: boolean;
        endpoint?: string;
        compare?: boolean;
        body?: string;
        params?: string;
        headers?: string;
      },
    ) => {
      const port = resolvePort(opts.port);
      const baseUrl = `http://localhost:${String(port)}${opts.basePath}`;

      // --list mode: uses /plugs management route, not debug
      if (opts.list) {
        await checkConnectivity(baseUrl);
        try {
          const res = await cliFetch(`${baseUrl}/plugs`);
          if (res.status === 401) fail("unauthorized", unauthorizedHint());
          const data = (await res.json()) as
            | {
                name: string;
                baseUrl: string;
                authType: string;
                varsConfigured?: boolean;
              }[]
            | {
                plugs?: {
                  name: string;
                  baseUrl: string;
                  authType: string;
                  varsConfigured?: boolean;
                }[];
              };
          const raw = Array.isArray(data) ? data : (data.plugs ?? []);
          const plugs = raw.map((p) => ({
            name: p.name,
            baseUrl: p.baseUrl,
            authType: p.authType,
            varsConfigured: p.varsConfigured ?? false,
          }));
          output({ ok: true, plugs });
        } catch (e) {
          fail("fetch_failed", `Failed to fetch plug list: ${String(e)}`);
        }
        return;
      }

      // All other modes need a plug name
      if (!plugName) {
        fail(
          "missing_plug",
          "Usage: khotan plug <plugName> [METHOD] [path] [flags]. Use --list to see available plugs.",
        );
      }

      // --info mode: uses debug route
      if (opts.info) {
        await checkDebugConnectivity(baseUrl);
        try {
          const res = await cliFetch(`${baseUrl}/debug/${plugName}`);
          if (res.status === 401) fail("unauthorized", unauthorizedHint());
          if (res.status === 404) {
            fail(
              "plug_not_found",
              `Plug "${plugName}" not found. Use --list to see available plugs.`,
            );
          }
          const data = (await res.json()) as Record<string, unknown>;
          output({ ok: true, plug: data });
        } catch (e) {
          fail("fetch_failed", `Failed to fetch plug info: ${String(e)}`);
        }
        return;
      }

      // All remaining operations need the debug route
      await checkDebugConnectivity(baseUrl);

      // Resolve method + path from --endpoint or positional args
      let resolvedMethod = method?.toUpperCase();
      let resolvedPath = reqPath;
      let allEndpoints: Record<string, Record<string, unknown>> | null = null;

      if (opts.endpoint) {
        try {
          const res = await cliFetch(`${baseUrl}/debug/${plugName}`);
          if (res.status === 401) fail("unauthorized", unauthorizedHint());
          if (res.status === 404) {
            fail(
              "plug_not_found",
              `Plug "${plugName}" not found. Use --list to see available plugs.`,
            );
          }
          const data = (await res.json()) as {
            endpoints?: Record<string, Record<string, unknown>>;
          };
          allEndpoints = data.endpoints ?? null;
          if (!allEndpoints?.[opts.endpoint]) {
            fail(
              "endpoint_not_found",
              `Endpoint "${opts.endpoint}" not found on plug "${plugName}". Use --info to see available endpoints.`,
            );
          }
          const endpointMeta = allEndpoints[opts.endpoint]!;
          resolvedMethod = (endpointMeta["method"] as string).toUpperCase();
          resolvedPath = endpointMeta["path"] as string;
        } catch (e) {
          if ((e as { code?: string }).code === "ECONNREFUSED") {
            fail("connect_failed", `Could not connect to dev server.`);
          }
          throw e;
        }
      }

      if (!resolvedMethod || !resolvedPath) {
        fail(
          "missing_args",
          "Provide METHOD and path, or use --endpoint <name>. Example: khotan plug myPlug GET /items",
        );
      }

      // Parse optional body/params/headers
      let body: unknown = undefined;
      if (opts.body) {
        try {
          body = JSON.parse(opts.body);
        } catch {
          fail("invalid_json", "Could not parse --body as JSON.");
        }
      }

      let params: Record<string, string> | undefined;
      if (opts.params) {
        try {
          params = JSON.parse(opts.params) as Record<string, string>;
        } catch {
          fail("invalid_json", "Could not parse --params as JSON.");
        }
      }

      let extraHeaders: Record<string, string> | undefined;
      if (opts.headers) {
        try {
          extraHeaders = JSON.parse(opts.headers) as Record<string, string>;
        } catch {
          fail("invalid_json", "Could not parse --headers as JSON.");
        }
      }

      // Fire the request through the debug route
      const debugPayload: Record<string, unknown> = {
        method: resolvedMethod,
        path: resolvedPath,
      };
      if (body !== undefined) debugPayload["body"] = body;
      if (params) debugPayload["params"] = params;
      if (extraHeaders) debugPayload["headers"] = extraHeaders;

      let debugRes: Response;
      try {
        debugRes = await cliFetch(`${baseUrl}/debug/${plugName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(debugPayload),
        });
      } catch (e) {
        fail("request_failed", `Failed to fire request: ${String(e)}`);
      }

      if (debugRes.status === 401) fail("unauthorized", unauthorizedHint());

      const debugData = (await debugRes.json()) as Record<string, unknown>;

      // The debug route returns { status, statusText, headers, body, timing, endpoint?, error? }
      const rawBody = tryParseJson(debugData["body"]);
      const responseBodyStr = JSON.stringify(rawBody);
      const size = formatSize(new TextEncoder().encode(responseBodyStr).length);

      // Resolve matched endpoint — the debug route returns `endpoint: { name, method, path }`
      const debugEndpoint = debugData["endpoint"] as
        | { name: string; method: string; path: string }
        | undefined;
      const matchedEndpointName = debugEndpoint?.name ?? opts.endpoint ?? null;

      const responseStatus =
        (debugData["status"] as number | undefined) ?? debugRes.status;
      const isError = responseStatus >= 400;

      const result: Record<string, unknown> = {
        ok: true,
        request: {
          method: resolvedMethod,
          path: resolvedPath,
          params: params ?? null,
          body: body ?? null,
        },
        response: {
          status: responseStatus,
          statusText:
            (debugData["statusText"] as string | undefined) ??
            debugRes.statusText,
          timing: debugData["timing"] ?? null,
          size,
          headers: debugData["headers"] ?? null,
          body: rawBody,
        },
        matchedEndpoint: matchedEndpointName,
      };

      if (isError && debugData["error"]) {
        (result["response"] as Record<string, unknown>)["error"] =
          debugData["error"];
      }

      // --compare mode
      if (opts.compare) {
        if (!matchedEndpointName) {
          result["comparison"] = null;
          result["comparisonNote"] =
            "No typed endpoint matched this request. Define endpoints on your plug to enable comparison.";
        } else if (isError) {
          result["comparison"] = null;
          result["comparisonNote"] =
            `Response status ${String(responseStatus)} — comparison skipped (schemas describe success responses).`;
        } else {
          // Fetch endpoint metadata if we don't have it yet
          if (!allEndpoints) {
            try {
              const metaRes = await cliFetch(`${baseUrl}/debug/${plugName}`);
              if (metaRes.status === 401)
                fail("unauthorized", unauthorizedHint());
              const metaData = (await metaRes.json()) as {
                endpoints?: Record<string, Record<string, unknown>>;
              };
              allEndpoints = metaData.endpoints ?? null;
            } catch {
              // best effort
            }
          }

          const ep = allEndpoints?.[matchedEndpointName];
          const responses = ep?.["responses"] as
            | Record<string, SerializedSchema>
            | undefined;
          const responseSchema = responses?.["200"] ?? null;

          if (!responseSchema) {
            result["comparison"] = null;
            result["comparisonNote"] =
              "No response schema defined for this endpoint";
          } else {
            const actualShape = inferShape(rawBody);
            const mismatches = diffSchemas(responseSchema, actualShape);
            result["comparison"] = {
              match: mismatches.length === 0,
              expected: responseSchema,
              actual: actualShape,
              mismatches,
            };
          }
        }
      }

      output(result);
    },
  );

plugCommand.addCommand(varsCommand);

export const probeCommand = plugCommand;
