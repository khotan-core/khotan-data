## 1. Dependencies & Package Config

- [ ] 1.1 Add `zod` and `@ts-rest/core` as peer dependencies in package.json
- [ ] 1.2 Add `zod` and `@ts-rest/core` as dev dependencies (for internal development/testing)
- [ ] 1.3 Add `khotan-data/plug` subpath export to package.json `exports` field
- [ ] 1.4 Update tsup config to build the new `plug` entry point

## 2. Plug Template — Parsers Config

- [ ] 2.1 Add optional `parsers` field to `PlugConfig` interface in `src/cli/templates/plug.ts`
- [ ] 2.2 Update `_fetch()` method to check registered parsers by content-type before text fallback
- [ ] 2.3 Add test for custom parser in `src/cli/templates/plug.test.ts`

## 3. Plug Client Adapter (`createPlugClient`)

- [ ] 3.1 Create `src/plug-client.ts` with the `createPlugClient` function
- [ ] 3.2 Implement path parameter interpolation (replace `:param` segments with provided values)
- [ ] 3.3 Implement request input validation (validate params, query, body against Zod schemas before request)
- [ ] 3.4 Implement request delegation to Plug (map contract endpoint to `plug.request()` call with correct method, path, query, body)
- [ ] 3.5 Implement response validation (parse response through contract's response Zod schema)
- [ ] 3.6 Implement status-code-aware responses (return `{ status, body }` matching ts-rest convention)
- [ ] 3.7 Support `validateResponse: false` option to skip response validation
- [ ] 3.8 Support per-request headers forwarding
- [ ] 3.9 Handle undefined status codes by throwing PlugError (delegate to Plug's existing error handling)
- [ ] 3.10 Export `createPlugClient` from the new `src/plug-client.ts` entry point

## 4. Registry & Scaffolding

- [ ] 4.1 Create `src/cli/templates/plug.example.ts` template showing 2-3 example endpoints with Zod schemas and `createPlugClient` usage
- [ ] 4.2 Update `plug` entry in `src/cli/registry.ts` from single-file to multi-file (add `plug.example.ts`)
- [ ] 4.3 Add `@ts-rest/core` and `zod` to the `plug` component's `dependencies.npmPackages` array
- [ ] 4.4 Update `src/cli/commands/add.ts` usage output to mention the example file when scaffolding plug

## 5. Factory Types

- [ ] 5.1 Add optional `endpoints` field to `PlugRegistration` interface in `src/factory.ts` (metadata only, not consumed by factory logic)

## 6. Tests

- [ ] 6.1 Write unit tests for `createPlugClient` — path interpolation
- [ ] 6.2 Write unit tests for `createPlugClient` — input validation (valid and invalid)
- [ ] 6.3 Write unit tests for `createPlugClient` — response validation (valid, invalid, skip)
- [ ] 6.4 Write unit tests for `createPlugClient` — status-code-aware responses
- [ ] 6.5 Write unit tests for `createPlugClient` — delegates auth/retry to Plug

## 7. Documentation

- [ ] 7.1 Update docs site basic-usage page with the typed endpoints pattern
- [ ] 7.2 Update docs site `src/lib/components-data.ts` Plug component entry with endpoint information
