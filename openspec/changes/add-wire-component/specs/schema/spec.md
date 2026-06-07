## MODIFIED Requirements

### Requirement: khotan_runs table
The schema SHALL define a `khotan_runs` Drizzle table with the following columns: `id` (text, primary key, default UUID), `sync_id` (text, **nullable**, references khotan_syncs.id), `wire_id` (text, **nullable**, references khotan_wires.id), `run_type` (text, not null — one of 'full', 'delta', 'backfill', 'reconcile', 'dry-run'), `status` (text, not null, default 'pending' — one of 'pending', 'running', 'ok', 'failed'), `started_at` (timestamp with timezone, default now), `completed_at` (timestamp with timezone, nullable), `duration_ms` (integer, nullable), `extracted` (integer, default 0), `transformed` (integer, default 0), `created` (integer, default 0), `updated` (integer, default 0), `deleted` (integer, default 0), `failed` (integer, default 0), `error` (text, nullable), `metadata` (jsonb, nullable).

#### Scenario: Table has optional foreign key to syncs
- **WHEN** the schema file is loaded by Drizzle
- **THEN** `sync_id` SHALL be nullable and reference `khotan_syncs.id`

#### Scenario: Table has optional foreign key to wires
- **WHEN** the schema file is loaded by Drizzle
- **THEN** `wire_id` SHALL be nullable and reference `khotan_wires.id`

#### Scenario: Run references either sync or wire
- **WHEN** a row is inserted into `khotan_runs`
- **THEN** exactly one of `sync_id` or `wire_id` SHALL be non-null

#### Scenario: Run counters default to zero
- **WHEN** a row is inserted with only required fields
- **THEN** `extracted`, `transformed`, `created`, `updated`, `deleted`, and `failed` SHALL all default to 0

### Requirement: Schema exports Drizzle relations
The schema file SHALL export Drizzle `relations` definitions for all tables so that relational queries work (e.g., querying a plug with its syncs and runs, querying a wire with its runs, a resource with its syncs and mappings).

#### Scenario: Plug has many syncs
- **WHEN** a relational query fetches a plug with its syncs
- **THEN** the relation SHALL return all syncs where `plug_id` matches the plug's `id`

#### Scenario: Plug has many wires
- **WHEN** a relational query fetches a plug with its wires
- **THEN** the relation SHALL return all wires where `plug_id` matches the plug's `id`

#### Scenario: Sync has many runs
- **WHEN** a relational query fetches a sync with its runs
- **THEN** the relation SHALL return all runs where `sync_id` matches the sync's `id`

#### Scenario: Wire has many runs
- **WHEN** a relational query fetches a wire with its runs
- **THEN** the relation SHALL return all runs where `wire_id` matches the wire's `id`

#### Scenario: Sync belongs to optional resource
- **WHEN** a relational query fetches a sync with its resource
- **THEN** the relation SHALL return the resource where `id` matches the sync's `resource_id`, or null if `resource_id` is null

#### Scenario: Resource has many syncs
- **WHEN** a relational query fetches a resource with its syncs
- **THEN** the relation SHALL return all syncs where `resource_id` matches the resource's `id`

#### Scenario: Resource has many mappings
- **WHEN** a relational query fetches a resource with its mappings
- **THEN** the relation SHALL return all mappings where `resource_id` matches the resource's `id`

### Requirement: Schema exports type helpers
The schema file SHALL export TypeScript type helpers derived from all tables: `KhotanPlug`, `NewKhotanPlug`, `KhotanSync`, `NewKhotanSync`, `KhotanRun`, `NewKhotanRun`, `KhotanResource`, `NewKhotanResource`, `KhotanMapping`, `NewKhotanMapping`, `KhotanWire`, `NewKhotanWire` using Drizzle's `$inferSelect` and `$inferInsert`.

#### Scenario: Wire types are available for application code
- **WHEN** the user imports `KhotanWire` from the schema file
- **THEN** it SHALL be typed as the select type of the `khotan_wires` table

## ADDED Requirements

### Requirement: khotan_wires table
The schema SHALL define a `khotan_wires` Drizzle table with the following columns: `id` (text, primary key, default UUID), `plug_id` (text, not null, references khotan_plugs.id), `remote_id` (text, not null — the subscription ID on the external service), `callback_url` (text, not null — the URL events are sent to), `event_types` (jsonb, not null — array of subscribed event type strings), `status` (text, not null, default 'active' — one of 'active', 'disabled'), `metadata` (jsonb, nullable), `created_at` (timestamp with timezone, default now), `updated_at` (timestamp with timezone, default now).

Note: The factory's internal schema mirror adds a "pending" status to the enum and defaults to "pending" for its 2-step lifecycle (create row → subscribe → update to active). The user-facing template schema uses only "active" and "disabled" since the factory handles the transitional state internally.

#### Scenario: Table has correct columns and defaults
- **WHEN** the schema file is loaded by Drizzle
- **THEN** the `khotan_wires` table SHALL have all specified columns with their types and defaults
- **AND** `id` SHALL auto-generate a UUID via `$defaultFn`
- **AND** `status` SHALL default to 'active'
- **AND** `created_at` and `updated_at` SHALL default to the current timestamp

#### Scenario: Table has foreign key to plugs
- **WHEN** the schema file is loaded by Drizzle
- **THEN** `plug_id` SHALL reference `khotan_plugs.id`

#### Scenario: Table has indexes
- **WHEN** the schema file is loaded by Drizzle
- **THEN** there SHALL be an index on `plug_id`
- **AND** there SHALL be an index on `status`

### Requirement: Schema includes wire indexes
The schema file SHALL define indexes for common wire query patterns: wires by plug_id, wires by status, and runs by wire_id.

#### Scenario: Query wires by plug efficiently
- **WHEN** the database is queried for all wires of a plug
- **THEN** an index on `plug_id` SHALL be available to optimize the query

#### Scenario: Query runs by wire efficiently
- **WHEN** the database is queried for all runs triggered by a wire
- **THEN** an index on `wire_id` SHALL be available to optimize the query
