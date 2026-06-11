import { describe, expect, it } from "vitest";
import { inferShape, diffSchemas, type SchemaNode } from "./compare.js";

// ---------------------------------------------------------------------------
// inferShape
// ---------------------------------------------------------------------------

describe("inferShape", () => {
  it("infers string", () => {
    expect(inferShape("hello")).toEqual({ type: "string" });
  });

  it("infers number", () => {
    expect(inferShape(42)).toEqual({ type: "number" });
  });

  it("infers boolean", () => {
    expect(inferShape(true)).toEqual({ type: "boolean" });
  });

  it("infers null", () => {
    expect(inferShape(null)).toEqual({ type: "null" });
  });

  it("infers undefined as null", () => {
    expect(inferShape(undefined)).toEqual({ type: "null" });
  });

  it("infers nested object", () => {
    const result = inferShape({ name: "x", count: 1, active: true });
    expect(result).toEqual({
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "number" },
        active: { type: "boolean" },
      },
    });
  });

  it("infers deeply nested object", () => {
    const result = inferShape({ data: { meta: { count: 1 } } });
    expect(result).toEqual({
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            meta: {
              type: "object",
              properties: { count: { type: "number" } },
            },
          },
        },
      },
    });
  });

  it("infers homogeneous array", () => {
    const result = inferShape([1, 2, 3]);
    expect(result).toEqual({ type: "array", items: { type: "number" } });
  });

  it("infers empty array", () => {
    expect(inferShape([])).toEqual({ type: "array", items: null });
  });

  it("infers array of objects with merged keys", () => {
    const result = inferShape([
      { id: "a", name: "Alice" },
      { id: "b", age: 30 },
    ]);
    expect(result).toEqual({
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          age: { type: "number" },
        },
      },
    });
  });

  it("infers object with null field", () => {
    const result = inferShape({ id: "x", meta: null });
    expect(result).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
        meta: { type: "null" },
      },
    });
  });

  it("infers array of arrays", () => {
    const result = inferShape([[1, 2], [3]]);
    expect(result).toEqual({
      type: "array",
      items: { type: "array", items: { type: "number" } },
    });
  });
});

// ---------------------------------------------------------------------------
// diffSchemas
// ---------------------------------------------------------------------------

describe("diffSchemas", () => {
  it("returns no mismatches for exact match", () => {
    const expected = { id: "string", name: "string", count: "number" };
    const actual: SchemaNode = {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        count: { type: "number" },
      },
    };
    expect(diffSchemas(expected, actual)).toEqual([]);
  });

  it("detects missing fields", () => {
    const expected = { id: "string", name: "string" };
    const actual: SchemaNode = {
      type: "object",
      properties: { id: { type: "string" } },
    };
    const result = diffSchemas(expected, actual);
    expect(result).toEqual([{ path: "$.name", issue: "missing" }]);
  });

  it("ignores missing optional fields", () => {
    const expected = { id: "string", name: "string?" };
    const actual: SchemaNode = {
      type: "object",
      properties: { id: { type: "string" } },
    };
    expect(diffSchemas(expected, actual)).toEqual([]);
  });

  it("detects extra fields", () => {
    const expected = { id: "string" };
    const actual: SchemaNode = {
      type: "object",
      properties: {
        id: { type: "string" },
        bonus: { type: "string" },
      },
    };
    const result = diffSchemas(expected, actual);
    expect(result).toEqual([{ path: "$.bonus", issue: "extra" }]);
  });

  it("detects type mismatches", () => {
    const expected = { id: "string", count: "number" };
    const actual: SchemaNode = {
      type: "object",
      properties: {
        id: { type: "string" },
        count: { type: "string" },
      },
    };
    const result = diffSchemas(expected, actual);
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe("$.count");
    expect(result[0]!.issue).toBe("type_mismatch");
  });

  it("handles nested object schemas", () => {
    const expected = {
      data: {
        _type: "object",
        id: "string",
        meta: { _type: "object", count: "number" },
      },
    };
    // The nested schema is a sub-object — factory serializes nested objects as { key: "object" }
    // but for deep comparison we need the full schema. The diffSchemas handles both.
    const actual: SchemaNode = {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: { type: "string" },
            meta: {
              type: "object",
              properties: { count: { type: "number" } },
            },
          },
        },
      },
    };
    // data is an object schema with nested properties
    expect(diffSchemas(expected, actual)).toEqual([]);
  });

  it("detects mismatches in nested objects", () => {
    const expected = { data: { id: "string", name: "string" } };
    const actual: SchemaNode = {
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: { type: "number" },
          },
        },
      },
    };
    const result = diffSchemas(expected, actual);
    const paths = result.map((m) => m.path);
    expect(paths).toContain("$.data.id");
    expect(paths).toContain("$.data.name");
  });

  it("handles array type descriptions", () => {
    const expected = { items: "string[]" };
    const actual: SchemaNode = {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "string" } },
      },
    };
    expect(diffSchemas(expected, actual)).toEqual([]);
  });

  it("detects array vs non-array mismatch", () => {
    const expected = { items: "string[]" };
    const actual: SchemaNode = {
      type: "object",
      properties: {
        items: { type: "string" },
      },
    };
    const result = diffSchemas(expected, actual);
    expect(result).toHaveLength(1);
    expect(result[0]!.issue).toBe("type_mismatch");
  });

  it("handles _type array schemas", () => {
    const expected = { _type: "array", items: { id: "string", name: "string" } };
    const actual: SchemaNode = {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      },
    };
    expect(diffSchemas(expected, actual)).toEqual([]);
  });

  it("detects mismatches inside array items", () => {
    const expected = { _type: "array", items: { id: "string", name: "string" } };
    const actual: SchemaNode = {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "number" },
          extra: { type: "string" },
        },
      },
    };
    const result = diffSchemas(expected, actual);
    const issues = result.map((m) => `${m.path}:${m.issue}`);
    expect(issues).toContain("$[].id:type_mismatch");
    expect(issues).toContain("$[].name:missing");
    expect(issues).toContain("$[].extra:extra");
  });

  it("allows null for any expected type", () => {
    const expected = { id: "string" };
    const actual: SchemaNode = {
      type: "object",
      properties: { id: { type: "null" } },
    };
    expect(diffSchemas(expected, actual)).toEqual([]);
  });

  it("detects top-level type mismatch", () => {
    const expected = { id: "string" };
    const actual: SchemaNode = { type: "string" };
    const result = diffSchemas(expected, actual);
    expect(result).toHaveLength(1);
    expect(result[0]!.issue).toBe("type_mismatch");
    expect(result[0]!.note).toContain("expected object");
  });
});
