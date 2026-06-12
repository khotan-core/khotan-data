import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";

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
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };

  if (!res.ok) {
    fail(
      "request_failed",
      data.error ?? `Request to ${url} failed with status ${res.status}`,
    );
  }

  return data;
}

async function checkConnectivity(baseUrl: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/flows`);
    if (!res.ok) {
      fail(
        "api_unavailable",
        `Could not reach Khotan flows API at ${baseUrl}. Check your base path and dev server.`,
      );
    }
  } catch {
    fail(
      "connect_failed",
      `Could not connect to dev server at ${baseUrl.replace("http://", "")}. Is it running?`,
    );
  }
}

function parseJsonOption(value: string | undefined, label: string): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    fail("invalid_json", `${label} must be valid JSON.`);
  }
}

interface FlowRecord {
  id: string;
  name: string;
  type: string;
  plugName?: string | null;
  enabled?: boolean;
  schedule?: string | null;
  resourceId?: string | null;
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ApiOptions {
  port?: string;
  basePath: string;
}

async function listFlows(baseUrl: string): Promise<FlowRecord[]> {
  const data = await fetchJson<FlowRecord[] | { flows?: FlowRecord[] }>(
    `${baseUrl}/flows`,
  );
  return Array.isArray(data) ? data : (data.flows ?? []);
}

function resolveFlow(
  flows: FlowRecord[],
  flowNameOrId: string,
  plugName?: string,
): FlowRecord {
  const byId = flows.find((flow) => flow.id === flowNameOrId);
  if (byId) {
    if (plugName && byId.plugName !== plugName) {
      fail(
        "flow_not_found",
        `Flow ID "${flowNameOrId}" is not registered on plug "${plugName}".`,
      );
    }
    return byId;
  }

  const matches = flows.filter(
    (flow) =>
      flow.name === flowNameOrId && (!plugName || flow.plugName === plugName),
  );

  if (matches.length === 0) {
    const suffix = plugName ? ` on plug "${plugName}"` : "";
    fail("flow_not_found", `Flow "${flowNameOrId}"${suffix} not found.`);
  }

  if (matches.length > 1) {
    const plugs = matches
      .map((flow) => flow.plugName)
      .filter(Boolean)
      .join(", ");
    fail(
      "ambiguous_flow",
      `Flow "${flowNameOrId}" is registered on multiple plugs (${plugs}). Pass --plug <plugName>.`,
    );
  }

  return matches[0]!;
}

function withApiOptions(command: Command): Command {
  return command
    .option("--port <port>", "Dev server port")
    .option("--base-path <path>", "API base path", "/api/khotan");
}

export const flowsCommand = new Command("flows")
  .alias("flow")
  .description("List, trigger, and inspect flows via the running Khotan API");

withApiOptions(
  flowsCommand
    .command("list")
    .description("List registered flows")
    .option("--plug <plugName>", "Only show flows for one plug"),
).action(async (opts: ApiOptions & { plug?: string }) => {
  const baseUrl = resolveBaseUrl(opts);
  await checkConnectivity(baseUrl);
  const flows = (await listFlows(baseUrl)).filter(
    (flow) => !opts.plug || flow.plugName === opts.plug,
  );
  output({ ok: true, flows });
});

withApiOptions(
  flowsCommand
    .command("info")
    .description("Show one flow by name or ID")
    .argument("<flowNameOrId>", "Flow name or ID")
    .option("--plug <plugName>", "Disambiguate by plug name"),
).action(async (flowNameOrId: string, opts: ApiOptions & { plug?: string }) => {
  const baseUrl = resolveBaseUrl(opts);
  await checkConnectivity(baseUrl);
  const flow = resolveFlow(await listFlows(baseUrl), flowNameOrId, opts.plug);
  output({ ok: true, flow });
});

withApiOptions(
  flowsCommand
    .command("trigger")
    .description("Start a tracked flow run")
    .argument("<flowNameOrId>", "Flow name or ID")
    .option("--plug <plugName>", "Disambiguate by plug name")
    .option(
      "--run-type <type>",
      "Run type: full, delta, backfill, reconcile, dry-run",
      "full",
    )
    .option("--body <json>", "JSON body passed to the flow context"),
).action(
  async (
    flowNameOrId: string,
    opts: ApiOptions & { plug?: string; runType: string; body?: string },
  ) => {
    const baseUrl = resolveBaseUrl(opts);
    await checkConnectivity(baseUrl);
    const flow = resolveFlow(await listFlows(baseUrl), flowNameOrId, opts.plug);
    const requestBody: Record<string, unknown> = { runType: opts.runType };
    const body = parseJsonOption(opts.body, "--body");
    if (body !== undefined) requestBody["body"] = body;

    const run = await fetchJson<Record<string, unknown>>(
      `${baseUrl}/flows/${encodeURIComponent(flow.id)}/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      },
    );

    output({ ok: true, action: "trigger", flow, run });
  },
);

withApiOptions(
  flowsCommand
    .command("runs")
    .description("List runs for one flow")
    .argument("<flowNameOrId>", "Flow name or ID")
    .option("--plug <plugName>", "Disambiguate by plug name"),
).action(async (flowNameOrId: string, opts: ApiOptions & { plug?: string }) => {
  const baseUrl = resolveBaseUrl(opts);
  await checkConnectivity(baseUrl);
  const flow = resolveFlow(await listFlows(baseUrl), flowNameOrId, opts.plug);
  const runs = await fetchJson<Record<string, unknown>[]>(
    `${baseUrl}/flows/${encodeURIComponent(flow.id)}/runs`,
  );
  output({ ok: true, flow, runs });
});

withApiOptions(
  flowsCommand
    .command("cancel")
    .description("Cancel a running Workflow-backed Khotan run")
    .argument("<runId>", "Khotan run ID"),
).action(async (runId: string, opts: ApiOptions) => {
  const baseUrl = resolveBaseUrl(opts);
  await checkConnectivity(baseUrl);
  const run = await fetchJson<Record<string, unknown>>(
    `${baseUrl}/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST" },
  );
  output({ ok: true, action: "cancel", run });
});
