// ---------------------------------------------------------------------------
// Encryption — AES-256-GCM for var store
// ---------------------------------------------------------------------------

async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoded = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptVars(
  plaintext: string,
  secret: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret);
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToHex(combined);
}

export async function decryptVars(
  encrypted: string,
  secret: string,
): Promise<string> {
  const combined = hexToBytes(encrypted);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const key = await deriveKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface VerifyHmacSha256Options {
  digest?: "base64" | "hex";
  prefix?: string;
}

export async function verifyHmacSha256(
  body: string | ArrayBuffer | Uint8Array,
  header: string | readonly string[] | null | undefined,
  secret: string,
  options: VerifyHmacSha256Options = {},
): Promise<boolean> {
  if (!header || !secret) return false;

  const digest = options.digest ?? "hex";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, toBodyBuffer(body)),
  );
  const expected =
    digest === "base64" ? bytesToBase64(signature) : bytesToHex(signature);

  const headerValues: readonly string[] =
    typeof header === "string" ? [header] : header;
  const candidates = headerValues
    .flatMap((value) => value.split(","))
    .map((value) => normalizeSignature(value, options.prefix))
    .filter((value) => value.length > 0);

  return candidates.some((candidate) => timingSafeEqual(candidate, expected));
}

function toBodyBytes(body: string | ArrayBuffer | Uint8Array): Uint8Array {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  return new Uint8Array(body);
}

function toBodyBuffer(body: string | ArrayBuffer | Uint8Array): ArrayBuffer {
  if (body instanceof ArrayBuffer) return body;
  const bytes = toBodyBytes(body);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function normalizeSignature(value: string, prefix?: string): string {
  const trimmed = value.trim();
  if (prefix && trimmed.startsWith(prefix)) {
    return trimmed.slice(prefix.length).trim();
  }
  return trimmed;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}
