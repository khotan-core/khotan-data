import type { DataRecord, Extractor } from "./types.js";

/**
 * Create a custom extractor from an async generator function.
 */
export function createExtractor<T extends DataRecord>(
  name: string,
  fn: () => AsyncIterable<T>,
): Extractor<T> {
  return {
    name,
    extract: fn,
  };
}

/**
 * Create an extractor from an in-memory array. Useful for testing
 * and for small datasets that are already loaded.
 */
export function fromArray<T extends DataRecord>(
  name: string,
  data: T[],
): Extractor<T> {
  return createExtractor(name, async function* () {
    for (const record of data) {
      yield record;
    }
  });
}

/**
 * Create an extractor from any async iterable source.
 */
export function fromIterable<T extends DataRecord>(
  name: string,
  iterable: AsyncIterable<T>,
): Extractor<T> {
  return createExtractor(name, () => iterable);
}
