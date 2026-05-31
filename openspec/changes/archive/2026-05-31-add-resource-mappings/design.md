## Context

khotan-data currently models external service connections as plugs, with syncs as named data flows under each plug, and runs as execution records per sync. There is no concept linking syncs that operate on the same logical entity type. When multiple plugs sync the same kind of data (e.g. products from Shopify and Cin7), there is no way to cross-reference records — you can't answer "what is the Cin7 product ID for Shopify product X?" during a transform step.

The schema, factory, and config template all need to be extended. The pattern follows existing conventions: config-defined, upserted to DB on init, exposed via the catch-all API route.

## Goals / Non-Goals

**Goals:**
- Introduce a `khotan_resources` table to represent logical entity types (products, orders, etc.)
- Introduce a `khotan_mappings` table to store per-entity cross-references with external IDs and metadata
- Allow syncs to declare which resource they feed via config
- Expose CRUD API routes for resources and mappings
- Enable transform steps to look up cross-references during ETL (query by plug name + external ID)

**Non-Goals:**
- Automatic mapping creation during sync runs (will be a future change that wires Pipeline to mappings)
- Conflict resolution or merge strategies when multiple sources disagree on metadata
- Canonical ID generation — mappings use the connecting field value as the natural key, not a synthetic canonical ID
- Hub UI changes to visualize resources and mappings (future work)
- Composite connecting fields (multi-column matching) — single field only for now

## Decisions

### Decision: One mapping row per entity instance, not per pair

Each unique entity (identified by `connect_value` within a resource) gets one row in `khotan_mappings`. External IDs from all sources are stored in a single `refs` JSONB column keyed by plug name.

**Alternative considered**: Pairwise mapping rows (one row per source-target pair). Rejected because it grows quadratically with N sources, requires multiple joins to resolve cross-references, and makes the common query ("given Shopify ID X, what's the Cin7 ID?") a two-hop lookup.

**Example mapping row:**
```json
{
  "connect_value": "SKU-BLUE-WIDGET",
  "refs": { "shopify": "prod_123", "cin7": "P-456" },
  "metadata": { "name": "Blue Widget", "category": "widgets" }
}
```

### Decision: `refs` keyed by plug name

The `refs` JSONB keys are plug names (e.g. `"shopify"`, `"cin7"`), not sync names or arbitrary labels. This keeps lookups simple (`refs->>'shopify'`), aligns with the plug as the unit of external identity, and avoids ambiguity when a plug has multiple syncs for the same resource.

**Alternative considered**: Key by sync name. Rejected because a plug represents the external system, and external IDs belong to the system, not to a specific data flow.

### Decision: Resource is a DB table, not just config

Resources are persisted to `khotan_resources` and upserted on init, following the same pattern as plugs and syncs. This gives resources a stable ID for FK relationships, makes them queryable via the API, and prepares for future Hub visualization.

**Alternative considered**: Resource as config-only (just a name string on mappings). Rejected because the user wants rigid tables for visualization, and a real table lets us hang resource-level settings later (merge strategy, staleness thresholds).

### Decision: Syncs get a nullable `resource_id` FK

Syncs declare their resource via a `resource` string in config registration. On init, after upserting the resource, the factory resolves the name to an ID and sets `resource_id` on the sync row. The FK is nullable so existing syncs without a resource continue to work.

### Decision: Connecting field is a single text value on the resource

Each resource has a `connect_field` text column (e.g. `"sku"`, `"order_number"`). This names the field used to match records across sources. Composite keys are out of scope for now — a single field covers the vast majority of use cases.

### Decision: API routes follow existing pattern

New routes are added to the catch-all handler under the existing segment-matching approach:

| Route | Method | Description |
|-------|--------|-------------|
| `.../resources` | GET | List all resources with sync/mapping counts |
| `.../resources/:id` | GET | Get resource with associated syncs |
| `.../resources/:id/mappings` | GET | List mappings for a resource |
| `.../mappings` | POST | Create or upsert a mapping |
| `.../mappings/:id` | GET | Get a single mapping |
| `.../mappings/:id` | PUT | Update a mapping |
| `.../mappings/:id` | DELETE | Delete a mapping |
| `.../mappings/lookup` | POST | Look up a mapping by resource + plug + ref |

The lookup endpoint is the key query for transforms: "given resource=products, plug=shopify, ref=prod_123, return the mapping row."

## Risks / Trade-offs

**GIN index on `refs` JSONB** — A GIN index enables fast lookups on `refs` keys/values but adds write overhead. For the expected write volume (mapping upserts during syncs), this is acceptable. If write-heavy workloads emerge, the index can be dropped. → Mitigation: Start with a GIN index; document that users can drop it if writes become a bottleneck.

**JSONB `refs` vs typed columns** — JSONB is flexible but loses column-level type safety and requires `->>`  operator syntax in queries. → Mitigation: The adapter methods abstract this away; users query via API or adapter, not raw SQL.

**Nullable `resource_id` on syncs** — Existing syncs without resources get null. This is correct but means the model doesn't enforce "every sync should have a resource." → Mitigation: This is intentional — resources are opt-in. Not every sync needs cross-referencing.

**Schema migration for existing users** — Adding two tables and a nullable column to syncs requires a Drizzle migration. → Mitigation: All changes are additive (new tables, nullable column). No data migration needed. Users run `npx drizzle-kit generate` and `npx drizzle-kit migrate` as usual.
