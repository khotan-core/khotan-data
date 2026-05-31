import { describe, expect, it } from "vitest";
import {
  fromQuery,
  fromQueryCursor,
  fromQueryPaginated,
} from "./drizzle-extract.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const item of iter) {
    results.push(item);
  }
  return results;
}

describe("fromQuery", () => {
  it("extracts rows from a query function", async () => {
    const mockQuery = async () => [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ];

    const extractor = fromQuery("users", mockQuery);
    expect(extractor.name).toBe("users");

    const rows = await collect(extractor.extract());
    expect(rows).toEqual([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);
  });

  it("handles empty result sets", async () => {
    const extractor = fromQuery("empty", async () => []);
    const rows = await collect(extractor.extract());
    expect(rows).toEqual([]);
  });

  it("is re-runnable", async () => {
    let callCount = 0;
    const mockQuery = async () => {
      callCount++;
      return [{ n: callCount }];
    };

    const extractor = fromQuery("rerunnable", mockQuery);

    const first = await collect(extractor.extract());
    const second = await collect(extractor.extract());

    expect(first).toEqual([{ n: 1 }]);
    expect(second).toEqual([{ n: 2 }]);
    expect(callCount).toBe(2);
  });

  it("propagates query errors", async () => {
    const extractor = fromQuery("failing", () =>
      Promise.reject(new Error("connection refused")),
    );

    await expect(collect(extractor.extract())).rejects.toThrow(
      "connection refused",
    );
  });
});

describe("fromQueryCursor", () => {
  it("extracts rows from an async generator", async () => {
    const extractor = fromQueryCursor("cursor", async function* () {
      yield { id: 1 };
      yield { id: 2 };
      yield { id: 3 };
    });

    const rows = await collect(extractor.extract());
    expect(rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });
});

describe("fromQueryPaginated", () => {
  it("pages through results until exhausted", async () => {
    const allData = Array.from({ length: 7 }, (_, i) => ({ id: i + 1 }));

    const extractor = fromQueryPaginated("paged", {
      pageSize: 3,
      query: async (limit, offset) => allData.slice(offset, offset + limit),
    });

    const rows = await collect(extractor.extract());
    expect(rows).toEqual(allData);
  });

  it("handles exact page boundary", async () => {
    const allData = Array.from({ length: 6 }, (_, i) => ({ id: i + 1 }));

    const extractor = fromQueryPaginated("exact-page", {
      pageSize: 3,
      query: async (limit, offset) => allData.slice(offset, offset + limit),
    });

    const rows = await collect(extractor.extract());
    expect(rows).toEqual(allData);
  });

  it("handles empty table", async () => {
    const extractor = fromQueryPaginated("empty-table", {
      pageSize: 100,
      query: async () => [],
    });

    const rows = await collect(extractor.extract());
    expect(rows).toEqual([]);
  });

  it("uses default page size of 1000", async () => {
    const pageSizes: number[] = [];

    const extractor = fromQueryPaginated("default-page", {
      query: async (limit, _offset) => {
        pageSizes.push(limit);
        return [];
      },
    });

    await collect(extractor.extract());
    expect(pageSizes).toEqual([1000]);
  });
});
