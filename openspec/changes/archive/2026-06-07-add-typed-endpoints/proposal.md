## Why

The Plug class provides HTTP methods (`get<T>()`, `post<T>()`, etc.) that return untyped responses — the generic `T` is a trust-me cast with no runtime validation. Developers manually construct paths as strings and pass untyped params. This means typos are silent, response shape mismatches are undetectable until runtime, and there's no autocomplete for available API operations. Adding typed endpoint definitions with Zod schemas gives compile-time safety, runtime validation in both directions, and IDE autocomplete for endpoint names and parameters.

## What Changes

- Add `zod` as an optional peer dependency (schema validation, works with v3 and v4)
- Create a new `khotan-data/plug` subpath export with `defineContract()` and `createPlugClient()`
- `defineContract()` provides a zero-dep contract DSL using our own `Schema` interface (no `@ts-rest/core`)
- `createPlugClient()` takes a contract + Plug instance and returns a typed client where each endpoint is a callable function
- Add an optional `parsers` field to `PlugConfig` for custom content-type parsing (XML, CSV, etc.)
- Add `baseUrl` and `authType` getters to the Plug class
- Change `PlugRegistration` to require a `plug:` instance (factory extracts metadata from the instance)
- Update the `plug` component in the registry to scaffold an example contract file alongside `plug.ts`

## Capabilities

### New Capabilities
- `plug-client`: Typed endpoint client adapter with `defineContract()` and `createPlugClient()`. Provides a `Schema` interface compatible with any validator that has `.parse()`. Exported from `khotan-data/plug`.

### Modified Capabilities
- `plug`: Add `baseUrl`/`authType` getters. Add optional `parsers` config field for custom content-type parsing.
- `factory`: `PlugRegistration` now requires a `plug` instance instead of separate `baseUrl`/`authType` fields. The Plug instance is the single source of truth.
- `registry`: Add example contract file to the `plug` component scaffolding. Dependency is `zod` only (no `@ts-rest/core`).

## Impact

- **Dependencies**: Only `zod` as an optional peer dependency (no `@ts-rest/core`). Works with zod v3 and v4.
- **Package exports**: New `khotan-data/plug` subpath export in package.json
- **CLI templates**: New `plug.example.ts` template file scaffolded by `npx khotan add plug`
- **Factory types**: `PlugRegistration` replaces `baseUrl`/`authType` with `plug: { baseUrl: string; authType: string }` (**breaking** for existing configs)
- **Plug template**: `PlugConfig` gains optional `parsers` field; Plug class gains `baseUrl`/`authType` getters; `_fetch()` checks parsers before text fallback
- **Docs site**: Basic usage page and components-data updated with the endpoint pattern
