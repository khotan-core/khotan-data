## Purpose

Resources and mappings enable cross-referencing entities across multiple external systems. A resource represents a logical entity type (e.g. products, orders), and mappings store per-entity cross-references with external IDs keyed by plug name.

## Requirements

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
The schema SHALL export Drizzle relations connecting resources to flows and mappings.

#### Scenario: Resource has many flows
- **WHEN** a relational query fetches a resource with its flows
- **THEN** the relation SHALL return all flows where `resource_id` matches the resource's `id`

#### Scenario: Resource has many mappings
- **WHEN** a relational query fetches a resource with its mappings
- **THEN** the relation SHALL return all mappings where `resource_id` matches the resource's `id`

### Requirement: Resource and mapping type helpers
The schema SHALL export TypeScript type helpers: `KhotanResource`, `NewKhotanResource`, `KhotanMapping`, `NewKhotanMapping` using Drizzle's `$inferSelect` and `$inferInsert`.

#### Scenario: Types are available for application code
- **WHEN** the user imports `KhotanResource` from the schema file
- **THEN** it SHALL be typed as the select type of the `khotan_resources` table

### Requirement: Resource registration in config
The `khotan()` factory function SHALL accept an optional `resources` array in its config. Each resource registration SHALL have `name` (string) and `connectField` (either a string or an ordered array of strings). An optional `description` (string) MAY be provided. A resource MAY also declare participating plugs, where each plug declaration names the plug and defines one unique identifier for that plug.

#### Scenario: Register resources in config
- **WHEN** a user calls `khotan({ adapter, plugs: [...], resources: [{ name: "products", connectField: "sku" }] })`
- **THEN** the factory SHALL accept this configuration

#### Scenario: Register resource with composite connect field
- **WHEN** a user calls `khotan({ adapter, plugs: [...], resources: [{ name: "customers", connectField: ["tenantId", "email"] }] })`
- **THEN** the factory SHALL accept this configuration
- **AND** the resource contract SHALL expose one canonical `connectValue` model for mappings

#### Scenario: Register resource with participating plugs
- **WHEN** a user calls `khotan({ adapter, plugs: [...], resources: [{ name: "customers", connectField: "email", plugs: { shopify: { uniqueIdentifier: "id" }, cin7: { uniqueIdentifier: "id" } } }] })`
- **THEN** the factory SHALL accept this configuration
- **AND** the resource contract SHALL treat `shopify` and `cin7` as valid mapping participants

#### Scenario: Resource name uniqueness in config
- **WHEN** two resources are registered with the same `name`
- **THEN** the factory SHALL throw an error at configuration time

#### Scenario: Resource plug declaration references unknown plug
- **WHEN** a resource declares a participating plug name that is not present in the registered `plugs` array
- **THEN** the factory SHALL throw an error at configuration time

### Requirement: Flow resource association in config
Flow registrations SHALL accept an optional `resource` field (string) naming the resource this flow feeds. On initialization, the factory SHALL resolve the resource name to an ID and set `resource_id` on the flow row.

#### Scenario: Flow declares its resource
- **WHEN** a flow is registered with `{ name: "products-inflow", type: "inflow", resource: "products" }`
- **THEN** the factory SHALL link this flow to the "products" resource on init

#### Scenario: Flow references unknown resource
- **WHEN** a flow references a resource name that is not in the `resources` config array
- **THEN** the factory SHALL throw an error at configuration time

#### Scenario: Flow without resource
- **WHEN** a flow is registered without a `resource` field
- **THEN** the factory SHALL leave `resource_id` as null on the flow row

### Requirement: Resource upsert on initialization
When `init()` runs, the factory SHALL upsert all registered resources into `khotan_resources` before upserting flows (since flows may reference resources). Upsert SHALL use the resource `name` as the conflict key.

#### Scenario: Resources upserted before flows
- **WHEN** `init()` is called with registered resources and flows that reference them
- **THEN** the factory SHALL upsert resources first
- **AND** then upsert flows with resolved `resource_id` values

#### Scenario: Idempotent resource upsert
- **WHEN** the server restarts and `init()` runs again with the same resource configuration
- **THEN** the factory SHALL update existing resource rows (matching on name) rather than creating duplicates

### Requirement: Adapter resource methods
The adapter interface SHALL provide methods for resource operations: `upsertResource`, `listResources`, `getResource`, `getResourceFlows`.

#### Scenario: Upsert a resource
- **WHEN** `adapter.upsertResource({ name: "products", connectField: "sku" })` is called
- **THEN** it SHALL insert or update the resource row and return `{ id: string }`

#### Scenario: List resources
- **WHEN** `adapter.listResources()` is called
- **THEN** it SHALL return all resources with flow and mapping counts

#### Scenario: Get a resource
- **WHEN** `adapter.getResource(id)` is called
- **THEN** it SHALL return the resource row or null if not found

#### Scenario: Get flows for a resource
- **WHEN** `adapter.getResourceFlows(resourceId)` is called
- **THEN** it SHALL return all flows where `resource_id` matches

### Requirement: Adapter mapping methods
The adapter interface SHALL provide methods for mapping operations: `upsertMapping`, `getMapping`, `listMappings`, `deleteMapping`, and `lookupMapping`. The mapping operations SHALL support lookup by canonical connect value, lookup by plug ref, and paginated browsing for a resource.

#### Scenario: Upsert a mapping
- **WHEN** `adapter.upsertMapping({ resourceId, connectValue, refs, metadata })` is called
- **THEN** it SHALL insert or update the mapping (conflict on `resource_id + connect_value`) and return `{ id: string, created: boolean }`
- **AND** on conflict, it SHALL merge `refs` (new keys added, existing keys updated) and replace `metadata`

#### Scenario: Upsert uses canonical connect value as natural key
- **WHEN** two upsert operations target the same `resourceId` and canonical `connectValue`
- **THEN** the adapter SHALL update the same mapping row rather than create a duplicate

#### Scenario: List mappings for a resource
- **WHEN** `adapter.listMappings(resourceId)` is called
- **THEN** it SHALL be able to return mappings for that resource

#### Scenario: Paginate mappings for a resource
- **WHEN** the runtime requests a paginated mapping list for a resource with a `limit` and `offset`
- **THEN** the adapter SHALL return only that slice of mappings
- **AND** it SHALL preserve a stable ordering contract defined by the runtime

#### Scenario: Search mappings by connect value
- **WHEN** the runtime requests mappings for a resource with a search term matching `connectValue`
- **THEN** the adapter SHALL be able to return matching mappings without requiring the caller to load all mappings first

#### Scenario: Lookup mapping by connect value
- **WHEN** the runtime requests a mapping by `resourceId` and canonical `connectValue`
- **THEN** the adapter SHALL return the matching mapping row or null

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
The handler SHALL expose GET routes for resources. Resource-specific mapping routes SHALL support both full compatibility with existing access patterns and paginated/search-friendly access patterns for operational tooling.

#### Scenario: List resources
- **WHEN** the handler receives `GET .../resources`
- **THEN** it SHALL return a JSON array of all resources with flow and mapping counts
- **AND** the response status SHALL be 200

#### Scenario: Get a resource with flows
- **WHEN** the handler receives `GET .../resources/:id`
- **THEN** it SHALL return the resource with its associated flows
- **AND** if the resource does not exist, the response status SHALL be 404

#### Scenario: Get mappings for a resource
- **WHEN** the handler receives `GET .../resources/:id/mappings`
- **THEN** it SHALL support returning mappings for that resource
- **AND** the response status SHALL be 200

#### Scenario: Get mappings for a resource with pagination
- **WHEN** the handler receives `GET .../resources/:id/mappings` with pagination parameters
- **THEN** it SHALL return a paginated result for that resource
- **AND** it SHALL include enough paging metadata for CLI and UI consumers to request the next slice

#### Scenario: Get mappings for a resource with search
- **WHEN** the handler receives `GET .../resources/:id/mappings` with a search term
- **THEN** it SHALL filter the result set according to the mapping search contract

### Requirement: API routes for mappings
The handler SHALL expose CRUD and lookup routes for mappings. The mappings API SHALL support direct lookup by canonical `connectValue` as well as lookup by plug ref.

#### Scenario: Create or upsert a mapping
- **WHEN** the handler receives `POST .../mappings` with body `{ resourceId, connectValue, refs, metadata }`
- **THEN** it SHALL upsert the mapping and return the created/updated row
- **AND** the response status SHALL be 201 on create, 200 on update

#### Scenario: Create or upsert validates declared resource plugs
- **WHEN** the handler receives a mapping mutation for a resource that declares allowed plugs
- **THEN** the handler SHALL reject any `refs` keys outside that resource's declared plug set

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

#### Scenario: Lookup mapping by connect value
- **WHEN** the handler receives a mapping lookup request using `{ resourceId, connectValue }`
- **THEN** it SHALL return the matching mapping row or 404 if not found

#### Scenario: Connect-value lookup uses canonical identity
- **WHEN** the handler receives a connect-value lookup for a resource with composite `connectField` semantics
- **THEN** it SHALL match against the stored canonical `connectValue`
- **AND** it SHALL NOT require callers to know internal row IDs

### Requirement: Canonical connect value derivation
The mapping system SHALL treat `connectValue` as the canonical shared identity string for a mapping row. A resource MAY declare its `connectField` as either a single field name or a composite ordered list of field names. When a composite declaration is used, the runtime SHALL derive one deterministic canonical `connectValue` string from the ordered field values.

#### Scenario: Single-field connect value remains direct
- **WHEN** a resource declares `connectField: "email"`
- **THEN** the canonical `connectValue` SHALL represent the single resolved `email` value
- **AND** the mapping system SHALL continue to store one `connect_value` string in `khotan_mappings`

#### Scenario: Composite connect value is deterministic
- **WHEN** a resource declares `connectField: ["tenantId", "sku"]`
- **THEN** the runtime SHALL derive one canonical `connectValue` string from the ordered pair
- **AND** the same ordered input values SHALL always produce the same canonical output string

#### Scenario: Composite connect value preserves field order
- **WHEN** a resource declares `connectField: ["country", "phone"]`
- **THEN** the runtime SHALL treat `["AU", "123"]` and `["123", "AU"]` as different ordered inputs
- **AND** field declaration order SHALL be part of the canonicalization contract

### Requirement: Resource plug participation contract
Resources SHALL be able to declare participating plugs and one unique identifier definition per plug. This declaration SHALL define which plug names are valid inside mapping `refs` for that resource.

#### Scenario: Resource declares plug participants
- **WHEN** a resource is registered with plug declarations for `shopify` and `cin7`
- **THEN** the resource contract SHALL treat those plug names as valid mapping ref keys for that resource

#### Scenario: Each plug has one unique identifier definition
- **WHEN** a resource declares a participating plug
- **THEN** that plug declaration SHALL contain exactly one unique identifier definition in v1
- **AND** the config contract SHALL NOT require support for multiple identifiers per plug

#### Scenario: Resource omits plug participants
- **WHEN** a resource is registered without a plug participation declaration
- **THEN** existing resource behavior SHALL remain compatible
- **AND** richer validation rules SHALL apply only when plug participation is explicitly declared

### Requirement: Mapping identity semantics
Per-plug external identifiers SHALL be treated as first-class mapping data in `refs`. `metadata` SHALL be reserved for contextual non-identity fields.

#### Scenario: Per-plug external IDs belong in refs
- **WHEN** a customer mapping stores a Shopify customer ID and a Cin7 customer ID
- **THEN** those values SHALL be represented in `refs`
- **AND** they SHALL NOT require placement in `metadata`

#### Scenario: Metadata stores display context
- **WHEN** a mapping stores fields such as customer name, status, or company
- **THEN** those values SHALL be allowed in `metadata`
- **AND** the mapping contract SHALL treat them as contextual rather than canonical identity
