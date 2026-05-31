import type { DataRecord, Extractor } from "./types.js";

/**
 * Create an extractor from any Drizzle select query.
 *
 * Pass a function that returns the query — this makes the extractor
 * re-runnable and avoids consuming a one-shot promise.
 *
 * @example
 * ```ts
 * import { fromQuery } from "khotan-data/drizzle";
 * import { db } from "@/db";
 * import { users } from "@/db/schema";
 * import { eq } from "drizzle-orm";
 *
 * const extractor = fromQuery("active-users", () =>
 *   db.select().from(users).where(eq(users.active, true))
 * );
 * ```
 */
export function fromQuery<T extends DataRecord>(
  name: string,
  queryFn: () => PromiseLike<T[]>,
): Extractor<T> {
  return {
    name,
    async *extract() {
      const rows = await queryFn();
      for (const row of rows) {
        yield row;
      }
    },
  };
}

/**
 * Create an extractor from a Drizzle query that streams results in
 * chunks. Use this for large tables where materializing all rows
 * at once is too expensive.
 *
 * @example
 * ```ts
 * const extractor = fromQueryCursor("all-events", async function* () {
 *   let offset = 0;
 *   const limit = 5000;
 *   while (true) {
 *     const batch = await db.select().from(events).limit(limit).offset(offset);
 *     if (batch.length === 0) break;
 *     yield* batch;
 *     offset += limit;
 *   }
 * });
 * ```
 */
export function fromQueryCursor<T extends DataRecord>(
  name: string,
  generatorFn: () => AsyncIterable<T>,
): Extractor<T> {
  return {
    name,
    extract: generatorFn,
  };
}

/**
 * Create an extractor from a paginated Drizzle query. Automatically
 * handles offset-based pagination so you don't have to write the loop.
 *
 * @example
 * ```ts
 * const extractor = fromQueryPaginated("all-users", {
 *   pageSize: 2000,
 *   query: (limit, offset) => db.select().from(users).limit(limit).offset(offset),
 * });
 * ```
 */
export function fromQueryPaginated<T extends DataRecord>(
  name: string,
  opts: {
    query: (limit: number, offset: number) => PromiseLike<T[]>;
    pageSize?: number;
  },
): Extractor<T> {
  const pageSize = opts.pageSize ?? 1000;
  return {
    name,
    async *extract() {
      let offset = 0;
      for (;;) {
        const rows = await opts.query(pageSize, offset);
        if (rows.length === 0) break;
        for (const row of rows) {
          yield row;
        }
        if (rows.length < pageSize) break;
        offset += pageSize;
      }
    },
  };
}
