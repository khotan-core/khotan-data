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

function resolveWebhookOrigin(originFlag: string | undefined): string {
  if (originFlag) return originFlag.replace(/\/$/, "");
  const cwd = process.cwd();
  const env = {
    ...parseEnvFile(path.join(cwd, ".env")),
    ...parseEnvFile(path.join(cwd, ".env.local")),
  };
  const origin =
    env["KHOTAN_WEBHOOK_URL"] ??
    env["NGROK_URL"] ??
    env["NEXT_PUBLIC_APP_URL"] ??
    `http://localhost:${resolvePort(undefined)}`;
  return origin.replace(/\/$/, "");
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

interface WireRecord {
  id: string;
  plugId: string;
  remoteId: string;
  callbackUrl: string;
  eventTypes: string[];
  status: "active" | "disabled" | "pending";
  createdAt: string;
  updatedAt: string;
}

export const wireCommand = new Command("wire")
  .description(
    "Inspect, connect, and disconnect wires via the running Khotan API",
  )
  .argument("[plugName]", "Name of the plug whose wire you want to manage")
  .argument("[action]", "Action: info | connect | disconnect")
  .option("--port <port>", "Dev server port")
  .option("--base-path <path>", "API base path", "/api/khotan")
  .option(
    "--list",
    "List configured plugs and whether they currently have a wire",
  )
  .option("--info", "Show current wire state for the plug")
  .option("--callback-url <url>", "Explicit callback URL to register")
  .option("--webhook-origin <url>", "Origin used to build default callback URL")
  .option(
    "--wire-id <id>",
    "Explicit wire ID for disconnect (otherwise current wire is used)",
  )
  .action(
    async (
      plugName: string | undefined,
      action: string | undefined,
      opts: {
        port?: string;
        basePath: string;
        list?: boolean;
        info?: boolean;
        callbackUrl?: string;
        webhookOrigin?: string;
        wireId?: string;
      },
    ) => {
      const port = resolvePort(opts.port);
      const baseUrl = `http://localhost:${port}${opts.basePath}`;

      await checkConnectivity(baseUrl);

      if (opts.list) {
        const plugsRes = await fetch(`${baseUrl}/plugs`);
        const plugs = (await plugsRes.json()) as { name: string }[];
        const wires = await Promise.all(
          plugs.map(async (plug) => {
            const res = await fetch(`${baseUrl}/wires/${plug.name}`);
            const data = (await res.json()) as {
              wire?: WireRecord | null;
              configured?: boolean;
            };
            return {
              plugName: plug.name,
              configured: data.configured ?? false,
              connected: data.wire?.status === "active",
              wire: data.wire ?? null,
            };
          }),
        );
        output({ ok: true, wires });
        return;
      }

      if (!plugName) {
        fail(
          "missing_plug",
          "Usage: khotan wire <plugName> [info|connect|disconnect] or khotan wire --list",
        );
      }

      const resolvedAction = opts.info ? "info" : (action ?? "info");

      if (resolvedAction === "info") {
        const res = await fetch(`${baseUrl}/wires/${plugName}`);
        if (res.status === 404) {
          fail("plug_not_found", `Plug "${plugName}" not found.`);
        }
        const data = (await res.json()) as {
          wire?: WireRecord | null;
          configured?: boolean;
        };
        output({
          ok: true,
          plugName,
          configured: data.configured ?? false,
          wire: data.wire ?? null,
        });
        return;
      }

      if (resolvedAction === "connect") {
        const callbackUrl =
          opts.callbackUrl ??
          `${resolveWebhookOrigin(opts.webhookOrigin)}/api/khotan/webhook/${plugName}`;
        const res = await fetch(`${baseUrl}/wires/${plugName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callbackUrl }),
        });
        const data = (await res.json()) as {
          wire?: WireRecord;
          error?: string;
        };
        if (!res.ok) {
          fail(
            "connect_failed",
            data.error ?? `Failed to connect wire for "${plugName}"`,
          );
        }
        output({
          ok: true,
          action: "connect",
          plugName,
          callbackUrl,
          wire: data.wire ?? null,
        });
        return;
      }

      if (resolvedAction === "disconnect") {
        let wireId = opts.wireId;
        if (!wireId) {
          const currentRes = await fetch(`${baseUrl}/wires/${plugName}`);
          const current = (await currentRes.json()) as {
            wire?: WireRecord | null;
          };
          wireId = current.wire?.id;
        }
        if (!wireId) {
          fail(
            "missing_wire",
            `No active wire found for "${plugName}". Use --wire-id to override.`,
          );
        }
        const res = await fetch(`${baseUrl}/wires/${plugName}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wireId }),
        });
        if (!res.ok && res.status !== 204) {
          const data = (await res.json()) as { error?: string };
          fail(
            "disconnect_failed",
            data.error ?? `Failed to disconnect wire "${wireId}"`,
          );
        }
        output({ ok: true, action: "disconnect", plugName, wireId });
        return;
      }

      fail(
        "invalid_action",
        `Unknown action "${resolvedAction}". Use info, connect, disconnect, or --list.`,
      );
    },
  );
