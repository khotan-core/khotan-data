## 1. Factory Core

- [x] 1.1 Create `src/factory.ts` with `khotan()` factory function, `drizzleAdapter()`, and `toNextJsHandler()` exports
- [x] 1.2 Implement `drizzleAdapter(db)` — wraps Drizzle instance with methods to query/upsert khotan_plugs, khotan_syncs, khotan_runs
- [x] 1.3 Implement plug registration validation — accept plug configs with syncs, throw on duplicate names
- [x] 1.4 Implement `init()` — upsert registered plugs and syncs into the database with conflict-on-name logic and module-level initialized guard
- [x] 1.5 Implement API handler routing — parse path segments and route to list plugs, get plug, list syncs, list runs, 404 fallback
- [x] 1.6 Implement `toNextJsHandler(handler)` — wrap the handler into `{ GET, POST, PUT, DELETE }` exports that strip the base path prefix
- [x] 1.7 Write tests for factory: registration validation, upsert logic, handler routing, NextJS adapter

## 2. Package Exports

- [x] 2.1 Add `khotan-data/factory` subpath export to `package.json` (import/require/types)
- [x] 2.2 Add `factory` entry to `tsup.config.ts` library entries
- [x] 2.3 Verify `drizzle-orm` peer dependency covers factory usage

## 3. CLI Templates

- [x] 3.1 Create `src/cli/templates/hub.tsx` — React client component using shadcn Card, Badge, Table, Switch; fetches from `/api/khotan/plugs`; handles loading, error, and empty states
- [x] 3.2 Create `src/cli/templates/khotan-route.ts` — catch-all route template that imports user config and exports `{ GET, POST, PUT, DELETE }` via `toNextJsHandler`
- [x] 3.3 Create `src/cli/templates/khotan-config.ts` — user config template that imports `khotan` and `drizzleAdapter`, includes example plug registration with comments, exports khotan instance

## 4. CLI Schema Path Detection

- [x] 4.1 Add `resolveDrizzleSchemaDir()` function to CLI — reads `drizzle.config.ts`, extracts schema directory from common path formats (string, glob)
- [x] 4.2 Update `add schema` logic in `add.ts` — use detected Drizzle schema dir, fall back to prompting user, output `khotan.ts` (renamed from `schema.ts`) in the detected directory
- [x] 4.3 Write tests for Drizzle config detection — test string paths, glob patterns, missing config, unparseable config

## 5. CLI Hub Component Registration

- [x] 5.1 Update `registry.ts` — add `hub` component entry with multi-file output support (hub.tsx, route, config)
- [x] 5.2 Update `add.ts` — support multi-file components: iterate files, resolve output paths (components dir for hub, app dir for route, outputDir for config), handle per-file overwrite prompts
- [x] 5.3 Add shadcn detection — check for `components.json` before scaffolding hub, print warning if missing
- [x] 5.4 Update `tsup.config.ts` onSuccess — copy hub.tsx, khotan-route.ts, khotan-config.ts templates to dist/templates

## 6. CLI Tests

- [x] 6.1 Write CLI tests for `add hub` — verify all three files are created in correct locations, test overwrite prompts, test shadcn missing warning
- [x] 6.2 Write CLI tests for `add schema` with Drizzle detection — verify schema placed in detected dir, verify prompt fallback, verify re-export hint uses correct path
