import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { cliFetch, unauthorizedHint } from "../cli-auth.js";

function output(obj: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

function fail(error: string, hint: string): never {
  output({ ok: false, error, hint });
  process.exit(1);
}

function parseEnvFile(filePath: string): Record<string, string> {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const values: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?$/.exec(trimmed);
      if (match) values[match[1]!] = match[2]!;
    }
    return values;
  } catch {
    return {};
  }
}

function parsePortFromEnvFile(filePath: string): number | null {
  const raw = parseEnvFile(filePath)["PORT"];
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolvePort(portFlag: string | undefined): number {
  if (portFlag) return parseInt(portFlag, 10);
  const cwd = process.cwd();
  return (
    parsePortFromEnvFile(path.join(cwd, ".env.local")) ??
    parsePortFromEnvFile(path.join(cwd, ".env")) ??
    3000
  );
}

function resolveBaseUrl(opts: { port?: string; basePath: string }): string {
  return `http://localhost:${resolvePort(opts.port)}${opts.basePath}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await cliFetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };

  if (!res.ok) {
    if (res.status === 401) fail("unauthorized", unauthorizedHint());
    fail(
      "request_failed",
      data.error ?? `Request to ${url} failed with status ${res.status}`,
    );
  }

  return data;
}

async function checkConnectivity(baseUrl: string): Promise<void> {
  let res: Response;
  try {
    res = await cliFetch(`${baseUrl}/flows`);
  } catch {
    fail(
      "connect_failed",
      `Could not connect to dev server at ${baseUrl.replace("http://", "")}. Is it running?`,
    );
  }
  if (res.status === 401) fail("unauthorized", unauthorizedHint());
  if (!res.ok) {
    fail(
      "api_unavailable",
      `Could not reach Khotan flows API at ${baseUrl}. Check your base path and dev server.`,
    );
  }
}

function parseJsonObjectOption(
  value: string | undefined,
  label: string,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail("invalid_json", `${label} must be a JSON object.`);
    }
    return parsed as Record<string, unknown>;
  } catch {
    fail("invalid_json", `${label} must be valid JSON.`);
  }
}

interface ApiOptions {
  port?: string;
  basePath: string;
}

interface ResourceRecord {
  id: string;
  name: string;
  description?: string | null;
  mapping: {
    connectField: string | string[];
  };
}

function withApiOptions(command: Command): Command {
  return command
    .option("--port <port>", "Dev server port")
    .option("--base-path <path>", "API base path", "/api/khotan");
}

async function listResources(baseUrl: string): Promise<ResourceRecord[]> {
  return fetchJson<ResourceRecord[]>(`${baseUrl}/resources`);
}

async function resolveResource(
  baseUrl: string,
  resourceNameOrId: string,
): Promise<ResourceRecord> {
  const resources = await listResources(baseUrl);
  const match = resources.find(
    (resource) =>
      resource.id === resourceNameOrId || resource.name === resourceNameOrId,
  );
  if (!match) {
    fail(
      "resource_not_found",
      `Resource "${resourceNameOrId}" is not registered in the running Khotan config.`,
    );
  }
  return match;
}

export const mappingsCommand = new Command("mappings")
  .description("List, lookup, and mutate mappings via the running Khotan API");

withApiOptions(
  mappingsCommand
    .command("list")
    .description("List mappings for one resource")
    .argument("<resource>", "Resource name or ID")
    .option("--limit <limit>", "Page size", "20")
    .option("--offset <offset>", "Page offset", "0")
    .option("--search <term>", "Search connectValue, refs, and metadata"),
).action(
  async (
    resourceNameOrId: string,
    opts: ApiOptions & { limit: string; offset: string; search?: string },
  ) => {
    const baseUrl = resolveBaseUrl(opts);
    await checkConnectivity(baseUrl);
    const resource = await resolveResource(baseUrl, resourceNameOrId);
    const limit = Math.max(parseInt(opts.limit, 10) || 20, 1);
    const offset = Math.max(parseInt(opts.offset, 10) || 0, 0);
    const url = new URL(
      `${baseUrl}/resources/${encodeURIComponent(resource.id)}/mappings`,
    );
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    if (opts.search) {
      url.searchParams.set("search", opts.search);
    }

    const data = await fetchJson<{
      items: Record<string, unknown>[];
      page: Record<string, unknown>;
    }>(url.toString());

    output({
      ok: true,
      resource,
      items: data.items,
      page: data.page,
    });
  },
);

withApiOptions(
  mappingsCommand
    .command("lookup")
    .description("Lookup a mapping by connect value or plug ref")
    .argument("<resource>", "Resource name or ID")
    .option("--connect-value <value>", "Lookup by canonical connect value")
    .option("--plug <plugName>", "Lookup by plug name")
    .option("--ref <ref>", "Lookup by plug ref"),
).action(
  async (
    resourceNameOrId: string,
    opts: ApiOptions & {
      connectValue?: string;
      plug?: string;
      ref?: string;
    },
  ) => {
    const usingConnectValue = typeof opts.connectValue === "string";
    const usingPlugRef = typeof opts.plug === "string" || typeof opts.ref === "string";

    if (!usingConnectValue && !usingPlugRef) {
      fail(
        "validation_error",
        "Pass either --connect-value <value> or --plug <plugName> with --ref <ref>.",
      );
    }
    if (usingConnectValue && usingPlugRef) {
      fail(
        "validation_error",
        "Choose one lookup mode: either --connect-value or --plug with --ref.",
      );
    }
    if ((opts.plug && !opts.ref) || (!opts.plug && opts.ref)) {
      fail(
        "validation_error",
        "Plug-ref lookup requires both --plug <plugName> and --ref <ref>.",
      );
    }

    const baseUrl = resolveBaseUrl(opts);
    await checkConnectivity(baseUrl);
    const resource = await resolveResource(baseUrl, resourceNameOrId);
    const payload = usingConnectValue
      ? {
          resourceId: resource.id,
          connectValue: opts.connectValue,
        }
      : {
          resourceId: resource.id,
          plugName: opts.plug,
          ref: opts.ref,
        };

    const mapping = await fetchJson<Record<string, unknown>>(
      `${baseUrl}/mappings/lookup`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    output({ ok: true, resource, mapping });
  },
);

withApiOptions(
  mappingsCommand
    .command("upsert")
    .description("Create or update one mapping by canonical connect value")
    .argument("<resource>", "Resource name or ID")
    .requiredOption("--connect-value <value>", "Canonical connect value")
    .requiredOption("--refs <json>", "JSON object of refs keyed by plug name")
    .option("--metadata <json>", "Optional JSON object of contextual metadata"),
).action(
  async (
    resourceNameOrId: string,
    opts: ApiOptions & {
      connectValue: string;
      refs: string;
      metadata?: string;
    },
  ) => {
    const baseUrl = resolveBaseUrl(opts);
    await checkConnectivity(baseUrl);
    const resource = await resolveResource(baseUrl, resourceNameOrId);
    const refs = parseJsonObjectOption(opts.refs, "--refs");
    const metadata = parseJsonObjectOption(opts.metadata, "--metadata");
    const mapping = await fetchJson<Record<string, unknown>>(`${baseUrl}/mappings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceId: resource.id,
        connectValue: opts.connectValue,
        refs,
        metadata,
      }),
    });

    output({ ok: true, action: "upsert", resource, mapping });
  },
);

withApiOptions(
  mappingsCommand
    .command("update")
    .description("Update one mapping by row ID")
    .argument("<mappingId>", "Mapping row ID")
    .requiredOption("--resource <resource>", "Resource name or ID")
    .requiredOption("--connect-value <value>", "Canonical connect value")
    .requiredOption("--refs <json>", "JSON object of refs keyed by plug name")
    .option("--metadata <json>", "Optional JSON object of contextual metadata"),
).action(
  async (
    mappingId: string,
    opts: ApiOptions & {
      resource: string;
      connectValue: string;
      refs: string;
      metadata?: string;
    },
  ) => {
    const baseUrl = resolveBaseUrl(opts);
    await checkConnectivity(baseUrl);
    const resource = await resolveResource(baseUrl, opts.resource);
    const refs = parseJsonObjectOption(opts.refs, "--refs");
    const metadata = parseJsonObjectOption(opts.metadata, "--metadata");
    const mapping = await fetchJson<Record<string, unknown>>(
      `${baseUrl}/mappings/${encodeURIComponent(mappingId)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceId: resource.id,
          connectValue: opts.connectValue,
          refs,
          metadata,
        }),
      },
    );

    output({ ok: true, action: "update", resource, mapping });
  },
);

withApiOptions(
  mappingsCommand
    .command("delete")
    .description("Delete one mapping by row ID")
    .argument("<mappingId>", "Mapping row ID"),
).action(async (mappingId: string, opts: ApiOptions) => {
  const baseUrl = resolveBaseUrl(opts);
  await checkConnectivity(baseUrl);
  const res = await cliFetch(
    `${baseUrl}/mappings/${encodeURIComponent(mappingId)}`,
    {
      method: "DELETE",
    },
  );

  if (!res.ok) {
    if (res.status === 401) fail("unauthorized", unauthorizedHint());
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    fail(
      "request_failed",
      data.error ??
        `Delete request failed for mapping "${mappingId}" with status ${res.status}.`,
    );
  }

  output({ ok: true, action: "delete", id: mappingId });
});
