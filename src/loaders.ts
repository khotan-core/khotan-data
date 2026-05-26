import type { DataRecord, Loader, LoadResult } from "./types.js";

/**
 * Create a custom loader from a function.
 */
export function createLoader<T extends DataRecord>(
  name: string,
  fn: (records: T[]) => Promise<LoadResult>,
): Loader<T> {
  return { name, load: fn };
}

/**
 * Load records into an in-memory array. Useful for testing
 * and collecting pipeline output.
 */
export function toArray<T extends DataRecord>(
  name: string,
  target: T[],
): Loader<T> {
  return createLoader(name, async (records) => {
    target.push(...records);
    return { recordsLoaded: records.length, errors: [] };
  });
}

/**
 * Load records by logging them to the console. Useful for debugging.
 */
export function toConsole<T extends DataRecord>(name: string): Loader<T> {
  return createLoader(name, async (records) => {
    for (const record of records) {
      console.log(JSON.stringify(record));
    }
    return { recordsLoaded: records.length, errors: [] };
  });
}
