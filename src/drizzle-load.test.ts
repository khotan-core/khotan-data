import { describe, expect, it, vi } from "vitest";
import { khotanUpsert, toDrizzle, toDrizzleTx } from "./drizzle-load.js";

describe("toDrizzle", () => {
  it("writes records via the provided function", async () => {
    const written: Record<string, unknown>[][] = [];
    const loader = toDrizzle("insert", async (records) => {
      written.push([...records]);
    });

    const result = await loader.load([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);

    expect(written).toEqual([
      [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ],
    ]);
    expect(result.recordsLoaded).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it("sub-batches when records exceed maxRowsPerStatement", async () => {
    const batchSizes: number[] = [];
    const loader = toDrizzle(
      "batched-insert",
      async (records) => {
        batchSizes.push(records.length);
      },
      { maxRowsPerStatement: 2 },
    );

    const records = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const result = await loader.load(records);

    expect(batchSizes).toEqual([2, 2, 1]);
    expect(result.recordsLoaded).toBe(5);
  });

  it("auto-calculates batch size from columnsPerRow", async () => {
    const batchSizes: number[] = [];
    const loader = toDrizzle(
      "auto-batch",
      async (records) => {
        batchSizes.push(records.length);
      },
      { columnsPerRow: 10 },
    );

    const records = Array.from({ length: 10000 }, (_, i) => ({ id: i }));
    const result = await loader.load(records);

    expect(batchSizes[0]).toBe(6553);
    expect(result.recordsLoaded).toBe(10000);
  });

  it("captures errors per-chunk without losing other chunks", async () => {
    let callCount = 0;
    const loader = toDrizzle(
      "partial-fail",
      async () => {
        callCount++;
        if (callCount === 2) throw new Error("insert failed");
      },
      { maxRowsPerStatement: 2 },
    );

    const records = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const result = await loader.load(records);

    expect(result.recordsLoaded).toBe(3);
    expect(result.errors.length).toBe(2);
    expect(result.errors[0]?.error.message).toBe("insert failed");
  });
});

describe("toDrizzleTx", () => {
  it("wraps writes in a transaction", async () => {
    const operations: string[] = [];

    const mockDb = {
      transaction: async <R>(fn: (tx: unknown) => Promise<R>) => {
        operations.push("tx:begin");
        const result = await fn({ insert: true });
        operations.push("tx:commit");
        return result;
      },
    };

    const loader = toDrizzleTx(
      "tx-insert",
      mockDb,
      async (_tx, records) => {
        operations.push(`insert:${records.length}`);
      },
      { maxRowsPerStatement: 2 },
    );

    const result = await loader.load([{ id: 1 }, { id: 2 }, { id: 3 }]);

    expect(operations).toEqual([
      "tx:begin",
      "insert:2",
      "insert:1",
      "tx:commit",
    ]);
    expect(result.recordsLoaded).toBe(3);
    expect(result.errors).toEqual([]);
  });

  it("rolls back entire load on failure", async () => {
    let callCount = 0;
    const mockDb = {
      transaction: async <R>(fn: (tx: unknown) => Promise<R>) => fn({}),
    };

    const loader = toDrizzleTx(
      "tx-fail",
      mockDb,
      async (_tx) => {
        callCount++;
        if (callCount === 2) throw new Error("constraint violation");
      },
      { maxRowsPerStatement: 2 },
    );

    const records = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const result = await loader.load(records);

    expect(result.recordsLoaded).toBe(0);
    expect(result.errors.length).toBe(5);
    expect(result.errors[0]?.error.message).toBe("constraint violation");
  });
});

describe("khotanUpsert", () => {
  it("dedupes by natural key, coerces enums, and excludes learned fields on update", async () => {
    const calls: Array<{
      rows: Array<Record<string, unknown>>;
      conflict?: { target: unknown; set: Record<string, unknown> };
    }> = [];
    const table = {
      code: { name: "code" },
      status: { name: "status" },
      name: { name: "name" },
      emailDomain: { name: "email_domain" },
    };
    const db = {
      insert() {
        return {
          values(rows: Array<Record<string, unknown>>) {
            const call = { rows };
            calls.push(call);
            return {
              async onConflictDoUpdate(conflict: {
                target: unknown;
                set: Record<string, unknown>;
              }) {
                call.conflict = conflict;
              },
              async onConflictDoNothing() {
                // not used in this test
              },
            };
          },
        };
      },
    };

    const result = await khotanUpsert(db, {
      table,
      records: [
        {
          code: "SUP-1",
          status: "active",
          name: "First",
          emailDomain: "learned.example",
        },
        {
          code: "SUP-1",
          status: "inactive",
          name: "Second",
          emailDomain: "ignored.example",
        },
        { code: "SUP-2", status: "inactive", name: "Other" },
      ],
      conflictKey: "code",
      excludeOnUpdate: ["emailDomain"],
      dedupe: "first-wins",
      coerceEnum: {
        status: { active: "ACTIVE", inactive: "INACTIVE" },
      },
    });

    expect(result).toEqual({
      recordsReceived: 3,
      recordsUpserted: 2,
      recordsSkipped: 1,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.rows).toEqual([
      {
        code: "SUP-1",
        status: "ACTIVE",
        name: "First",
        emailDomain: "learned.example",
      },
      { code: "SUP-2", status: "INACTIVE", name: "Other" },
    ]);
    expect(Object.keys(calls[0]!.conflict!.set).sort()).toEqual([
      "name",
      "status",
    ]);
  });

  it("sub-batches upserts", async () => {
    const batchSizes: number[] = [];
    const db = {
      insert() {
        return {
          values(rows: Array<Record<string, unknown>>) {
            batchSizes.push(rows.length);
            return {
              async onConflictDoUpdate() {},
              async onConflictDoNothing() {},
            };
          },
        };
      },
    };

    await khotanUpsert(db, {
      table: { id: { name: "id" }, value: { name: "value" } },
      records: Array.from({ length: 5 }, (_, id) => ({ id, value: id })),
      conflictKey: "id",
      maxRowsPerStatement: 2,
    });

    expect(batchSizes).toEqual([2, 2, 1]);
  });
});
