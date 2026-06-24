import { Command } from "commander";
import { cliFetch, unauthorizedHint } from "../cli-auth.js";
import {
  output,
  fail,
  resolveBaseUrl,
  checkConnectivity,
  fetchJson,
  parseJsonObjectOption,
} from "../cli-api.js";

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
    .option("--base-path <path>", "API base path", "/api/khotan")
    .option("--json", "Output JSON (default)");
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

export const mappingsCommand = new Command("mappings").description(
  "List, lookup, and mutate mappings via the running Khotan API",
);

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
    const usingPlugRef =
      typeof opts.plug === "string" || typeof opts.ref === "string";

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
    const mapping = await fetchJson<Record<string, unknown>>(
      `${baseUrl}/mappings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceId: resource.id,
          connectValue: opts.connectValue,
          refs,
          metadata,
        }),
      },
    );

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
        `Delete request failed for mapping "${mappingId}" with status ${String(res.status)}.`,
    );
  }

  output({ ok: true, action: "delete", id: mappingId });
});
