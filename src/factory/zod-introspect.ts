// ---------------------------------------------------------------------------
// Zod introspection — best-effort, non-load-bearing serialization of Zod
// schemas for the debug UI. Reaches into private _def/def/typeName internals
// across Zod 3 and 4.
// ---------------------------------------------------------------------------

// Loosely-typed view of Zod's private internals. The shapes of `_def`/`def`
// vary across Zod 3 and 4, so every field is optional/unknown and narrowed at
// the use site with runtime `typeof` checks.
interface ZodDefLike {
  typeName?: unknown;
  type?: unknown;
  innerType?: unknown;
  element?: unknown;
  shape?: unknown;
  values?: unknown;
  entries?: unknown;
}

interface ZodLike {
  _def?: ZodDefLike;
  def?: ZodDefLike;
  shape?: unknown;
}

function asZodLike(value: unknown): ZodLike | null {
  return typeof value === "object" && value !== null ? value : null;
}

function zodTypeName(def: ZodDefLike | undefined): string {
  if (typeof def?.typeName === "string") return def.typeName;
  if (typeof def?.type === "string") {
    return `Zod${def.type.charAt(0).toUpperCase()}${def.type.slice(1)}`;
  }
  return "";
}

function zodInner(def: ZodDefLike | undefined): unknown {
  return (
    def?.innerType ??
    def?.element ??
    (typeof def?.type === "object" ? def.type : null) ??
    null
  );
}

export function serializeZodSchema(
  schema: unknown,
): Record<string, unknown> | null {
  const zod = asZodLike(schema);
  if (!zod) return null;
  try {
    const def = zod._def ?? zod.def ?? undefined;
    const rawTypeName = zodTypeName(def);
    const inner = zodInner(def);

    if (
      (rawTypeName === "ZodOptional" || rawTypeName === "ZodNullable") &&
      inner
    ) {
      return serializeZodSchema(inner);
    }

    const shape =
      typeof zod.shape === "function"
        ? (zod.shape as () => unknown)()
        : (zod.shape ??
          (typeof def?.shape === "function"
            ? (def.shape as () => unknown)()
            : def?.shape));
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

export function serializeZodField(
  field: unknown,
): string | Record<string, unknown> {
  const zod = asZodLike(field);
  const def = zod?._def ?? zod?.def ?? undefined;
  if (!def) return "unknown";
  const typeName = zodTypeName(def);
  const inner = zodInner(def);

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
    const values: unknown[] = Array.isArray(def.values)
      ? (def.values as unknown[])
      : def.entries && typeof def.entries === "object"
        ? Object.values(def.entries)
        : [];
    if (values.length > 0) {
      return values.map((v) => `"${String(v)}"`).join(" | ");
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
