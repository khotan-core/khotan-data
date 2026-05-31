## Why

When syncing the same entity type (e.g. products, orders) from multiple external services, there is no way to cross-reference records across sources. A Shopify product and a Cin7 product that represent the same physical item have no link. This makes enrichment transforms impossible — you can't look up "what is the Cin7 ID for this Shopify product?" during an ETL pipeline. Resources and mappings are the missing layer that connects data flows to logical entity types and stores per-entity cross-references.

## What Changes

- Add a `khotan_resources` table — a named logical entity type (e.g. "products", "orders") with a `connect_field` (the field name used to match records across sources, e.g. "sku").
- Add a `khotan_mappings` table — one row per unique entity instance within a resource. Stores the connecting value (e.g. the actual SKU), a `refs` JSONB column holding external IDs keyed by plug name, and a `metadata` JSONB column for useful contextual fields (e.g. product name).
- Add an optional `resource` field to sync registrations so syncs can declare which resource they feed.
- Add a nullable `resource_id` FK on `khotan_syncs` to link syncs to their resource.
- Extend the factory to upsert resources on init (alongside plugs and syncs).
- Extend the adapter interface with methods for CRUD on resources and mappings.
- Add API routes for resources and mappings (list, get, create/upsert, delete).
- Update the schema template with the new tables, relations, indexes, and type helpers.

## Capabilities

### New Capabilities
- `resource-mappings`: Resources and mappings tables, adapter methods, API routes, and config registration for cross-referencing entities across syncs/plugs.

### Modified Capabilities
- `schema`: Add `khotan_resources` and `khotan_mappings` tables, relations, indexes, and type helpers to the scaffolded schema.
- `factory`: Extend config types to accept `resources` array, upsert resources on init, add adapter methods for resources/mappings, add API handler routes.

## Impact

- **Schema template** (`src/cli/templates/schema.ts`): Two new tables, updated relations, new type exports.
- **Factory** (`src/factory.ts`): Internal schema additions, new adapter interface methods, new handler routes, config type changes.
- **Config template** (`src/cli/templates/khotan-config.ts`): Updated example showing resource registration.
- **Users**: Existing users will need to regenerate their schema and run a new Drizzle migration after upgrading. No breaking changes to existing tables — purely additive.
