import { describe, expect, it } from "vitest";
import {
  compose,
  createTransformer,
  filter,
  flatMap,
  map,
  omit,
  pick,
  rename,
} from "./transformers.js";

describe("createTransformer", () => {
  it("creates a transformer with the given name and function", async () => {
    const t = createTransformer("double", (r: { value: number }) => ({
      value: r.value * 2,
    }));

    expect(t.name).toBe("double");
    expect(await t.transform({ value: 5 })).toEqual({ value: 10 });
  });
});

describe("map", () => {
  it("maps each record", async () => {
    const t = map("upper", (r: { name: string }) => ({
      name: r.name.toUpperCase(),
    }));

    expect(await t.transform({ name: "alice" })).toEqual({ name: "ALICE" });
  });

  it("supports async mapping", async () => {
    const t = map("async-map", async (r: { id: number }) => ({
      id: r.id,
      processed: true,
    }));

    expect(await t.transform({ id: 1 })).toEqual({ id: 1, processed: true });
  });
});

describe("filter", () => {
  it("keeps records matching the predicate", async () => {
    const t = filter("even", (r: { value: number }) => r.value % 2 === 0);

    expect(await t.transform({ value: 4 })).toEqual({ value: 4 });
  });

  it("drops records not matching the predicate", async () => {
    const t = filter("even", (r: { value: number }) => r.value % 2 === 0);

    expect(await t.transform({ value: 3 })).toEqual([]);
  });
});

describe("flatMap", () => {
  it("expands records", async () => {
    const t = flatMap("expand", (r: { values: number[] }) =>
      r.values.map((v) => ({ value: v })),
    );

    expect(await t.transform({ values: [1, 2, 3] })).toEqual([
      { value: 1 },
      { value: 2 },
      { value: 3 },
    ]);
  });
});

describe("pick", () => {
  it("picks specified keys", async () => {
    const t = pick<{ a: number; b: string; c: boolean }, "a" | "c">(
      "pick-ac",
      ["a", "c"],
    );

    const result = await t.transform({ a: 1, b: "hello", c: true });
    expect(result).toEqual({ a: 1, c: true });
  });
});

describe("omit", () => {
  it("omits specified keys", async () => {
    const t = omit<{ a: number; b: string; c: boolean }, "b">("omit-b", [
      "b",
    ]);

    const result = await t.transform({ a: 1, b: "hello", c: true });
    expect(result).toEqual({ a: 1, c: true });
  });
});

describe("rename", () => {
  it("renames keys according to the mapping", async () => {
    const t = rename("rename-fields", { name: "fullName", age: "years" });

    const result = await t.transform({ name: "Alice", age: 30, city: "NYC" });
    expect(result).toEqual({ fullName: "Alice", years: 30, city: "NYC" });
  });

  it("leaves unmapped keys unchanged", async () => {
    const t = rename("partial-rename", { a: "x" });
    const result = await t.transform({ a: 1, b: 2 });
    expect(result).toEqual({ x: 1, b: 2 });
  });
});

describe("compose", () => {
  it("chains multiple transformers", async () => {
    const upper = map("upper", (r: { name: string }) => ({
      name: r.name.toUpperCase(),
    }));
    const addFlag = map("flag", (r: { name: string }) => ({
      ...r,
      processed: true,
    }));

    const t = compose("composed", [upper, addFlag]);
    const result = await t.transform({ name: "alice" });

    expect(result).toEqual([{ name: "ALICE", processed: true }]);
  });

  it("handles filtering within composition", async () => {
    const keepEven = filter(
      "even",
      (r: { value: number }) => r.value % 2 === 0,
    );
    const double = map("double", (r: { value: number }) => ({
      value: r.value * 2,
    }));

    const t = compose("filter-then-double", [keepEven, double]);

    const even = await t.transform({ value: 4 });
    expect(even).toEqual([{ value: 8 }]);

    const odd = await t.transform({ value: 3 });
    expect(odd).toEqual([]);
  });
});
