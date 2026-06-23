import { Command } from "commander";
import {
  output,
  fail,
  resolveBaseUrl,
  checkConnectivity,
  fetchJson,
  parseJsonOption,
} from "../cli-api.js";

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
    .description("Start a tracked flow run for a variant (run mode)")
    .argument("<flowNameOrId>", "Flow name or ID")
    .argument(
      "[variant]",
      "Variant to run (e.g. delta, full, healthcheck). Defaults to 'default'.",
    )
    .option("--plug <plugName>", "Disambiguate by plug name")
    .option(
      "--variant <name>",
      "Named variant to run (alternative to the positional argument)",
    )
    .option(
      "--run-type <type>",
      "[deprecated] Alias for --variant; use a variant instead",
    )
    .option("--body <json>", "JSON body passed to the flow context"),
).action(
  async (
    flowNameOrId: string,
    variantArg: string | undefined,
    opts: ApiOptions & {
      plug?: string;
      runType?: string;
      variant?: string;
      body?: string;
    },
  ) => {
    const baseUrl = resolveBaseUrl(opts);
    await checkConnectivity(baseUrl);
    const flow = resolveFlow(await listFlows(baseUrl), flowNameOrId, opts.plug);

    // Variant resolution priority: positional arg > --variant > deprecated
    // --run-type. When none is given the server falls back to "default".
    const variant = variantArg ?? opts.variant;
    const requestBody: Record<string, unknown> = {};
    if (variant !== undefined) {
      requestBody["variant"] = variant;
    } else if (opts.runType !== undefined) {
      requestBody["runType"] = opts.runType;
    }

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
