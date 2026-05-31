## Context

khotan/data is a TypeScript package (v0.0.1) that currently ships ETL pipeline primitives (Pipeline builder, extractors, transformers, loaders) with Drizzle integration. It's published to npm and built with tsup.

The package needs to evolve from a library-you-import into a CLI-you-run that scaffolds owned code into the user's project — the shadcn model. Wire is the first component: a self-contained fetch wrapper that handles auth, retry, pagination, and rate limiting for external APIs.

The user's project is a Next.js + Drizzle + Postgres stack. They deal with APIs that have no SDK (or bad SDKs) and currently write bespoke fetch wrappers for each one.

## Goals / Non-Goals

**Goals:**
- CLI with `init` and `add wire` commands that scaffold files into the user's project
- Wire component: a single self-contained `.ts` file with zero runtime dependencies on `khotan-data`
- Wire wraps `fetch()` with pluggable auth strategies, retry, pagination, rate limiting, and timeout
- The scaffolded file is editable and ownable — the user can modify anything
- Wire's `.paginate()` returns `AsyncIterable` so it composes with the existing Pipeline extractors

**Non-Goals:**
- No SDK-specific integrations (no Stripe SDK wrapper, no Linear SDK wrapper) — Wire is for raw APIs
- No credential persistence or encryption — auth credentials are passed in directly (env vars)
- No Vercel Workflow integration — durability comes later
- No OAuth2 authorization code flow — only static auth strategies (bearer, basic, apiKey, custom) for v0
- No OpenAPI spec ingestion or type generation — future CLI feature
- No component registry or remote fetching — templates are bundled in the package
- No React/UI components — Wire is backend-only

## Decisions

### 1. CLI framework: `commander`

**Decision:** Use `commander` for the CLI.

**Rationale:** It's the most widely used Node CLI framework, has zero dependencies of its own worth worrying about, excellent TypeScript support, and is battle-tested. Alternatives like `citty` (lighter) or `cac` (similar) are fine but commander has the largest ecosystem and familiarity. `yargs` is heavier than needed.

### 2. Wire template is fully self-contained

**Decision:** The scaffolded `wire.ts` file imports nothing from `khotan-data` at runtime. All auth strategies, retry logic, pagination helpers, and the `wire()` factory are defined within the single file.

**Rationale:** This is the shadcn model — the component IS the code in your project. If Wire imported from `khotan-data`, the user couldn't edit the implementation without forking the package. Self-containment means the user can change retry logic, add custom auth strategies, or modify pagination behavior directly.

**Trade-off:** The file will be longer (~400-600 lines) than a thin wrapper. But it's readable, documented, and the user never has to look at it unless they want to customize.

### 3. Auth strategies are factory functions returning a common interface

**Decision:** Each auth strategy (`bearer`, `basic`, `apiKey`, `custom`) is a factory function that returns an `AuthStrategy` object with a single method: `apply(request: Request): Request | Promise<Request>`.

**Rationale:** This makes auth swappable and composable. `wire.withAuth(newStrategy)` returns a new wire instance with different auth. The interface is simple enough that users can write custom strategies inline.

```typescript
interface AuthStrategy {
  type: string
  apply(headers: Headers): void | Promise<void>
}
```

### 4. Pagination strategies are factory functions returning async iterables

**Decision:** Each pagination strategy (`cursorPagination`, `offsetPagination`, `keysetPagination`) is a factory function that returns a `PaginationStrategy` object. The wire's `.paginate()` method uses it to iterate through pages, yielding each page's data array.

**Rationale:** `AsyncIterable` is the native JS primitive for lazy sequences. It composes with `for await...of`, with the existing Pipeline extractors, and with any consumer. No custom iterator protocol needed.

### 5. Retry is built into the wire, not a separate wrapper

**Decision:** Retry logic (exponential backoff with jitter, 429 Retry-After awareness, configurable retryable status codes) is built directly into the wire's internal `_fetch` method.

**Rationale:** Retry is not optional for API integrations — it's a core concern. Making it built-in means every request gets it by default. Users can disable it (`retry: false`) or configure it. Extracting retry into a separate wrapper adds indirection without value.

### 6. CLI scaffolding uses simple file copy with string interpolation

**Decision:** Component templates are stored as TypeScript source files within the `khotan-data` package (under `src/cli/templates/`). The CLI reads the template file content and writes it to the user's project, optionally interpolating config values (like the output directory path).

**Rationale:** No need for a template engine. The wire component is a complete `.ts` file — it doesn't need variable substitution beyond maybe the import path. Keeping templates as real `.ts` files means they get type-checked during the package build.

### 7. Config file is minimal for v0

**Decision:** `khotan.config.ts` contains just the output directory and component list. It's a stub that future components (Catch, Inflow, etc.) will extend.

```typescript
export default {
  outputDir: 'src/lib/khotan',
  components: [],
}
```

**Rationale:** The config needs to exist for `add` to know where to put files, but it shouldn't prescribe structure that might change. Keep it minimal — add fields as components need them.

### 8. Platform `fetch` only — no polyfills

**Decision:** Wire uses the global `fetch` API. No `node-fetch`, no `undici`, no polyfills. Requires Node 18+.

**Rationale:** The package already requires Node 18+. Next.js provides `fetch` globally. Adding a fetch dependency would conflict with Next.js's patched fetch (which adds caching semantics). Using the platform `fetch` means Wire works correctly in both Node and edge runtimes.

## Risks / Trade-offs

**[Large single file]** → The wire.ts template will be ~400-600 lines. This is by design (self-contained), but could intimidate users. Mitigation: well-structured with clear sections, good JSDoc comments, and the user never needs to read it unless customizing.

**[Template drift]** → Once scaffolded, the user's wire.ts diverges from the package template. They don't get updates. Mitigation: This is the shadcn model — it's a feature, not a bug. Future CLI could offer `khotan diff wire` to show what changed upstream.

**[No runtime validation]** → Wire uses TypeScript generics for response typing (`wire.get<T>()`) but doesn't validate at runtime. If the API returns unexpected shapes, the user gets runtime errors. Mitigation: This is the standard TypeScript approach. Users can add Zod validation in their wire file if they want runtime safety.

**[Commander dependency]** → Adds a runtime dependency to the package for the CLI. Mitigation: Commander is stable, well-maintained, and already used by shadcn, create-next-app, and countless other CLIs.
