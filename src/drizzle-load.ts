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

function resolveMaxRows(options?: ToDrizzleOptions): number {
  if (options?.maxRowsPerStatement) return options.maxRowsPerStatement;
  if (options?.columnsPerRow) {
    return Math.floor(PG_MAX_PARAMETERS / options.columnsPerRow);
  }
  return 1000;
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
