import { afterEach, describe, expect, it } from "vitest";
import {
  contentHash,
  createCursorHelper,
  deltaSkip,
  detectChanges,
} from "./load.js";
import { khotanRuntimeRegistry } from "./types.js";

function registerCache() {
  const entries = new Map<string, unknown>();
  khotanRuntimeRegistry.set("test-instance", {
    cache() {
      return {
        async get<T>(key: string) {
          return (entries.get(key) as T | undefined) ?? null;
        },
        async set<T>(key: string, value: T) {
          entries.set(key, value);
          return value;
        },
        async delete(key: string) {
          entries.delete(key);
        },
      };
    },
  } as never);
  return entries;
}

describe("load helpers", () => {
  afterEach(() => {
    khotanRuntimeRegistry.clear();
  });

  it("contentHash is stable for object key order", () => {
    expect(contentHash({ b: 2, a: 1 })).toBe(contentHash({ a: 1, b: 2 }));
  });

  it("detectChanges returns only records whose content hash differs", async () => {
    const previous = {
      "SKU-1": contentHash({ sku: "SKU-1", qty: 5 }),
    };

    const result = await detectChanges(
      [
        { sku: "SKU-1", qty: 5 },
        { sku: "SKU-2", qty: 1 },
      ],
      previous,
      (record) => record.sku,
    );

    expect(result.changed).toEqual([{ sku: "SKU-2", qty: 1 }]);
    expect(result.unchanged).toEqual([{ sku: "SKU-1", qty: 5 }]);
    expect(Object.keys(result.hashes).sort()).toEqual(["SKU-1", "SKU-2"]);
  });

  it("deltaSkip reads and writes hashes through khotanCache", async () => {
    registerCache();
    const ctx = { khotanInstanceId: "test-instance" };

    const first = await deltaSkip(
      ctx,
      "products-delta",
      [
        { sku: "SKU-1", qty: 5 },
        { sku: "SKU-2", qty: 1 },
      ],
      (record) => record.sku,
    );
    expect(first).toHaveLength(2);

    const second = await deltaSkip(
      ctx,
      "products-delta",
      [
        { sku: "SKU-1", qty: 5 },
        { sku: "SKU-2", qty: 2 },
      ],
      (record) => record.sku,
    );
    expect(second).toEqual([{ sku: "SKU-2", qty: 2 }]);
  });

  it("deltaSkip can defer hash commits until downstream writes succeed", async () => {
    const entries = registerCache();
    const ctx = { khotanInstanceId: "test-instance" };
    const records = [
      { sku: "SKU-1", qty: 5 },
      { sku: "SKU-2", qty: 1 },
    ];

    const pending = await deltaSkip(
      ctx,
      "products-delta",
      records,
      (record) => record.sku,
      { updateCache: false },
    );

    expect(pending.changed).toEqual(records);
    expect(pending.unchanged).toEqual([]);

    await expect(
      Promise.reject(new Error("downstream write failed")),
    ).rejects.toThrow("downstream write failed");
    expect(entries.get("hashes")).toBeUndefined();

    const retry = await deltaSkip(
      ctx,
      "products-delta",
      records,
      (record) => record.sku,
      { updateCache: false },
    );
    expect(retry.changed).toEqual(records);

    await pending.commit();
    const afterCommit = await deltaSkip(
      ctx,
      "products-delta",
      records,
      (record) => record.sku,
      { updateCache: false },
    );
    expect(afterCommit.changed).toEqual([]);
    expect(afterCommit.unchanged).toEqual(records);
  });

  it("createCursorHelper wraps a cache entry", async () => {
    registerCache();
    const cursor = createCursorHelper<{ since: string }>(
      "orders-cursor",
      "last-success",
    );
    const ctx = { khotanInstanceId: "test-instance" };

    await expect(cursor.get(ctx)).resolves.toBeNull();
    await cursor.set(ctx, { since: "2026-06-29T00:00:00Z" });
    await expect(cursor.get(ctx)).resolves.toEqual({
      since: "2026-06-29T00:00:00Z",
    });
    await cursor.delete(ctx);
    await expect(cursor.get(ctx)).resolves.toBeNull();
  });
});
