## Why

khotan/data needs a data layer for the Hub and future flow components (Inflow, Outflow, Relay) to read from. The Plug component handles HTTP communication, but there's no way for the system to track which plugs exist, what syncs are configured, or what happened during a run. Without a schema, the Hub has nothing to display and flows have nowhere to record their execution history.

The schema is the bridge between code-level plug configuration and the operational state that the Hub UI reads.

## What Changes

- Add a new CLI component `schema` — `npx khotan add schema` scaffolds a self-contained Drizzle schema file into the user's project
- The schema defines three tables in a hierarchy:
  - `khotan_plugs` — one row per configured external service connection (name, base URL, auth type, status, enabled)
  - `khotan_syncs` — one row per data flow tied to a plug (inflow, outflow, relay, webhook), with schedule and status tracking
  - `khotan_runs` — one row per execution of a sync, with full stats (extracted, created, updated, deleted, failed counts, duration, error)
- The schema file is self-contained Drizzle table definitions using `pgTable` — no runtime imports from `khotan-data`
- The file follows the shadcn model: scaffolded into the user's project, user owns it, user can edit it
- Register `schema` in the CLI component registry alongside `plug`

## Capabilities

### New Capabilities

- `schema`: The khotan Drizzle schema component — three tables (plugs, syncs, runs) that back the Hub and all flow components

### Modified Capabilities

- `cli`: Add `schema` to the component registry so `npx khotan add schema` works

## Impact

- **CLI registry**: Add `schema` entry with template path and output file
- **New template file**: `src/cli/templates/schema.ts` — the Drizzle schema template
- **tsup config**: Copy `schema.ts` template to dist alongside `plug.ts`
- **User's project**: After running `npx khotan add schema`, a schema file is created that the user re-exports from their Drizzle schema barrel file
- **Dependencies**: The schema template imports from `drizzle-orm/pg-core` — user must have `drizzle-orm` installed (already a peer dep)
