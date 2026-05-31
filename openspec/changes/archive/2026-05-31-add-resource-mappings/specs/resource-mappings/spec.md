## ADDED Requirements

### Requirement: khotan_resources table
The schema SHALL define a `khotan_resources` Drizzle table with the following columns: `id` (text, primary key, default UUID), `name` (text, unique, not null), `connect_field` (text, not null — the field name used to match records across sources, e.g. "sku"), `description` (text, nullable), `created_at` (timestamp with timezone, default now), `updated_at` (timestamp with timezone, default now).

#### Scenario: Table has correct columns and defaults
- **WHEN** the schema file is loaded by Drizzle
- **THEN** the `khotan_resources` table SHALL have all specified columns with their types and defaults
- **AND** `id` SHALL auto-generate a UUID via `$defaultFn`
- **AND** `name` SHALL have a unique constraint

#### Scenario: Resource names are unique
- **WHEN** two resources are inserted with the same `name`
- **THEN** the database SHALL reject the second insert with a unique constraint violation

### Requirement: khotan_mappings table
The schema SHALL define a `khotan_mappings` Drizzle table with the following columns: `id` (text, primary key, default UUID), `resource_id` (text, not null, references khotan_resources.id), `connect_value` (text, not null — the actual value of the connecting field, e.g. "SKU-BLUE-WIDGET"), `refs` (jsonb, not null, default `{}` — object keyed by plug name holding the external ID in each system), `metadata` (jsonb, nullable — contextual fields like product name, category), `created_at` (timestamp with timezone, default now), `updated_at` (timestamp with timezone, default now).

#### Scenario: Table has correct columns and defaults
- **WHEN** the schema file is loaded by Drizzle
- **THEN** the `khotan_mappings` table SHALL have all specified columns with their types and defaults
- **AND** `resource_id` SHALL reference `khotan_resources.id`
- **AND** `refs` SHALL default to an empty JSON object

#### Scenario: Unique constraint on resource + connect_value
- **WHEN** two mappings are inserted with the same `resource_id` and `connect_value`
- **THEN** the database SHALL reject the second insert with a unique constraint violation

#### Scenario: Refs stores external IDs keyed by plug name
- **WHEN** a mapping is inserted with `refs: { "shopify": "prod_123", "cin7": "P-456" }`
- **THEN** the `refs` column SHALL store this JSONB object
- **AND** individual values SHALL be queryable via `refs->>'shopify'`

### Requirement: Mappings table indexes
The schema SHALL define indexes for common mapping query patterns.

#### Scenario: Query mappings by resource
- **WHEN** the database is queried for all mappings of a resource
- **THEN** an index on `resource_id` SHALL be available to optimize the query

#### Scenario: Query mappings by connect_value within a resource
- **WHEN** the database is queried for a mapping by resource and connect_value
- **THEN** the unique constraint on `(resource_id, connect_value)` SHALL serve as an index

#### Scenario: Query mappings by refs content
- **WHEN** the database is queried for a mapping by a specific ref value (e.g. `refs->>'shopify' = 'prod_123'`)
- **THEN** a GIN index on `refs` SHALL be available to optimize the query

### Requirement: Resources and mappings relations
The schema SHALL export Drizzle relations connecting resources to syncs and mappings.

#### Scenario: Resource has many syncs
- **WHEN** a relational query fetches a resource with its syncs
- **THEN** the relation SHALL return all syncs where `resource_id` matches the resource's `id`

#### Scenario: Resource has many mappings
- **WHEN** a relational query fetches a resource with its mappings
- **THEN** the relation SHALL return all mappings where `resource_id` matches the resource's `id`

### Requirement: Resource and mapping type helpers
The schema SHALL export TypeScript type helpers: `KhotanResource`, `NewKhotanResource`, `KhotanMapping`, `NewKhotanMapping` using Drizzle's `$inferSelect` and `$inferInsert`.

#### Scenario: Types are available for application code
- **WHEN** the user imports `KhotanResource` from the schema file
- **THEN** it SHALL be typed as the select type of the `khotan_resources` table

### Requirement: Resource registration in config
The `khotan()` factory function SHALL accept an optional `resources` array in its config. Each resource registration SHALL have `name` (string) and `connectField` (string). An optional `description` (string) MAY be provided.

#### Scenario: Register resources in config
- **WHEN** a user calls `khotan({ adapter, plugs: [...], resources: [{ name: "products", connectField: "sku" }] })`
- **THEN** the factory SHALL accept this configuration

#### Scenario: Resource name uniqueness in config
- **WHEN** two resources are registered with the same `name`
- **THEN** the factory SHALL throw an error at configuration time

### Requirement: Sync resource association in config
Sync registrations SHALL accept an optional `resource` field (string) naming the resource this sync feeds. On initialization, the factory SHALL resolve the resource name to an ID and set `resource_id` on the sync row.

#### Scenario: Sync declares its resource
- **WHEN** a sync is registered with `{ name: "products-inflow", type: "inflow", resource: "products" }`
- **THEN** the factory SHALL link this sync to the "products" resource on init

#### Scenario: Sync references unknown resource
- **WHEN** a sync references a resource name that is not in the `resources` config array
- **THEN** the factory SHALL throw an error at configuration time

#### Scenario: Sync without resource
- **WHEN** a sync is registered without a `resource` field
- **THEN** the factory SHALL leave `resource_id` as null on the sync row

### Requirement: Resource upsert on initialization
When `init()` runs, the factory SHALL upsert all registered resources into `khotan_resources` before upserting syncs (since syncs may reference resources). Upsert SHALL use the resource `name` as the conflict key.

#### Scenario: Resources upserted before syncs
- **WHEN** `init()` is called with registered resources and syncs that reference them
- **THEN** the factory SHALL upsert resources first
- **AND** then upsert syncs with resolved `resource_id` values

#### Scenario: Idempotent resource upsert
- **WHEN** the server restarts and `init()` runs again with the same resource configuration
- **THEN** the factory SHALL update existing resource rows (matching on name) rather than creating duplicates

### Requirement: Adapter resource methods
The adapter interface SHALL provide methods for resource operations: `upsertResource`, `listResources`, `getResource`.

#### Scenario: Upsert a resource
- **WHEN** `adapter.upsertResource({ name: "products", connectField: "sku" })` is called
- **THEN** it SHALL insert or update the resource row and return `{ id: string }`

#### Scenario: List resources
- **WHEN** `adapter.listResources()` is called
- **THEN** it SHALL return all resources with sync and mapping counts

#### Scenario: Get a resource
- **WHEN** `adapter.getResource(id)` is called
- **THEN** it SHALL return the resource row or null if not found

### Requirement: Adapter mapping methods
The adapter interface SHALL provide methods for mapping operations: `upsertMapping`, `getMapping`, `listMappings`, `deleteMapping`, `lookupMapping`.

#### Scenario: Upsert a mapping
- **WHEN** `adapter.upsertMapping({ resourceId, connectValue, refs, metadata })` is called
- **THEN** it SHALL insert or update the mapping (conflict on `resource_id + connect_value`) and return `{ id: string }`
- **AND** on conflict, it SHALL merge `refs` (new keys added, existing keys updated) and replace `metadata`

#### Scenario: List mappings for a resource
- **WHEN** `adapter.listMappings(resourceId)` is called
- **THEN** it SHALL return all mappings for that resource

#### Scenario: Get a single mapping
- **WHEN** `adapter.getMapping(id)` is called
- **THEN** it SHALL return the mapping row or null

#### Scenario: Delete a mapping
- **WHEN** `adapter.deleteMapping(id)` is called
- **THEN** it SHALL remove the mapping row

#### Scenario: Lookup mapping by plug ref
- **WHEN** `adapter.lookupMapping({ resourceId, plugName, ref })` is called
- **THEN** it SHALL query for a mapping where `resource_id` matches and `refs->>plugName = ref`
- **AND** it SHALL return the mapping row or null

### Requirement: API routes for resources
The handler SHALL expose GET routes for resources.

#### Scenario: List resources
- **WHEN** the handler receives `GET .../resources`
- **THEN** it SHALL return a JSON array of all resources with sync and mapping counts
- **AND** the response status SHALL be 200

#### Scenario: Get a resource with syncs
- **WHEN** the handler receives `GET .../resources/:id`
- **THEN** it SHALL return the resource with its associated syncs
- **AND** if the resource does not exist, the response status SHALL be 404

#### Scenario: Get mappings for a resource
- **WHEN** the handler receives `GET .../resources/:id/mappings`
- **THEN** it SHALL return all mappings for that resource
- **AND** the response status SHALL be 200

### Requirement: API routes for mappings
The handler SHALL expose CRUD routes for mappings.

#### Scenario: Create or upsert a mapping
- **WHEN** the handler receives `POST .../mappings` with body `{ resourceId, connectValue, refs, metadata }`
- **THEN** it SHALL upsert the mapping and return the created/updated row
- **AND** the response status SHALL be 201 on create, 200 on update

#### Scenario: Get a mapping
- **WHEN** the handler receives `GET .../mappings/:id`
- **THEN** it SHALL return the mapping row
- **AND** if the mapping does not exist, the response status SHALL be 404

#### Scenario: Update a mapping
- **WHEN** the handler receives `PUT .../mappings/:id` with body containing `refs` and/or `metadata`
- **THEN** it SHALL update the mapping and return the updated row

#### Scenario: Delete a mapping
- **WHEN** the handler receives `DELETE .../mappings/:id`
- **THEN** it SHALL delete the mapping and return 204

#### Scenario: Lookup mapping by plug and ref
- **WHEN** the handler receives `POST .../mappings/lookup` with body `{ resourceId, plugName, ref }`
- **THEN** it SHALL return the matching mapping row or 404 if not found
