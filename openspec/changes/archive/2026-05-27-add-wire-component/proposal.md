## Why

khotan/data follows the shadcn model — run a CLI command, get code scaffolded into your project that you own and edit. The first component we need is **Wire**: a self-contained fetch wrapper that handles the universal pain points of calling external APIs (auth, retry, pagination, rate limiting). Every developer integrating with APIs that lack good SDKs rewrites this boilerplate. Wire kills it with a single, editable file in their codebase.

Wire is the foundation. Every future khotan component (Catch, Inflow, Outflow) depends on having a reliable, configurable HTTP client for talking to external services.

## What Changes

- Add a CLI with two commands: `npx khotan init` and `npx khotan add wire`
- `init` scaffolds a `khotan.config.ts` stub into the user's project
- `add wire` copies a self-contained `wire.ts` file into the user's project at a configured output path (e.g., `src/lib/khotan/wire.ts`)
- The scaffolded `wire.ts` is a complete, zero-dependency fetch wrapper with:
  - Pluggable auth strategies (bearer, basic, apiKey, custom)
  - Retry with exponential backoff and 429/Retry-After awareness
  - Pagination helpers (cursor, offset, keyset) via async iterables
  - Rate limit handling
  - Timeout support
  - `.withAuth()` for runtime auth swapping (multi-tenant use cases)
  - Typed `get`, `post`, `put`, `patch`, `delete` methods with generics
- The wire.ts file has zero runtime imports from `khotan-data` — it is fully self-contained, just like a shadcn component
- Add `bin` field to `package.json` for the CLI entry point

## Capabilities

### New Capabilities

- `cli`: The khotan CLI with `init` and `add` commands, component registry, and project scaffolding
- `wire`: The Wire component — a self-contained, editable fetch wrapper with auth strategies, retry, pagination, and rate limiting

### Modified Capabilities

_None — no existing specs._

## Impact

- **package.json**: Add `bin` field, add CLI dependencies (e.g., `commander` or `citty` for arg parsing, `prompts` for interactive prompts)
- **New source files**: CLI entry point, CLI commands, wire component template
- **Build config**: tsup needs a CLI entry point that stays as a Node executable (not library bundle)
- **Existing code**: No changes to existing pipeline/transform/drizzle code — Wire is additive
