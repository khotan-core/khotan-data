import { describe, expect, it, vi } from "vitest";
import { createLoader, toArray, toConsole } from "./loaders.js";

describe("createLoader", () => {
  it("creates a loader with the given name", () => {
    const loader = createLoader("test", async (records) => ({
      recordsLoaded: records.length,
      errors: [],
    }));
    expect(loader.name).toBe("test");
  });
});

describe("toArray", () => {
  it("pushes records into the target array", async () => {
    const target: { id: number }[] = [];
    const loader = toArray("to-array", target);

    const result = await loader.load([{ id: 1 }, { id: 2 }]);

    expect(target).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.recordsLoaded).toBe(2);
    expect(result.errors).toEqual([]);
  });

  it("accumulates across multiple loads", async () => {
    const target: { v: string }[] = [];
    const loader = toArray("accumulate", target);

    await loader.load([{ v: "a" }]);
    await loader.load([{ v: "b" }, { v: "c" }]);

    expect(target).toEqual([{ v: "a" }, { v: "b" }, { v: "c" }]);
  });
});

describe("toConsole", () => {
  it("logs records and returns correct count", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const loader = toConsole("console-out");
    const result = await loader.load([{ x: 1 }, { x: 2 }]);

    expect(result.recordsLoaded).toBe(2);
    expect(consoleSpy).toHaveBeenCalledTimes(2);
    expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify({ x: 1 }));

    consoleSpy.mockRestore();
  });
});
