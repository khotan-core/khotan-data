## Context

The Plug class is a scaffolded fetch wrapper (zero khotan-data runtime deps) that users own and edit. It handles auth, retry, pagination, timeouts, and hooks. Today, all HTTP calls use generic type casts (`get<T>()`) with no runtime validation.

The typed endpoints feature layers on top of this: a ts-rest contract defines the API shape (method, path, params, query, body, response schemas), and a library-provided adapter (`createPlugClient`) bridges that contract to the Plug's execution layer.

Key constraint: the Plug template remains standalone and user-editable. The typed endpoint layer is opt-in — existing untyped `get()`/`post()` methods continue working unchanged.

## Goals / Non-Goals

**Goals:**
- Provide compile-time type safety and autocomplete for endpoint names, request params, and response shapes
- Provide runtime validation (Zod) of both request inputs and API responses
- Support path params (`:id` interpolation), query params, and request bodies
- Support custom content-type parsers (XML, CSV) so non-JSON APIs can still be validated
- Scaffold an example contract file when users run `npx khotan add plug`
- Keep the Plug template's zero-dep, user-owned philosophy intact

**Non-Goals:**
- GraphQL or SOAP support (future changes)
- Generating ts-rest contracts from OpenAPI specs (users can use ts-rest's own tooling)
- Server-side contract fulfillment (we only consume external APIs)
- Paginated endpoint support via `.call()` (users use `.paginate()` directly for that)
- Storing endpoint metadata in the database or exposing it via the factory API handler

## Decisions

### Decision 1: Use `@ts-rest/core` for contract definition, not custom types

**Choice**: Depend on `@ts-rest/core` for the contract definition and type inference layer.

**Alternatives considered**:
- Build custom mapped types (Option B) — ~80 lines of TypeScript type gymnastics, but fragile, hard to maintain, and reimplements what ts-rest already does
- Use oRPC contract (`@orpc/contract`) — more RPC-oriented, doesn't map cleanly to "I'm calling an existing REST API at specific paths"

**Rationale**: ts-rest's `initContract()` + `c.router()` is purpose-built for describing REST APIs with Zod. It handles path param extraction from `:param` syntax, status-code-discriminated responses, and full type inference. Using it avoids maintaining complex conditional types. It's 5kb, MIT, actively maintained, and the contract package has no heavy dependencies.

### Decision 2: Adapter lives in the library, not the template

**Choice**: `createPlugClient()` is exported from `khotan-data/plug` (a new subpath export). It is NOT scaffolded into the user's project.

**Rationale**: The adapter is generic glue — it doesn't need user customization. Keeping it in the library means users get bug fixes and improvements via version bumps. The Plug template (auth, retry, hooks) remains the user-owned layer.

### Decision 3: Flat callable functions (Approach 2)

**Choice**: `createPlugClient(contract, plug)` returns a flat object where each contract endpoint becomes a directly callable function.

```typescript
const cin7 = createPlugClient(cin7Contract, cin7Plug);
const product = await cin7.getProduct({ params: { id: "123" } });
```

**Alternatives considered**:
- Proxy-based dot access (`api.products.get()`) — harder to debug, complex types, fragile in scaffolded code
- Resource-grouped (`api.products.get()` via nested objects) — adds nesting complexity; users can achieve this with ts-rest's nested `c.router()` if desired

**Rationale**: Flat functions are simple to type, simple to debug (real function calls in stack traces), and work perfectly with IDE autocomplete. ts-rest's contract already supports nested routers for users who want grouping.

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

**Choice**: The call signature matches ts-rest's convention: `{ params, query, body, headers }`.

```typescript
await cin7.getProduct({ params: { id: "123" } });
await cin7.listProducts({ query: { page: 1 } });
await cin7.createProduct({ body: { name: "Widget", price: 10 } });
```

**Rationale**: Explicit over implicit. No magic auto-detection of "does this field go in the path or query?" ts-rest already enforces this shape, so we get it for free.

### Decision 6: Response validation behavior

**Choice**: Response validation uses `schema.parse()` (Zod default — strips unknown fields, throws on missing/invalid fields). An optional `validateResponse: false` can be passed to skip validation for debugging.

**Rationale**: Stripping unknowns is safe for API responses (APIs add fields over time). Throwing on invalid shapes catches breaking API changes early in the pipeline rather than downstream.

### Decision 7: `@ts-rest/core` and `zod` as peer dependencies

**Choice**: Both are peer dependencies, same as `drizzle-orm` today.

**Rationale**: Users may already have Zod (common in Next.js projects). Making it a peer dep avoids version conflicts. `@ts-rest/core` is lightweight and only needed if users want typed endpoints.

### Decision 8: Example contract scaffolded alongside plug.ts

**Choice**: `npx khotan add plug` scaffolds two files:
- `plug.ts` (existing — the Plug class)
- `plug.example.ts` (new — example contract + client usage)

The registry entry changes from single-file to multi-file.

**Rationale**: Showing the pattern in context is more useful than docs alone. The example file demonstrates defineEndpoints usage with 2-3 endpoints and can be deleted or renamed.

## Risks / Trade-offs

- **[ts-rest maintenance]** → ts-rest is actively maintained (v3.53, June 2025 RC). If it stalls, the contract definition is just types — we could fork or replace the type utilities without changing user-facing API. Mitigation: the adapter is thin (~80 LOC), easy to swap the type source.

- **[Peer dep burden]** → Users must install `@ts-rest/core` and `zod` to use typed endpoints. Mitigation: both are opt-in. The Plug class works without them. The CLI can auto-install when scaffolding.

- **[Type inference performance]** → Large contracts (80+ endpoints) can slow TypeScript language server (~2s autocomplete per reports). Mitigation: document splitting contracts across files using ts-rest's nested routers.

- **[Response validation overhead]** → Zod.parse() on every response adds CPU time. Mitigation: negligible for typical API payloads (< 1ms). Offer `validateResponse: false` escape hatch.

- **[Parsers and Zod shape mismatch for XML]** → XML parsed to JS has different shapes depending on parser config. Mitigation: user responsibility — document that the Zod schema must match the parsed shape, not the raw XML.
