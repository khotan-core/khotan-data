// Deep schema comparison engine — infers the shape of a JSON response
// and diffs it against serialized Zod endpoint schemas.

// ---------------------------------------------------------------------------
// SchemaNode — the inferred type tree for an actual JSON value
// ---------------------------------------------------------------------------

export type SchemaNode =
  | { type: "string" }
  | { type: "number" }
  | { type: "boolean" }
  | { type: "null" }
  | { type: "object"; properties: Record<string, SchemaNode> }
  | { type: "array"; items: SchemaNode | null };

// ---------------------------------------------------------------------------
// inferShape — recursively walks a JSON value and produces a SchemaNode
// ---------------------------------------------------------------------------

export function inferShape(value: unknown): SchemaNode {
  if (value === null || value === undefined) {
    return { type: "null" };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: "array", items: null };
    }
    const merged = mergeShapes(value.map(inferShape));
    return { type: "array", items: merged };
  }

  switch (typeof value) {
    case "string":
      return { type: "string" };
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "object": {
      const properties: Record<string, SchemaNode> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        properties[k] = inferShape(v);
      }
      return { type: "object", properties };
    }
    default:
      return { type: "string" };
  }
}

/**
 * Merge multiple SchemaNodes into a single one (union of object keys).
 * Used to produce a unified item schema from all array elements.
 */
function mergeShapes(shapes: SchemaNode[]): SchemaNode {
  if (shapes.length === 0) return { type: "null" };
  if (shapes.length === 1) return shapes[0]!;

  const objectShapes = shapes.filter(
    (s): s is SchemaNode & { type: "object" } => s.type === "object",
  );

  if (objectShapes.length === shapes.length) {
    const merged: Record<string, SchemaNode> = {};
    for (const shape of objectShapes) {
      for (const [key, node] of Object.entries(shape.properties)) {
        if (!merged[key]) {
          merged[key] = node;
        } else if (merged[key]!.type === "object" && node.type === "object") {
          merged[key] = mergeShapes([merged[key]!, node]);
        }
      }
    }
    return { type: "object", properties: merged };
  }

  // Non-object arrays — return the first item's shape
  return shapes[0]!;
}

// ---------------------------------------------------------------------------
// Mismatch — a single schema difference
// ---------------------------------------------------------------------------

export interface Mismatch {
  path: string;
  issue: "missing" | "extra" | "type_mismatch";
  note?: string;
}

// ---------------------------------------------------------------------------
// SerializedSchema — the shape produced by serializeZodSchema in factory.ts
//
// Objects: { key: "string", other: "number?" }
// Arrays:  { _type: "array", items: { ... } }
// Primitives: { _type: "string" }
// ---------------------------------------------------------------------------

export type SerializedSchema = Record<string, unknown>;

// ---------------------------------------------------------------------------
// diffSchemas — compares a serialized Zod schema against an inferred shape
// ---------------------------------------------------------------------------

export function diffSchemas(
  expected: SerializedSchema,
  actual: SchemaNode,
  basePath = "$",
): Mismatch[] {
  // If the expected schema has a _type field, it describes a single typed node
  if ("_type" in expected) {
    return diffTypedNode(expected, actual, basePath);
  }

  // Otherwise it's a flat object schema: { key: "type_string", ... }
  return diffObjectSchema(expected, actual, basePath);
}

function diffTypedNode(
  expected: SerializedSchema,
  actual: SchemaNode,
  path: string,
): Mismatch[] {
  const expectedType = expected["_type"] as string;

  if (expectedType === "array") {
    if (actual.type !== "array") {
      return [
        {
          path,
          issue: "type_mismatch",
          note: `expected array, got ${actual.type}`,
        },
      ];
    }
    const itemSchema = expected["items"] as SerializedSchema | null;
    if (!itemSchema || !actual.items) return [];
    return diffSchemas(itemSchema, actual.items, `${path}[]`);
  }

  // Primitive typed node
  const normalizedExpected = normalizeType(expectedType);
  if (normalizedExpected !== actual.type && actual.type !== "null") {
    return [
      {
        path,
        issue: "type_mismatch",
        note: `expected ${expectedType}, got ${actual.type}`,
      },
    ];
  }
  return [];
}

function diffObjectSchema(
  expected: SerializedSchema,
  actual: SchemaNode,
  path: string,
): Mismatch[] {
  if (actual.type !== "object") {
    return [
      {
        path,
        issue: "type_mismatch",
        note: `expected object, got ${actual.type}`,
      },
    ];
  }

  const mismatches: Mismatch[] = [];
  const actualProps = actual.properties;

  // Check for missing keys (in schema but not in response)
  for (const [key, typeDesc] of Object.entries(expected)) {
    const childPath = path === "$" ? `$.${key}` : `${path}.${key}`;
    const typeStr = typeof typeDesc === "string" ? typeDesc : null;
    const isOptional = typeStr?.endsWith("?") ?? false;

    if (!(key in actualProps)) {
      if (!isOptional) {
        mismatches.push({ path: childPath, issue: "missing" });
      }
      continue;
    }

    const actualChild = actualProps[key]!;

    if (typeStr !== null) {
      const baseType = typeStr.replace(/\?$/, "").replace(/ \| null$/, "");

      // Empty type string = unresolved Zod type — only check key presence
      if (baseType === "" || baseType === "unknown") {
        // key exists, that's all we can verify
      } else if (baseType.endsWith("[]")) {
        if (actualChild.type !== "array") {
          mismatches.push({
            path: childPath,
            issue: "type_mismatch",
            note: `expected ${baseType}, got ${actualChild.type}`,
          });
        }
      } else if (baseType === "object" && actualChild.type === "object") {
        // Both object — no further comparison possible from flat type string
      } else {
        const normalizedBase = normalizeType(baseType);
        if (
          normalizedBase !== actualChild.type &&
          actualChild.type !== "null"
        ) {
          mismatches.push({
            path: childPath,
            issue: "type_mismatch",
            note: `expected ${baseType}, got ${actualChild.type}`,
          });
        }
      }
    } else if (typeof typeDesc === "object" && typeDesc !== null) {
      // Nested schema object — recurse
      mismatches.push(
        ...diffSchemas(typeDesc as SerializedSchema, actualChild, childPath),
      );
    }
  }

  // Check for extra keys (in response but not in schema)
  for (const key of Object.keys(actualProps)) {
    if (!(key in expected)) {
      const childPath = path === "$" ? `$.${key}` : `${path}.${key}`;
      mismatches.push({ path: childPath, issue: "extra" });
    }
  }

  return mismatches;
}

function normalizeType(typeStr: string): string {
  const lower = typeStr.toLowerCase();
  switch (lower) {
    case "string":
    case "number":
    case "boolean":
    case "null":
      return lower;
    case "integer":
    case "bigint":
      return "number";
    default:
      return lower;
  }
}
