## 1. Cache registration and runtime contract

- [ ] 1.1 Add cache registration types to `src/factory.ts`, including top-level `caches` support on `KhotanConfig`
- [ ] 1.2 Implement configuration-time validation for cache names and declared scope references to registered plugs, resources, and flows
- [ ] 1.3 Extend initialization logic to upsert registered cache definitions into runtime state with idempotent behavior

## 2. Cache persistence and access paths

- [ ] 2.1 Extend the adapter contract and Drizzle adapter with cache-definition and cache-entry read/write/delete operations
- [ ] 2.2 Add handler routes for cache entry lookup, upsert, and delete using the standard khotan runtime path
- [ ] 2.3 Add programmatic factory helpers for cache access so application code can operate on cache entries without raw HTTP requests
- [ ] 2.4 Add TTL-aware cache read behavior that treats expired entries as misses and supports manual busting

## 3. Workflow integration

- [ ] 3.1 Expose workflow-safe cache helpers to flow execution contexts
- [ ] 3.2 Expose workflow-safe cache helpers to relay, catch, and pass execution contexts
- [ ] 3.3 Add focused tests covering expensive snapshot-style reads, dedupe-marker writes, and cache busting from workflow code

## 4. Schema and scaffolding

- [ ] 4.1 Add internal runtime schema definitions for `khotan_caches` and `khotan_cache_entries`
- [ ] 4.2 Add generated Drizzle schema support, relations, indexes, and exported cache type helpers in the schema template
- [ ] 4.3 Add a `cache` registry entry with required dependencies and scaffold metadata
- [ ] 4.4 Create cache scaffold templates that generate a reusable builder file and example registration file
- [ ] 4.5 Add or update CLI scaffolding tests covering `npx khotan add cache`

## 5. Verification and documentation

- [ ] 5.1 Add runtime tests covering cache registration validation, idempotent init, handler operations, and latest-value overwrite semantics
- [ ] 5.2 Add runtime tests covering expiry behavior for TTL-backed caches and safe deletion of missing keys
- [ ] 5.3 Update package documentation and examples to show how cache is scaffolded, registered in `khotan.ts`, and used from sync workloads
