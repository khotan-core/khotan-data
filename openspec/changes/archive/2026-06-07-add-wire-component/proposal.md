## Why

The existing khotan schema supports a `webhook` sync type, but there is no mechanism to actually programmatically register webhook subscriptions with external services. Users who integrate with APIs that expose a `/webhook` or `/subscription` endpoint (Stripe, Shopify, Pollinate, GitHub, etc.) need a way to create, persist, and tear down those subscriptions. Wire fills this gap — it manages the subscription lifecycle using the Plug component for HTTP and Drizzle for persistence.

## What Changes

- Add a new scaffolded `wire.ts` template — a factory function that uses Plug to call a service's subscription API, persists the result in a `khotan_wires` table, and exposes create/delete/get operations
- Extend the schema template with a `khotan_wires` table for storing active webhook subscriptions
- Extend the `khotan_runs` table to support wire-triggered runs (add nullable `wireId` foreign key alongside existing `syncId`)
- Register `wire` in the CLI registry as a new component with dependencies on `plug` and `schema`
- Scaffold includes commented usage examples and CLI prints post-install usage guidance (consistent with existing components)

## Capabilities

### New Capabilities
- `wire`: Webhook subscription lifecycle management — a scaffolded template that uses Plug to register/deregister webhook subscriptions with external APIs and persists subscription state in the database

### Modified Capabilities
- `schema`: Add `khotan_wires` table and make `khotan_runs.sync_id` nullable to support wire-triggered runs via a new nullable `wire_id` column

## Impact

- `src/cli/templates/schema.ts` — new table definition, modified runs table
- `src/cli/templates/wire.ts` — new template file
- `src/cli/registry.ts` — new component entry for wire
- `src/factory.ts` — internal schema mirror needs the same runs table modification
- Tests for the CLI `add` command, registry, and schema template
