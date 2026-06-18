import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Authorization scheme the khotan API accepts from the local CLI. Must match
 * `CLI_TOKEN_SCHEME` in `src/factory.ts`. Distinct from `Bearer` so it never
 * collides with a consumer's own token auth.
 */
const CLI_TOKEN_SCHEME = "KhotanCLI";

function readSecretFromEnvFile(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      // Strip optional `export ` prefix
      const stripped = trimmed.replace(/^export\s+/, "");
      const match = /^KHOTAN_SECRET\s*=\s*(.*)$/.exec(stripped);
      if (!match) continue;
      let value = match[1]!;
      // Handle quoted values (preserve everything inside quotes including = and #)
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      } else {
        // Unquoted: strip inline comments (space + #)
        const commentIdx = value.indexOf(" #");
        if (commentIdx !== -1) {
          value = value.slice(0, commentIdx);
        }
        value = value.trim();
      }
      return value || null;
    }
  } catch {
    // file missing or unreadable
  }
  return null;
}

/**
 * Resolves `KHOTAN_SECRET` from the process environment, then `.env.local`,
 * then `.env` in the current working directory. Returns null when unset.
 */
export function resolveKhotanSecret(cwd: string = process.cwd()): string | null {
  const fromEnv = process.env["KHOTAN_SECRET"]?.trim();
  if (fromEnv) return fromEnv;
  return (
    readSecretFromEnvFile(path.join(cwd, ".env.local")) ??
    readSecretFromEnvFile(path.join(cwd, ".env")) ??
    null
  );
}

/**
 * Builds the `Authorization` header value the khotan API accepts from the CLI:
 * a timestamped HMAC derived from `KHOTAN_SECRET`. The raw secret never leaves
 * the machine — only its one-way HMAC does. Returns null when no secret is
 * available, in which case the caller sends an unauthenticated request.
 */
export function cliAuthHeader(): string | null {
  const secret = resolveKhotanSecret();
  if (!secret) return null;
  const timestamp = String(Date.now());
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`khotan-cli:${timestamp}`)
    .digest("hex");
  return `${CLI_TOKEN_SCHEME} ${timestamp}.${sig}`;
}

/**
 * `fetch` wrapper that attaches the CLI auth header (when a secret is
 * available) so management routes gated by an `authorize` hook accept local
 * CLI requests. The header is recomputed per call to stay within the server's
 * freshness window.
 */
export function cliFetch(url: string, init?: RequestInit): Promise<Response> {
  const auth = cliAuthHeader();
  if (!auth) {
    // Nothing to add — preserve the original call shape exactly.
    return init === undefined ? fetch(url) : fetch(url, init);
  }
  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
    Authorization: auth,
  };
  return fetch(url, { ...init, headers });
}

/**
 * Standard hint shown when the API returns 401. Either the CLI couldn't find a
 * secret to authenticate with, or the server rejected it.
 */
export function unauthorizedHint(): string {
  return resolveKhotanSecret()
    ? "Unauthorized. The dev server rejected the CLI token — confirm KHOTAN_SECRET matches the value the server is running with."
    : "Unauthorized. Set KHOTAN_SECRET in your environment (or .env.local) so the CLI can authenticate against your authorize() hook.";
}
