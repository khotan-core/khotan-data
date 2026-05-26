import type { DataRecord, Transformer } from "./types.js";

/**
 * Create a custom transformer from a function.
 */
export function createTransformer<
  TInput extends DataRecord = DataRecord,
  TOutput extends DataRecord = DataRecord,
>(
  name: string,
  fn: (record: TInput) => TOutput | TOutput[] | Promise<TOutput | TOutput[]>,
): Transformer<TInput, TOutput> {
  return { name, transform: fn };
}

/**
 * Transform each record using a mapping function.
 */
export function map<
  TInput extends DataRecord = DataRecord,
  TOutput extends DataRecord = DataRecord,
>(
  name: string,
  fn: (record: TInput) => TOutput | Promise<TOutput>,
): Transformer<TInput, TOutput> {
  return createTransformer<TInput, TOutput>(name, fn);
}

/**
 * Filter records based on a predicate. Records that don't match
 * are dropped (returned as empty array).
 */
export function filter<T extends DataRecord = DataRecord>(
  name: string,
  predicate: (record: T) => boolean | Promise<boolean>,
): Transformer<T, T> {
  return createTransformer(name, async (record: T) => {
    const keep = await predicate(record);
    return keep ? record : [];
  });
}

/**
 * Transform each record into zero or more records.
 */
export function flatMap<
  TInput extends DataRecord = DataRecord,
  TOutput extends DataRecord = DataRecord,
>(
  name: string,
  fn: (record: TInput) => TOutput[] | Promise<TOutput[]>,
): Transformer<TInput, TOutput> {
  return createTransformer(name, fn);
}

/**
 * Pick specific keys from each record.
 */
export function pick<
  T extends DataRecord,
  K extends keyof T & string,
>(name: string, keys: K[]): Transformer<T, Pick<T, K> & DataRecord> {
  return createTransformer<T, Pick<T, K> & DataRecord>(name, (record: T) => {
    const result = {} as Pick<T, K> & DataRecord;
    for (const key of keys) {
      if (key in record) {
        (result as Record<string, unknown>)[key] = record[key];
      }
    }
    return result;
  });
}

/**
 * Omit specific keys from each record.
 */
export function omit<
  T extends DataRecord,
  K extends keyof T & string,
>(name: string, keys: K[]): Transformer<T, Omit<T, K> & DataRecord> {
  const keySet = new Set<string>(keys);
  return createTransformer<T, Omit<T, K> & DataRecord>(name, (record: T) => {
    const result = {} as Omit<T, K> & DataRecord;
    for (const [key, value] of Object.entries(record)) {
      if (!keySet.has(key)) {
        (result as Record<string, unknown>)[key] = value;
      }
    }
    return result;
  });
}

/**
 * Rename keys in each record.
 */
export function rename<T extends DataRecord>(
  name: string,
  mapping: Record<string, string>,
): Transformer<T, DataRecord> {
  return createTransformer(name, (record: T) => {
    const result: DataRecord = {};
    for (const [key, value] of Object.entries(record)) {
      const newKey = mapping[key] ?? key;
      result[newKey] = value;
    }
    return result;
  });
}

/**
 * Compose multiple transformers into a single transformer that
 * applies them in sequence.
 */
export function compose<T extends DataRecord>(
  name: string,
  transformers: Transformer<DataRecord, DataRecord>[],
): Transformer<T, DataRecord> {
  return createTransformer(name, async (record: T) => {
    let records: DataRecord[] = [record];

    for (const transformer of transformers) {
      const nextRecords: DataRecord[] = [];
      for (const r of records) {
        const result = await transformer.transform(r);
        if (Array.isArray(result)) {
          nextRecords.push(...result);
        } else {
          nextRecords.push(result);
        }
      }
      records = nextRecords;
    }

    return records;
  });
}
