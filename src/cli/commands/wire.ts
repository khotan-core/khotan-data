import { Command } from "commander";
import { cliFetch } from "../cli-auth.js";
import {
  output,
  fail,
  resolvePort,
  checkConnectivity,
  resolveWebhookOrigin,
} from "../cli-api.js";

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
    "Inspect, connect, renew, and disconnect wires via the running Khotan API",
  )
  .argument("[plugName]", "Name of the plug whose wire you want to manage")
  .argument("[action]", "Action: info | connect | renew | disconnect")
  .option("--port <port>", "Dev server port")
  .option("--base-path <path>", "API base path", "/api/khotan")
  .option("--json", "Output JSON (default)")
  .option(
    "--list",
    "List configured plugs and whether they currently have a wire",
  )
  .option("--info", "Show current wire state for the plug")
  .option("--callback-url <url>", "Explicit callback URL to register")
  .option("--webhook-origin <url>", "Origin used to build default callback URL")
  .option(
    "--wire-id <id>",
    "Explicit wire ID for renew/disconnect (otherwise current wire is used)",
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
      const baseUrl = `http://localhost:${String(port)}${opts.basePath}`;

      await checkConnectivity(baseUrl);

      if (opts.list) {
        const plugsRes = await cliFetch(`${baseUrl}/plugs`);
        const plugs = (await plugsRes.json()) as { name: string }[];
        const wires = await Promise.all(
          plugs.map(async (plug) => {
            const res = await cliFetch(`${baseUrl}/wires/${plug.name}`);
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
          "Usage: khotan wire <plugName> [info|connect|renew|disconnect] or khotan wire --list",
        );
      }

      const resolvedAction = opts.info ? "info" : (action ?? "info");

      if (resolvedAction === "info") {
        const res = await cliFetch(`${baseUrl}/wires/${plugName}`);
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
        const res = await cliFetch(`${baseUrl}/wires/${plugName}`, {
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
          const currentRes = await cliFetch(`${baseUrl}/wires/${plugName}`);
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
        const res = await cliFetch(`${baseUrl}/wires/${plugName}`, {
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

      if (resolvedAction === "renew") {
        const res = await cliFetch(`${baseUrl}/wires/${plugName}/renew`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(opts.wireId ? { wireId: opts.wireId } : {}),
        });
        const data = (await res.json()) as {
          wire?: WireRecord;
          error?: string;
        };
        if (!res.ok) {
          fail(
            "renew_failed",
            data.error ?? `Failed to renew wire for "${plugName}"`,
          );
        }
        output({
          ok: true,
          action: "renew",
          plugName,
          wire: data.wire ?? null,
        });
        return;
      }

      fail(
        "invalid_action",
        `Unknown action "${resolvedAction}". Use info, connect, renew, disconnect, or --list.`,
      );
    },
  );
