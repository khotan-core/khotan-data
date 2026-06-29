export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean | number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown, attempt: number) => boolean | Promise<boolean>;
  onRetry?: (event: {
    error: unknown;
    attempt: number;
    nextDelayMs: number;
  }) => void | Promise<void>;
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) {
    throw new DOMException("Retry aborted", "AbortError");
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Retry aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function retry<T>(
  operation: (attempt: number) => Promise<T> | T,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 3));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 10_000);
  const factor = Math.max(1, options.factor ?? 2);

  let attempt = 0;
  for (;;) {
    if (options.signal?.aborted) {
      throw new DOMException("Retry aborted", "AbortError");
    }

    attempt++;
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= attempts) throw error;
      const shouldRetry = options.shouldRetry
        ? await options.shouldRetry(error, attempt)
        : true;
      if (!shouldRetry) throw error;

      const delayOptions: {
        attempt: number;
        baseDelayMs: number;
        maxDelayMs: number;
        factor: number;
        jitter?: boolean | number;
      } = {
        attempt,
        baseDelayMs,
        maxDelayMs,
        factor,
      };
      if (options.jitter !== undefined) delayOptions.jitter = options.jitter;
      const nextDelayMs = computeRetryDelayMs(delayOptions);
      await options.onRetry?.({ error, attempt, nextDelayMs });
      await sleep(nextDelayMs, options.signal);
    }
  }
}

export function computeRetryDelayMs(options: {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  factor: number;
  jitter?: boolean | number;
}): number {
  const exponential = Math.min(
    options.maxDelayMs,
    options.baseDelayMs * options.factor ** Math.max(options.attempt - 1, 0),
  );
  if (!options.jitter) return exponential;

  const jitterRatio =
    typeof options.jitter === "number"
      ? Math.min(Math.max(options.jitter, 0), 1)
      : 0.2;
  const spread = exponential * jitterRatio;
  const min = Math.max(0, exponential - spread);
  const max = Math.min(options.maxDelayMs, exponential + spread);
  return Math.round(min + Math.random() * (max - min));
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto
    ?.subtle;
  if (!subtle) {
    throw new Error(
      "SHA-256 dedup keys require Web Crypto. Use a runtime with globalThis.crypto.subtle.",
    );
  }

  const bytes = new TextEncoder().encode(input);
  const digest = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createDedupKey(
  value: unknown,
  options: { prefix?: string } = {},
): Promise<string> {
  const hash = await sha256Hex(stableStringify(value));
  return options.prefix ? `${options.prefix}:${hash}` : hash;
}
