## Why

Flows, relays, and passes sometimes need to fetch large upstream datasets or hold sync-state that is expensive to recompute, but khotan does not currently offer a first-class cache surface for that work. Users need a durable, queryable way to store expensive fetch results, checkpoints, and dedupe state inside khotan rather than overloading mappings, plug vars, or ad hoc application tables.

## What Changes

- Add a first-class `cache` capability that can be scaffolded, customized, and registered in `khotan.ts`
- Extend the factory runtime to register cache definitions, upsert them into standard khotan tables, and expose programmatic and handler-level cache operations
- Add workflow-facing cache helpers so flows, relays, catches, and passes can read, write, bust, and TTL-check cache state during execution
- Add schema support for durable cache definitions and cache entries with explicit scope and optional expiry metadata
- Add registry support for a scaffoldable `cache` component that follows the same owned-code pattern as other khotan components

## Capabilities

### New Capabilities
- `cache`: First-class durable cache definitions and cache-entry operations for expensive sync workloads, checkpoints, and dedupe state

### Modified Capabilities
- `factory`: Add cache registration, validation, programmatic helpers, handler routes, and workflow context access
- `registry`: Add a `cache` scaffold target and its generation metadata
- `schema`: Add durable cache tables, indexes, relations, and exported types

## Impact

- **Runtime**: `src/factory.ts` types, init order, adapter contract, handler routing, and workflow context construction
- **Scaffolding**: `src/cli/registry.ts` plus new cache templates under `src/cli/templates/`
- **Schema**: internal runtime schema mirror and generated Drizzle schema template
- **Developer UX**: new `khotan.ts` registration surface for cache definitions used by flows, relays, passes, and catches
