import { createHash } from "node:crypto";
import { khotanCache } from "./types.js";
import type { CacheInstance, KhotanWorkflowContextRef } from "./types.js";

export type DeltaKey = string | number;

export interface ChangeDetectionOptions<TRecord> {
  /**
   * Project a record to the fields that should participate in change
   * detection. Defaults to the whole record.
   */
  project?: (record: TRecord) => unknown;
  /** Override hashing when an upstream source already provides a content hash. */
  hash?: (record: TRecord) => string | Promise<string>;
}

export interface ChangeDetectionResult<TRecord> {
  changed: TRecord[];
  unchanged: TRecord[];
  hashes: Record<string, string>;
}

export interface DeltaSkipResult<TRecord>
  extends ChangeDetectionResult<TRecord> {
  commit(): Promise<Record<string, string>>;
}

export interface DeltaSkipOptions<
  TRecord,
> extends ChangeDetectionOptions<TRecord> {
  /** Cache entry used inside the named cache. Defaults to "hashes". */
  cacheKey?: string;
  /**
   * Persist the new hash snapshot before returning. Defaults to true for
   * compatibility. Set false to receive a commit() function and persist only
   * after downstream writes succeed.
   */
  updateCache?: boolean;
}

export interface CursorHelper<TCursor = string> {
  cache(ctx: KhotanWorkflowContextRef): CacheInstance;
  get(ctx: KhotanWorkflowContextRef): Promise<TCursor | null>;
  set(ctx: KhotanWorkflowContextRef, cursor: TCursor): Promise<TCursor>;
  delete(ctx: KhotanWorkflowContextRef): Promise<void>;
}

function normalizeForJson(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForJson(item));
  }

  if (value && typeof value === "object") {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) {
        normalized[key] = normalizeForJson(item);
      }
    }
    return normalized;
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForJson(value));
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

/**
 * Compare incoming records against a previous key -> hash snapshot and return
 * only records whose projected content changed.
 */
export async function detectChanges<TRecord>(
  records: readonly TRecord[],
  previousHashes: Record<string, string>,
  keyFn: (record: TRecord) => DeltaKey,
  options: ChangeDetectionOptions<TRecord> = {},
): Promise<ChangeDetectionResult<TRecord>> {
  const changed: TRecord[] = [];
  const unchanged: TRecord[] = [];
  const hashes: Record<string, string> = {};

  for (const record of records) {
    const key = String(keyFn(record));
    const hash = options.hash
      ? await options.hash(record)
      : contentHash(options.project ? options.project(record) : record);
    hashes[key] = hash;

    if (previousHashes[key] === hash) {
      unchanged.push(record);
    } else {
      changed.push(record);
    }
  }

  return { changed, unchanged, hashes };
}

/**
 * Workflow-step helper for content-hash delta skipping. The cache must be
 * registered on the khotan instance and is resolved through khotanCache(ctx).
 */
export async function deltaSkip<TRecord>(
  ctx: KhotanWorkflowContextRef,
  cacheName: string,
  records: readonly TRecord[],
  keyFn: (record: TRecord) => DeltaKey,
  options: DeltaSkipOptions<TRecord> & { updateCache: false },
): Promise<DeltaSkipResult<TRecord>>;
export async function deltaSkip<TRecord>(
  ctx: KhotanWorkflowContextRef,
  cacheName: string,
  records: readonly TRecord[],
  keyFn: (record: TRecord) => DeltaKey,
  options?: DeltaSkipOptions<TRecord> & { updateCache?: true },
): Promise<TRecord[]>;
export async function deltaSkip<TRecord>(
  ctx: KhotanWorkflowContextRef,
  cacheName: string,
  records: readonly TRecord[],
  keyFn: (record: TRecord) => DeltaKey,
  options: DeltaSkipOptions<TRecord>,
): Promise<TRecord[] | DeltaSkipResult<TRecord>>;
export async function deltaSkip<TRecord>(
  ctx: KhotanWorkflowContextRef,
  cacheName: string,
  records: readonly TRecord[],
  keyFn: (record: TRecord) => DeltaKey,
  options: DeltaSkipOptions<TRecord> = {},
): Promise<TRecord[] | DeltaSkipResult<TRecord>> {
  const cache = khotanCache(ctx, cacheName);
  const cacheKey = options.cacheKey ?? "hashes";
  const previousHashes =
    (await cache.get<Record<string, string>>(cacheKey)) ?? {};
  const result = await detectChanges(records, previousHashes, keyFn, options);

  if (options.updateCache ?? true) {
    await cache.set(cacheKey, result.hashes);
    return result.changed;
  }

  return {
    ...result,
    async commit() {
      return cache.set(cacheKey, result.hashes);
    },
  };
}

/**
 * Convenience wrapper for durable cursor/checkpoint state inside workflow
 * steps. It intentionally uses khotanCache(ctx, name), so it works across the
 * workflow isolate boundary as long as the cache is registered.
 */
export function createCursorHelper<TCursor = string>(
  cacheName: string,
  key = "cursor",
): CursorHelper<TCursor> {
  return {
    cache(ctx) {
      return khotanCache(ctx, cacheName);
    },
    get(ctx) {
      return khotanCache(ctx, cacheName).get<TCursor>(key);
    },
    set(ctx, cursor) {
      return khotanCache(ctx, cacheName).set<TCursor>(key, cursor);
    },
    delete(ctx) {
      return khotanCache(ctx, cacheName).delete(key);
    },
  };
}
