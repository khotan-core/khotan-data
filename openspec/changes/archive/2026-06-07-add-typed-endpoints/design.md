## Context

The Plug class is a scaffolded fetch wrapper (zero khotan-data runtime deps) that users own and edit. It handles auth, retry, pagination, timeouts, and hooks. Today, all HTTP calls use generic type casts (`get<T>()`) with no runtime validation.

The typed endpoints feature layers on top of this: a contract defines the API shape (method, path, params, query, body, response schemas), and a library-provided adapter (`createPlugClient`) bridges that contract to the Plug's execution layer.

Key constraint: the Plug template remains standalone and user-editable. The typed endpoint layer is opt-in — existing untyped `get()`/`post()` methods continue working unchanged.

## Goals / Non-Goals

**Goals:**
- Provide compile-time type safety and autocomplete for endpoint names, request params, and response shapes
- Provide runtime validation (Zod) of both request inputs and API responses
- Support path params (`:id` interpolation), query params, and request bodies
- Support custom content-type parsers (XML, CSV) so non-JSON APIs can still be validated
- Scaffold an example contract file when users run `npx khotan add plug`
- Keep the Plug template's zero-dep, user-owned philosophy intact
- Work with zod v3 AND v4 — no version lock-in

**Non-Goals:**
- GraphQL or SOAP support (future changes)
- Generating contracts from OpenAPI specs (users can use separate tooling)
- Server-side contract fulfillment (we only consume external APIs)
- Paginated endpoint support via `.call()` (users use `.paginate()` directly for that)
- Storing endpoint metadata in the database or exposing it via the factory API handler

## Decisions

### Decision 1: Own contract DSL via `defineContract()`, no external type dependency

**Choice**: Provide a `defineContract()` identity function and our own `Schema` interface + `RouteDefinition` / `ContractRouter` types. No dependency on `@ts-rest/core`.

**History**: The original design used `@ts-rest/core` for contract definition. During implementation, we discovered `@ts-rest/core@3.x` depends on zod v3 internal types (`AnyZodObject`, `ZodEffects`) that don't exist in zod v4. This locked users to zod v3 — an unacceptable constraint since zod v4 is current and widely adopted.

**Alternatives considered**:
- `@ts-rest/core` (original plan) — broken with zod v4 due to internal type dependencies
- Build complex mapped types — what we did, but kept simple (~20 lines of type utilities)
- Wait for `@ts-rest` v4 — unknown timeline, external dependency

**Rationale**: Our `defineContract()` is a zero-dep, `const`-generic identity function that preserves literal types. The `Schema` interface (`{ parse(data: unknown): T }`) works with any validator — zod v3, v4, or custom. The DX is nearly identical to ts-rest's `c.router()`:

```typescript
const contract = defineContract({
  getProduct: {
    method: "GET",
    path: "/products/:id",
    responses: { 200: ProductSchema, 404: ErrorSchema },
  },
});
```

### Decision 2: Adapter lives in the library, not the template

**Choice**: `createPlugClient()` is exported from `khotan-data/plug` (a new subpath export). It is NOT scaffolded into the user's project.

**Rationale**: The adapter is generic glue — it doesn't need user customization. Keeping it in the library means users get bug fixes and improvements via version bumps. The Plug template (auth, retry, hooks) remains the user-owned layer.

### Decision 3: Flat callable functions

**Choice**: `createPlugClient(contract, plug)` returns a flat object where each contract endpoint becomes a directly callable function.

```typescript
const cin7 = createPlugClient(cin7Contract, cin7Plug);
const product = await cin7.getProduct({ params: { id: "123" } });
```

**Alternatives considered**:
- Proxy-based dot access (`api.products.get()`) — harder to debug, complex types, fragile in scaffolded code
- Resource-grouped (`api.products.get()` via nested objects) — adds nesting complexity; users can achieve this with nested `ContractRouter` if desired

**Rationale**: Flat functions are simple to type, simple to debug (real function calls in stack traces), and work perfectly with IDE autocomplete. Nested routers are supported for users who want grouping.

### Decision 4: Content-type parsers on PlugConfig

**Choice**: Add an optional `parsers` field to `PlugConfig`:

```typescript
interface PlugConfig {
  // ... existing fields ...
  parsers?: Record<string, (text: string) => unknown>;
}
```

In `_fetch()`, after receiving a response, check registered parsers by content-type before falling back to `response.text()`. JSON parsing remains built-in (no registration needed).

**Rationale**: Keeps XML/CSV/YAML parsing opt-in without adding dependencies. Users bring their own parser (`fast-xml-parser`, `papaparse`, etc.). The parsed JS object then flows through Zod validation normally.

### Decision 5: Separate path params from query/body in the call signature

**Choice**: The call signature uses explicit named fields: `{ params, query, body, headers }`.

```typescript
await cin7.getProduct({ params: { id: "123" } });
await cin7.listProducts({ query: { page: 1 } });
await cin7.createProduct({ body: { name: "Widget", price: 10 } });
```

**Rationale**: Explicit over implicit. No magic auto-detection of "does this field go in the path or query?" The type system enforces this shape based on the contract definition.

### Decision 6: Response validation behavior

**Choice**: Response validation uses `schema.parse()` (Zod default — strips unknown fields, throws on missing/invalid fields). An optional `validateResponse: false` can be passed per-request or globally to skip validation.

**Rationale**: Stripping unknowns is safe for API responses (APIs add fields over time). Throwing on invalid shapes catches breaking API changes early in the pipeline rather than downstream.

### Decision 7: `zod` as the only optional peer dependency

**Choice**: `zod` (>=3.22.0) is an optional peer dependency. No other type-level dependencies required.

**History**: Originally both `@ts-rest/core` and `zod` were peer deps. After dropping ts-rest (Decision 1), only zod remains.

**Rationale**: Users may already have Zod (common in Next.js projects). Making it a peer dep avoids version conflicts. The `Schema` interface means our types work with either v3 or v4.

### Decision 8: Factory accepts Plug instances directly

**Choice**: `PlugRegistration` requires a `plug:` field containing the actual Plug instance. The factory extracts `baseUrl` and `authType` from the instance's getters.

```typescript
plugs: [
  {
    name: "cin7",
    plug: cin7Plug,
    syncs: [{ name: "products-inflow", type: "inflow", ... }],
  },
]
```

**History**: Originally, `PlugRegistration` had separate `baseUrl` and `authType` string fields, duplicating information already present in the Plug instance.

**Rationale**: The Plug instance is the single source of truth for its configuration. Eliminates duplication and ensures the factory always reflects the actual client configuration. The Plug class exposes `baseUrl` and `authType` getters for this purpose.

### Decision 9: Example contract scaffolded alongside plug.ts

**Choice**: `npx khotan add plug` scaffolds two files:
- `plugs/plug.ts` (existing — the Plug class)
- `plugs/plug.example.ts` (new — example contract + client usage)

The registry entry changes from single-file to multi-file.

**Rationale**: Showing the pattern in context is more useful than docs alone. The example file demonstrates `defineContract` usage with 2-3 endpoints and can be deleted or renamed.

## Risks / Trade-offs

- **[Type inference performance]** → Large contracts (80+ endpoints) can slow TypeScript language server. Mitigation: document splitting contracts across files using nested `ContractRouter`.

- **[Response validation overhead]** → `schema.parse()` on every response adds CPU time. Mitigation: negligible for typical API payloads (< 1ms). Offer `validateResponse: false` escape hatch.

- **[Parsers and Zod shape mismatch for XML]** → XML parsed to JS has different shapes depending on parser config. Mitigation: user responsibility — document that the Zod schema must match the parsed shape, not the raw XML.

- **[Schema interface compatibility]** → Our `Schema` interface expects `.parse()`. Some validators use `.validate()` or other method names. Mitigation: trivial to wrap. Document the interface clearly.
