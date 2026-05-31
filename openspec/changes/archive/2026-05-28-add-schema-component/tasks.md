## 1. Schema Template

- [x] 1.1 Create `src/cli/templates/schema.ts` — self-contained Drizzle schema with `khotan_plugs`, `khotan_syncs`, `khotan_runs` tables, relations, indexes, and type helpers. Imports only from `drizzle-orm/pg-core` and `drizzle-orm`.
- [x] 1.2 Write tests for the schema template — verify it exports all three tables, relations, type helpers, and compiles without errors. Verify no imports from `khotan-data`.

## 2. CLI Integration

- [x] 2.1 Add `schema` entry to `src/cli/registry.ts` — name, description, template path, output file
- [x] 2.2 Update `tsup.config.ts` `onSuccess` — copy `schema.ts` template to `dist/templates/` alongside `plug.ts`
- [x] 2.3 Update the add command's usage hint in `src/cli/commands/add.ts` — when component is `schema`, print Drizzle re-export instructions instead of plug usage example

## 3. Testing

- [x] 3.1 Add CLI test for `add schema` — verify file is created at correct path, contains all three table definitions, has no khotan-data imports
- [x] 3.2 Build and run full test suite — verify existing plug tests still pass, new schema tests pass
