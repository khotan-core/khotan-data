## Why

The Plug class provides HTTP methods (`get<T>()`, `post<T>()`, etc.) that return untyped responses — the generic `T` is a trust-me cast with no runtime validation. Developers manually construct paths as strings and pass untyped params. This means typos are silent, response shape mismatches are undetectable until runtime, and there's no autocomplete for available API operations. Adding typed endpoint definitions with Zod schemas gives compile-time safety, runtime validation in both directions, and IDE autocomplete for endpoint names and parameters.

## What Changes

- Add `@ts-rest/core` as a peer dependency (contract definition and type inference)
- Add `zod` as a peer dependency (schema validation)
- Create a new `khotan-data/plug` subpath export with a `createPlugClient()` adapter function
- The adapter takes a ts-rest contract + Plug instance and returns a typed client where each endpoint is a callable function
- Add an optional `parsers` field to `PlugConfig` for custom content-type parsing (XML, CSV, etc.)
- Update the `plug` component in the registry to scaffold an example contract file alongside `plug.ts`
- Update `PlugRegistration` in factory.ts to accept an optional `endpoints` metadata field (documentation only, not consumed by the factory)

## Capabilities

### New Capabilities
- `plug-client`: Typed endpoint client adapter that bridges ts-rest contracts with the Plug execution layer. Provides `createPlugClient()` function, content-type parser support, and the `khotan-data/plug` subpath export.

### Modified Capabilities
- `plug`: Add optional `parsers` config field to PlugConfig for custom content-type parsing
- `registry`: Add example contract file to the `plug` component scaffolding

## Impact

- **Dependencies**: `@ts-rest/core` and `zod` added as peer dependencies alongside `drizzle-orm`
- **Package exports**: New `khotan-data/plug` subpath export in package.json
- **CLI templates**: New `plug.example.ts` template file scaffolded by `npx khotan add plug`
- **Factory types**: `PlugRegistration` gains an optional `endpoints` field (non-breaking)
- **Plug template**: `PlugConfig` gains an optional `parsers` field; `_fetch()` checks parsers before falling back to text (non-breaking)
- **Docs site**: Basic usage page and components-data updated with the endpoint pattern
