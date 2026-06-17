import { bytesToHex } from "./crypto.js";
import { process } from "./debug.js";

// ---------------------------------------------------------------------------
// CLI authentication — dev-only HMAC bearer derived from KHOTAN_SECRET
// ---------------------------------------------------------------------------

/** Authorization scheme used by the khotan CLI. Distinct from `Bearer` so it
 * never collides with a consumer's own token auth in their `authorize` hook. */
export const CLI_TOKEN_SCHEME = "KhotanCLI";

/** Max clock skew between the CLI signing the token and the server verifying
 * it. Keeps a logged token from being replayable beyond a short window. */
export const CLI_TOKEN_WINDOW_MS = 60_000;

/**
 * Derives the CLI auth token: HMAC-SHA256 over the timestamp, keyed by the
 * KHOTAN_SECRET. One-way, so the raw secret (the encryption key) never travels
 * over the wire — even a token captured from a dev log can't be reversed into
 * the secret. Exported so the CLI can compute the same value.
 */
export async function deriveCliToken(
  secret: string,
  timestamp: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`khotan-cli:${timestamp}`),
  );
  return bytesToHex(new Uint8Array(sig));
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifies the dev-only CLI auth token on a request.
 *
 * Returns true only when ALL of the following hold:
 * - `NODE_ENV` is not `"production"`,
 * - a `KHOTAN_SECRET` is configured,
 * - the timestamp is within {@link CLI_TOKEN_WINDOW_MS} of now, and
 * - the HMAC matches (constant-time comparison).
 */
export async function isCliRequestAuthorized(
  request: Request,
  secret: string | undefined,
): Promise<boolean> {
  if (process.env["NODE_ENV"] === "production") return false;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (!header?.startsWith(`${CLI_TOKEN_SCHEME} `)) return false;

  const token = header.slice(CLI_TOKEN_SCHEME.length + 1).trim();
  const dotIdx = token.indexOf(".");
  if (dotIdx === -1) return false;

  const timestamp = token.slice(0, dotIdx);
  const provided = token.slice(dotIdx + 1);
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > CLI_TOKEN_WINDOW_MS) return false;

  const expected = await deriveCliToken(secret, timestamp);
  return timingSafeEqualHex(provided, expected);
}
