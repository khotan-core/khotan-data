import fs from "node:fs";
import path from "node:path";
import { cliFetch, unauthorizedHint } from "./cli-auth.js";

// ---------------------------------------------------------------------------
// Structured JSON output helpers
// ---------------------------------------------------------------------------

export function output(obj: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

export function fail(error: string, hint: string): never {
  output({ ok: false, error, hint });
  process.exit(1);
}

// ---------------------------------------------------------------------------
// .env parsing — handles `export`, inline comments, values with `=` and `#`
// ---------------------------------------------------------------------------

export function parseEnvFile(filePath: string): Record<string, string> {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const values: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      // Strip optional `export ` prefix
      const stripped = trimmed.replace(/^export\s+/, "");

      // Match KEY=VALUE with optional quoting
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(stripped);
      if (!match) continue;

      const key = match[1]!;
      let value = match[2]!;

      // Handle quoted values (preserve everything inside quotes)
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

      values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
}

/**
 * Load a dotenv-style file into process.env for the current CLI invocation.
 * Explicit CLI env files intentionally override existing process values so a
 * project-scoped command can pin the exact customer/org context it should use.
 */
export function loadEnvFileIntoProcess(
  filePath: string,
  opts: { cwd?: string } = {},
): string {
  const resolved = path.resolve(opts.cwd ?? process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    fail("env_file_not_found", `Env file not found: ${resolved}`);
  }

  const values = parseEnvFile(resolved);
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Port resolution
// ---------------------------------------------------------------------------

export function parsePortFromEnvFile(filePath: string): number | null {
  const raw = parseEnvFile(filePath)["PORT"];
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolvePort(portFlag: string | undefined): number {
  if (portFlag) return parseInt(portFlag, 10);
  const cwd = process.cwd();
  return (
    parsePortFromEnvFile(path.join(cwd, ".env.local")) ??
    parsePortFromEnvFile(path.join(cwd, ".env")) ??
    3000
  );
}

// ---------------------------------------------------------------------------
// Base URL resolution
// ---------------------------------------------------------------------------

export function resolveBaseUrl(opts: {
  port?: string;
  basePath: string;
}): string {
  return `http://localhost:${String(resolvePort(opts.port))}${opts.basePath}`;
}

// ---------------------------------------------------------------------------
// Connectivity check — probes the /plugs management route (not debug-gated)
// ---------------------------------------------------------------------------

export async function checkConnectivity(baseUrl: string): Promise<void> {
  let res: Response;
  try {
    res = await cliFetch(`${baseUrl}/plugs`);
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
      `Could not reach Khotan API at ${baseUrl}. Check your base path and dev server.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Typed JSON fetch with auth + error handling
// ---------------------------------------------------------------------------

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await cliFetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };

  if (!res.ok) {
    if (res.status === 401) fail("unauthorized", unauthorizedHint());
    fail(
      "request_failed",
      data.error ??
        `Request to ${url} failed with status ${String(res.status)}`,
    );
  }

  return data;
}

// ---------------------------------------------------------------------------
// JSON option parsing for CLI flags
// ---------------------------------------------------------------------------

export function parseJsonOption(
  value: string | undefined,
  label: string,
): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    fail("invalid_json", `${label} must be valid JSON.`);
  }
}

export function parseJsonObjectOption(
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

// ---------------------------------------------------------------------------
// Webhook origin resolution
// ---------------------------------------------------------------------------

export function resolveWebhookOrigin(originFlag: string | undefined): string {
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
    `http://localhost:${String(resolvePort(undefined))}`;
  return origin.replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// outputDir resolution — single source of truth
// ---------------------------------------------------------------------------

const CONFIG_OUTPUT_DIR_RE = /outputDir:\s*["']([^"']+)["']/;

/**
 * Resolve the output directory for khotan files. Order:
 *   1. Existing khotan.config.ts outputDir value
 *   2. Layout-based default: `src/khotan` (with src/app) or `khotan`
 *
 * This is the single canonical source for outputDir across init, add, and
 * generate commands.
 */
export function resolveOutputDir(projectRoot: string): string {
  const configPath = path.join(projectRoot, "khotan.config.ts");
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, "utf-8");
      const match = CONFIG_OUTPUT_DIR_RE.exec(content);
      if (match?.[1]) return match[1];
    } catch {
      // Fall through to layout-based default.
    }
  }
  if (fs.existsSync(path.join(projectRoot, "src", "app"))) {
    return "src/khotan";
  }
  if (fs.existsSync(path.join(projectRoot, "app"))) {
    return "khotan";
  }
  return "src/khotan";
}

/**
 * Load the config outputDir from an existing khotan.config.ts, using the
 * unified resolveOutputDir as the fallback.
 */
export function loadConfigOutputDir(
  projectRoot: string,
): { outputDir: string } | null {
  const configPath = path.resolve(projectRoot, "khotan.config.ts");
  if (!fs.existsSync(configPath)) return null;
  return { outputDir: resolveOutputDir(projectRoot) };
}
