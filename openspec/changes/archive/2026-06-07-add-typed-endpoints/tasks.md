## 1. Dependencies & Package Config

- [x] 1.1 Add `zod` as an optional peer dependency in package.json
- [x] 1.2 Add `zod` as a dev dependency (for internal development/testing)
- [x] 1.3 Add `khotan-data/plug` subpath export to package.json `exports` field
- [x] 1.4 Update tsup config to build the new `plug-client` entry point

## 2. Plug Template — Parsers Config

- [x] 2.1 Add optional `parsers` field to `PlugConfig` interface in `src/cli/templates/plug.ts`
- [x] 2.2 Update `_fetch()` method to check registered parsers by content-type before text fallback
- [x] 2.3 Add test for custom parser in `src/cli/templates/plug.test.ts`

## 3. Plug Template — Getters

- [x] 3.1 Add `baseUrl` getter to Plug class (returns `config.baseUrl`)
- [x] 3.2 Add `authType` getter to Plug class (returns `config.auth?.type ?? "none"`)
- [x] 3.3 Add unit tests for the getters

## 4. Plug Client Adapter (`createPlugClient`)

- [x] 4.1 Create `src/plug-client.ts` with `Schema` interface, `RouteDefinition`, `ContractRouter` types
- [x] 4.2 Implement `defineContract()` — const-generic identity function for type narrowing
- [x] 4.3 Implement `createPlugClient()` function
- [x] 4.4 Implement path parameter interpolation (replace `:param` segments with provided values)
- [x] 4.5 Implement request input validation (validate params, query, body against schemas before request)
- [x] 4.6 Implement request delegation to Plug (map contract endpoint to `plug.request()` call)
- [x] 4.7 Implement response validation (parse response through contract's response schema)
- [x] 4.8 Implement status-code-aware responses (return `{ status, body }`)
- [x] 4.9 Support `validateResponse: false` option (per-request and global)
- [x] 4.10 Support per-request headers forwarding
- [x] 4.11 Handle undefined status codes by re-throwing PlugError
- [x] 4.12 Export `createPlugClient`, `defineContract`, `Schema`, `PlugLike` from the entry point

## 5. Registry & Scaffolding

- [x] 5.1 Create `src/cli/templates/plug.example.ts` — example contract using `defineContract` + `createPlugClient`
- [x] 5.2 Update `plug` entry in `src/cli/registry.ts` from single-file to multi-file (add `plug.example.ts`)
- [x] 5.3 Add `zod` to the `plug` component's `dependencies.npmPackages` array (removed `@ts-rest/core`)
- [x] 5.4 Update `src/cli/commands/add.ts` to mention the example file when scaffolding plug

## 6. Factory — Plug Instance Registration

- [x] 6.1 Change `PlugRegistration` interface: replace `baseUrl`/`authType` fields with `plug: { baseUrl: string; authType: string }`
- [x] 6.2 Update factory `doInit()` to extract `baseUrl`/`authType` from `plug.plug`
- [x] 6.3 Update all factory tests to use new `plug:` registration format
- [x] 6.4 Remove support for metadata-only plug registrations

## 7. Removed `@ts-rest/core` Dependency

- [x] 7.1 Remove `@ts-rest/core` from peerDependencies
- [x] 7.2 Remove `@ts-rest/core` from devDependencies
- [x] 7.3 Remove `@ts-rest/core` from tsup externals
- [x] 7.4 Remove `@ts-rest/core` from plug registry npmPackages

## 8. Tests

- [x] 8.1 Unit tests for `createPlugClient` — path interpolation (single, multiple, encoding)
- [x] 8.2 Unit tests for `createPlugClient` — input validation (valid and invalid query/body)
- [x] 8.3 Unit tests for `createPlugClient` — response validation (valid, invalid, strip unknowns, skip)
- [x] 8.4 Unit tests for `createPlugClient` — status-code-aware responses (200, 404, undefined)
- [x] 8.5 Unit tests for `createPlugClient` — delegates auth/retry to Plug
- [x] 8.6 Unit tests for Plug getters (baseUrl, authType with/without auth)
- [x] 8.7 All 96 tests passing (18 plug-client + 48 factory + 30 plug template)

## 9. Integration Verification (brs-khotan-connector)

- [x] 9.1 Build khotan-data + deploy to test app via npm pack
- [x] 9.2 Scaffold plug via CLI (`npx khotan add plug --force`)
- [x] 9.3 Update khotan config to use `plug:` instances
- [x] 9.4 Update contract to use `defineContract` (from `khotan-data/plug`)
- [x] 9.5 Type-check passes with zod v4.4.3 (zero errors)
- [x] 9.6 Runtime verification: `/api/khotan/plugs` returns all 3 plugs with correct baseUrl/authType
- [x] 9.7 Runtime verification: `/api/test-typed` passes all assertions (endpoints callable, path interpolation, delegation, input validation)

## 10. Documentation

- [x] 10.1 Update docs site basic-usage page with the typed endpoints pattern
- [x] 10.2 Update docs site `src/lib/components-data.ts` Plug component entry with endpoint information
