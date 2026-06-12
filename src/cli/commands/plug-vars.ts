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
  const env = parseEnvFile(filePath);
  const raw = env["PORT"];
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

async function checkConnectivity(baseUrl: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/plugs`);
  } catch {
    fail(
      "connect_failed",
      `Could not connect to dev server at ${baseUrl.replace("http://", "")}. Is it running?`,
    );
  }
  if (!res.ok) {
    fail(
      "api_unavailable",
      `Could not reach Khotan API at ${baseUrl}. Check your base path and dev server.`,
    );
  }
}

interface VariablesResponse {
  fields: {
    key: string;
    label: string;
    type: "text" | "password" | "url";
    secret?: boolean;
    hidden?: boolean;
    required?: boolean;
    placeholder?: string;
    defaultValue?: string;
  }[];
  values: Record<string, string>;
  configured: boolean;
}

export const varsCommand = new Command("vars")
  .description("View and manage plug variables via the running Khotan API")
  .argument("[plugName]", "Name of the plug whose variables you want to manage")
  .argument("[action]", "Action: show | set | clear")
  .option("--port <port>", "Dev server port")
  .option("--base-path <path>", "API base path", "/api/khotan")
  .option("--list", "List all plugs and their variable state")
  .option("--json <json>", "Variable payload for set (JSON object)")
  .action(
    async (
      plugName: string | undefined,
      action: string | undefined,
      opts: {
        port?: string;
        basePath: string;
        list?: boolean;
        json?: string;
      },
    ) => {
      const port = resolvePort(opts.port);
      const baseUrl = `http://localhost:${port}${opts.basePath}`;

      await checkConnectivity(baseUrl);

      if (opts.list) {
        const plugsRes = await fetch(`${baseUrl}/plugs`);
        const plugs = (await plugsRes.json()) as { name: string }[];
        const variables = await Promise.all(
          plugs.map(async (plug) => {
            const res = await fetch(`${baseUrl}/variables/${plug.name}`);
            if (res.status === 404) {
              return {
                plugName: plug.name,
                configured: false,
                fields: [],
                values: {},
              };
            }
            const data = (await res.json()) as VariablesResponse;
            return {
              plugName: plug.name,
              configured: data.configured ?? false,
              fields: data.fields ?? [],
              values: data.values ?? {},
            };
          }),
        );
        output({ ok: true, variables });
        return;
      }

      if (!plugName) {
        fail(
          "missing_plug",
          "Usage: khotan plug vars <plugName> [show|set|clear] or khotan plug vars --list",
        );
      }

      const resolvedAction = action ?? "show";

      if (resolvedAction === "show") {
        const res = await fetch(`${baseUrl}/variables/${plugName}`);
        if (res.status === 404) {
          fail("plug_not_found", `Plug "${plugName}" not found.`);
        }
        const data = (await res.json()) as VariablesResponse;
        output({
          ok: true,
          plugName,
          configured: data.configured ?? false,
          fields: data.fields ?? [],
          values: data.values ?? {},
        });
        return;
      }

      if (resolvedAction === "set") {
        if (!opts.json) {
          fail(
            "missing_json",
            'Provide --json with a JSON object. Example: khotan plug vars myPlug set --json \'{"apiKey":"..."}\'',
          );
        }

        let payload: Record<string, string>;
        try {
          payload = JSON.parse(opts.json) as Record<string, string>;
        } catch {
          fail("invalid_json", "Could not parse --json as JSON.");
        }

        const res = await fetch(`${baseUrl}/variables/${plugName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          fail(
            "set_failed",
            data.error ?? `Failed to set variables for "${plugName}"`,
          );
        }
        output({ ok: true, action: "set", plugName });
        return;
      }

      if (resolvedAction === "clear") {
        const res = await fetch(`${baseUrl}/variables/${plugName}`, {
          method: "DELETE",
        });
        if (!res.ok && res.status !== 204) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          fail(
            "clear_failed",
            data.error ?? `Failed to clear variables for "${plugName}"`,
          );
        }
        output({ ok: true, action: "clear", plugName });
        return;
      }

      fail(
        "invalid_action",
        `Unknown action "${resolvedAction}". Use show, set, clear, or --list.`,
      );
    },
  );
