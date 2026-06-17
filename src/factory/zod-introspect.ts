// ---------------------------------------------------------------------------
// Zod introspection — best-effort, non-load-bearing serialization of Zod
// schemas for the debug UI. Reaches into private _def/def/typeName internals
// across Zod 3 and 4.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeZodSchema(schema: any): Record<string, unknown> | null {
  if (!schema) return null;
  try {
    const def = schema?._def ?? schema?.def ?? null;
    const rawTypeName: string =
      typeof def?.typeName === "string"
        ? def.typeName
        : typeof def?.type === "string"
          ? `Zod${def.type.charAt(0).toUpperCase()}${def.type.slice(1)}`
          : "";
    const inner =
      def?.innerType ??
      def?.element ??
      (typeof def?.type === "object" ? def.type : null) ??
      null;

    if (
      (rawTypeName === "ZodOptional" || rawTypeName === "ZodNullable") &&
      inner
    ) {
      return serializeZodSchema(inner);
    }

    const shape =
      typeof schema.shape === "function"
        ? schema.shape()
        : (schema.shape ??
          (typeof def?.shape === "function" ? def.shape() : def?.shape));
    if (shape && typeof shape === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(shape)) {
        result[key] = serializeZodField(val);
      }
      return result;
    }

    if (rawTypeName === "ZodArray" && inner) {
      return {
        _type: "array",
        items: serializeZodSchema(inner),
      };
    }

    if (rawTypeName) {
      return { _type: rawTypeName.replace("Zod", "").toLowerCase() };
    }
  } catch {
    /* best-effort */
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeZodField(field: any): string | Record<string, unknown> {
  const def = field?._def ?? field?.def ?? null;
  if (!def) return "unknown";
  const typeName: string =
    typeof def.typeName === "string"
      ? def.typeName
      : typeof def.type === "string"
        ? `Zod${def.type.charAt(0).toUpperCase()}${def.type.slice(1)}`
        : "";
  const inner =
    def.innerType ??
    def.element ??
    (typeof def.type === "object" ? def.type : null) ??
    null;

  if (typeName === "ZodOptional" && inner) {
    const serialized = serializeZodField(inner);
    if (typeof serialized === "string") {
      return serialized.endsWith("?") ? serialized : `${serialized}?`;
    }
    return serialized;
  }

  if (typeName === "ZodNullable" && inner) {
    const serialized = serializeZodField(inner);
    if (typeof serialized === "string") {
      return serialized.includes(" | null")
        ? serialized
        : `${serialized} | null`;
    }
    return serialized;
  }

  if (
    typeName === "ZodObject" ||
    typeName === "ZodArray" ||
    typeName === "ZodRecord" ||
    typeName === "ZodUnion" ||
    typeName === "ZodDiscriminatedUnion"
  ) {
    return serializeZodSchema(field) ?? "unknown";
  }

  if (typeName === "ZodEnum") {
    const values = Array.isArray(def.values)
      ? def.values
      : def.entries && typeof def.entries === "object"
        ? Object.values(def.entries)
        : [];
    if (values.length > 0) {
      return values.map((v: string) => `"${v}"`).join(" | ");
    }
  }

  return typeName.replace("Zod", "").toLowerCase() || "unknown";
}

export function serializeEndpoints(
  endpoints: Record<
    string,
    {
      method: string;
      path: string;
      description?: string;
      body?: unknown;
      query?: unknown;
      responses?: Record<number, unknown>;
    }
  > | null,
) {
  if (!endpoints) return null;
  const result: Record<string, Record<string, unknown>> = {};
  for (const [name, ep] of Object.entries(endpoints)) {
    const entry: Record<string, unknown> = {
      method: ep.method,
      path: ep.path,
    };
    if (ep.description) entry["description"] = ep.description;
    const bodySchema = serializeZodSchema(ep.body);
    if (bodySchema) entry["body"] = bodySchema;
    const querySchema = serializeZodSchema(ep.query);
    if (querySchema) entry["query"] = querySchema;
    if (ep.responses) {
      entry["responses"] = Object.fromEntries(
        Object.entries(ep.responses).map(([code, schema]) => [
          code,
          serializeZodSchema(schema),
        ]),
      );
    }
    result[name] = entry;
  }
  return result;
}
