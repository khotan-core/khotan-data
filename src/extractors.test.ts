import { describe, expect, it } from "vitest";
import { createExtractor, fromArray, fromIterable } from "./extractors.js";

describe("createExtractor", () => {
  it("creates an extractor with the given name", () => {
    const extractor = createExtractor("test", async function* () {
      yield { id: 1 };
    });
    expect(extractor.name).toBe("test");
  });

  it("yields records from the generator", async () => {
    const extractor = createExtractor("test", async function* () {
      yield { id: 1 };
      yield { id: 2 };
      yield { id: 3 };
    });

    const records = [];
    for await (const record of extractor.extract()) {
      records.push(record);
    }

    expect(records).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });
});

describe("fromArray", () => {
  it("creates an extractor from an array", async () => {
    const data = [{ name: "a" }, { name: "b" }];
    const extractor = fromArray("array-source", data);

    expect(extractor.name).toBe("array-source");

    const records = [];
    for await (const record of extractor.extract()) {
      records.push(record);
    }

    expect(records).toEqual(data);
  });

  it("handles empty arrays", async () => {
    const extractor = fromArray("empty", []);
    const records = [];
    for await (const record of extractor.extract()) {
      records.push(record);
    }
    expect(records).toEqual([]);
  });
});

describe("fromIterable", () => {
  it("creates an extractor from an async iterable", async () => {
    async function* source() {
      yield { value: 10 };
      yield { value: 20 };
    }

    const extractor = fromIterable("iterable-source", source());

    const records = [];
    for await (const record of extractor.extract()) {
      records.push(record);
    }

    expect(records).toEqual([{ value: 10 }, { value: 20 }]);
  });
});
