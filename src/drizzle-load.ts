import { sql } from "drizzle-orm";
import type { DataRecord, Loader, LoadResult } from "./types.js";

const PG_MAX_PARAMETERS = 65535;

interface ToDrizzleOptions {
  /**
   * Max records per INSERT statement. When a batch exceeds this,
   * it's automatically split into sub-batches to stay within Postgres
   * parameter limits. Defaults to auto-calculated from columnsPerRow.
   */
  maxRowsPerStatement?: number;
  /**
   * Number of columns per row. Used to auto-calculate maxRowsPerStatement
   * to stay under Postgres' 65535 parameter limit.
   * If not provided, falls back to maxRowsPerStatement or 1000.
   */
  columnsPerRow?: number;
}

export type KhotanUpsertDedupe = "first-wins" | "last-wins" | false;

export interface KhotanUpsertOptions<
  TRecord extends DataRecord,
  TTable extends Record<string, unknown>,
> extends ToDrizzleOptions {
  table: TTable;
  records: TRecord[];
  conflictKey: (keyof TRecord & string) | readonly (keyof TRecord & string)[];
  /**
   * Columns that should be inserted for new records but preserved when an
   * existing row is updated. Use this for learned/enriched fields.
   */
  excludeOnUpdate?: readonly (keyof TRecord & string)[];
  /**
   * Duplicate natural keys in one INSERT ... ON CONFLICT batch can fail in
   * Postgres. Defaults to first-wins to match common upstream snapshot semantics.
   */
  dedupe?: KhotanUpsertDedupe;
  /**
   * Coerce upstream enum drift before insert/update. Values not present in the
   * mapping are left unchanged.
   */
  coerceEnum?: Partial<Record<keyof TRecord & string, Record<string, unknown>>>;
}

export interface KhotanUpsertResult {
  recordsReceived: number;
  recordsUpserted: number;
  recordsSkipped: number;
}

interface DrizzleConflictBuilder {
  onConflictDoUpdate(config: {
    target: unknown;
    set: Record<string, unknown>;
  }): PromiseLike<unknown>;
  onConflictDoNothing(config?: { target?: unknown }): PromiseLike<unknown>;
}

interface DrizzleInsertBuilder<TRecord extends DataRecord> {
  values(records: TRecord[]): DrizzleConflictBuilder;
}

interface DrizzleInsertDb {
  insert<TRecord extends DataRecord>(
    table: Record<string, unknown>,
  ): DrizzleInsertBuilder<TRecord>;
}

function resolveMaxRows(options?: ToDrizzleOptions): number {
  if (options?.maxRowsPerStatement) return options.maxRowsPerStatement;
  if (options?.columnsPerRow) {
    return Math.floor(PG_MAX_PARAMETERS / options.columnsPerRow);
  }
  return 1000;
}

function quotePgIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function columnName(column: unknown, fallback: string): string {
  if (
    column &&
    typeof column === "object" &&
    "name" in column &&
    typeof column.name === "string"
  ) {
    return column.name;
  }
  return fallback;
}

function requireTableColumn(
  table: Record<string, unknown>,
  key: string,
): unknown {
  const column = table[key];
  if (column === undefined) {
    throw new Error(`khotanUpsert: table is missing column "${key}"`);
  }
  return column;
}

function conflictTarget(
  table: Record<string, unknown>,
  conflictKey: string | readonly string[],
): unknown {
  if (typeof conflictKey !== "string") {
    return conflictKey.map((key) => requireTableColumn(table, key));
  }
  return requireTableColumn(table, conflictKey);
}

function naturalKey(
  record: DataRecord,
  conflictKey: string | readonly string[],
): string {
  if (typeof conflictKey !== "string") {
    return JSON.stringify(conflictKey.map((key) => record[key]));
  }
  return JSON.stringify(record[conflictKey]);
}

function coerceRecord<TRecord extends DataRecord>(
  record: TRecord,
  coerceEnum: KhotanUpsertOptions<
    TRecord,
    Record<string, unknown>
  >["coerceEnum"],
): TRecord {
  if (!coerceEnum) return record;
  const next: DataRecord = { ...record };
  for (const [key, mapping] of Object.entries(coerceEnum)) {
    const value = next[key];
    if (
      typeof value === "string" &&
      mapping &&
      Object.prototype.hasOwnProperty.call(mapping, value)
    ) {
      next[key] = mapping[value];
    }
  }
  return next as TRecord;
}

function dedupeRecords<TRecord extends DataRecord>(
  records: TRecord[],
  conflictKey: string | readonly string[],
  dedupe: KhotanUpsertDedupe,
): TRecord[] {
  if (dedupe === false) return records;

  const byKey = new Map<string, TRecord>();
  for (const record of records) {
    const key = naturalKey(record, conflictKey);
    if (dedupe === "first-wins" && byKey.has(key)) continue;
    byKey.set(key, record);
  }
  return [...byKey.values()];
}

function updateSet(
  table: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const key of keys) {
    const column = requireTableColumn(table, key);
    const name = columnName(column, key);
    set[key] = sql.raw(`excluded.${quotePgIdentifier(name)}`);
  }
  return set;
}

/**
 * Natural-key upsert helper for Drizzle/Postgres.
 *
 * The helper coerces upstream enum values, dedupes natural-key collisions, and
 * builds an ON CONFLICT update set that can preserve local learned fields via
 * `excludeOnUpdate`.
 */
export async function khotanUpsert<
  TRecord extends DataRecord,
  TTable extends Record<string, unknown>,
>(
  db: DrizzleInsertDb,
  options: KhotanUpsertOptions<TRecord, TTable>,
): Promise<KhotanUpsertResult> {
  const {
    table,
    records,
    conflictKey,
    excludeOnUpdate = [],
    dedupe = "first-wins",
    coerceEnum,
  } = options;
  const received = records.length;
  if (records.length === 0) {
    return { recordsReceived: 0, recordsUpserted: 0, recordsSkipped: 0 };
  }

  const keys: string[] =
    typeof conflictKey === "string" ? [conflictKey] : [...conflictKey];
  const normalized = records.map((record) => coerceRecord(record, coerceEnum));
  const deduped = dedupeRecords(normalized, conflictKey, dedupe);
  const excluded = new Set<string>([...keys, ...excludeOnUpdate]);
  const updateKeys = [
    ...new Set(deduped.flatMap((record) => Object.keys(record))),
  ].filter((key) => !excluded.has(key));
  const target = conflictTarget(table, conflictKey);
  const maxRows = resolveMaxRows(options);

  for (let i = 0; i < deduped.length; i += maxRows) {
    const chunk = deduped.slice(i, i + maxRows);
    const builder = db.insert<TRecord>(table).values(chunk);
    if (updateKeys.length === 0) {
      await builder.onConflictDoNothing({ target });
    } else {
      await builder.onConflictDoUpdate({
        target,
        set: updateSet(table, updateKeys),
      });
    }
  }

  return {
    recordsReceived: received,
    recordsUpserted: deduped.length,
    recordsSkipped: received - deduped.length,
  };
}

/**
 * Create a loader that writes records using a Drizzle insert/upsert.
 *
 * You provide the write function — this keeps the loader decoupled from
 * specific Drizzle driver types while giving you full control over
 * insert/upsert/conflict behavior.
 *
 * Automatically sub-batches to stay within Postgres' 65535 parameter limit.
 *
 * @example
 * ```ts
 * import { toDrizzle } from "khotan-data/drizzle";
 * import { db } from "@/db";
 * import { processedUsers } from "@/db/schema";
 *
 * // Simple insert
 * const loader = toDrizzle("insert-users", (rows) =>
 *   db.insert(processedUsers).values(rows)
 * );
 *
 * // Upsert
 * const loader = toDrizzle("upsert-users", (rows) =>
 *   db.insert(processedUsers).values(rows).onConflictDoUpdate({
 *     target: processedUsers.id,
 *     set: { name: sql`excluded.name`, updatedAt: new Date() },
 *   })
 * );
 * ```
 */
export function toDrizzle<T extends DataRecord>(
  name: string,
  writeFn: (records: T[]) => PromiseLike<unknown>,
  options?: ToDrizzleOptions,
): Loader<T> {
  const maxRows = resolveMaxRows(options);

  return {
    name,
    async load(records: T[]): Promise<LoadResult> {
      const errors: LoadResult["errors"] = [];
      let loaded = 0;

      for (let i = 0; i < records.length; i += maxRows) {
        const chunk = records.slice(i, i + maxRows);
        try {
          await writeFn(chunk);
          loaded += chunk.length;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          for (const record of chunk) {
            errors.push({ record, error });
          }
        }
      }

      return { recordsLoaded: loaded, errors };
    },
  };
}

/**
 * Create a loader that writes records inside a Drizzle transaction.
 *
 * All sub-batches for a single load call are wrapped in a single
 * transaction — if any batch fails, the entire load is rolled back.
 *
 * @example
 * ```ts
 * const loader = toDrizzleTx("tx-insert", db, (tx, rows) =>
 *   tx.insert(processedUsers).values(rows)
 * );
 * ```
 */
export function toDrizzleTx<T extends DataRecord>(
  name: string,
  db: { transaction: <R>(fn: (tx: never) => Promise<R>) => Promise<R> },
  writeFn: (tx: never, records: T[]) => PromiseLike<unknown>,
  options?: ToDrizzleOptions,
): Loader<T> {
  const maxRows = resolveMaxRows(options);

  return {
    name,
    async load(records: T[]): Promise<LoadResult> {
      const errors: LoadResult["errors"] = [];
      let loaded = 0;

      try {
        await db.transaction(async (tx) => {
          for (let i = 0; i < records.length; i += maxRows) {
            const chunk = records.slice(i, i + maxRows);
            await writeFn(tx, chunk);
            loaded += chunk.length;
          }
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        for (const record of records) {
          errors.push({ record, error });
        }
        loaded = 0;
      }

      return { recordsLoaded: loaded, errors };
    },
  };
}
