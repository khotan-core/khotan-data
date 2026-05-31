## MODIFIED Requirements

### Requirement: khotan_syncs table
The schema SHALL define a `khotan_syncs` Drizzle table with the following columns: `id` (text, primary key, default UUID), `plug_id` (text, not null, references khotan_plugs.id), `name` (text, not null), `type` (text, not null — one of 'inflow', 'outflow', 'relay', 'webhook'), `enabled` (boolean, default true), `schedule` (text, nullable — cron expression), `resource_id` (text, nullable, references khotan_resources.id), `last_run_at` (timestamp with timezone, nullable), `last_run_status` (text, nullable — one of 'ok', 'failed'), `created_at` (timestamp with timezone, default now), `updated_at` (timestamp with timezone, default now).

#### Scenario: Table has foreign key to plugs
- **WHEN** the schema file is loaded by Drizzle
- **THEN** `plug_id` SHALL reference `khotan_plugs.id`
- **AND** the table SHALL have a unique constraint on `(plug_id, name)`

#### Scenario: Table has optional foreign key to resources
- **WHEN** the schema file is loaded by Drizzle
- **THEN** `resource_id` SHALL reference `khotan_resources.id`
- **AND** `resource_id` SHALL be nullable

#### Scenario: Sync types are constrained
- **WHEN** a row is inserted into `khotan_syncs`
- **THEN** the `type` column SHALL accept 'inflow', 'outflow', 'relay', or 'webhook'

### Requirement: Schema exports Drizzle relations
The schema file SHALL export Drizzle `relations` definitions for all tables so that relational queries work (e.g., querying a plug with its syncs and runs, a resource with its syncs and mappings).

#### Scenario: Plug has many syncs
- **WHEN** a relational query fetches a plug with its syncs
- **THEN** the relation SHALL return all syncs where `plug_id` matches the plug's `id`

#### Scenario: Sync has many runs
- **WHEN** a relational query fetches a sync with its runs
- **THEN** the relation SHALL return all runs where `sync_id` matches the sync's `id`

#### Scenario: Sync belongs to optional resource
- **WHEN** a relational query fetches a sync with its resource
- **THEN** the relation SHALL return the resource where `id` matches the sync's `resource_id`, or null if `resource_id` is null

#### Scenario: Resource has many syncs
- **WHEN** a relational query fetches a resource with its syncs
- **THEN** the relation SHALL return all syncs where `resource_id` matches the resource's `id`

#### Scenario: Resource has many mappings
- **WHEN** a relational query fetches a resource with its mappings
- **THEN** the relation SHALL return all mappings where `resource_id` matches the resource's `id`

### Requirement: Schema includes indexes
The schema file SHALL define indexes for common query patterns: syncs by plug_id, syncs by resource_id, runs by sync_id, runs by status, runs by started_at (descending), mappings by resource_id, and a GIN index on mappings refs.

#### Scenario: Query syncs by resource efficiently
- **WHEN** the database is queried for all syncs of a resource
- **THEN** an index on `resource_id` SHALL be available to optimize the query

#### Scenario: Query recent runs efficiently
- **WHEN** the database is queried for the 10 most recent runs of a sync
- **THEN** an index on `(sync_id, started_at DESC)` SHALL be available to optimize the query

#### Scenario: Query mappings by refs content
- **WHEN** the database is queried for a mapping by a specific ref value
- **THEN** a GIN index on `refs` SHALL be available to optimize the query

### Requirement: Schema exports type helpers
The schema file SHALL export TypeScript type helpers derived from all tables: `KhotanPlug`, `NewKhotanPlug`, `KhotanSync`, `NewKhotanSync`, `KhotanRun`, `NewKhotanRun`, `KhotanResource`, `NewKhotanResource`, `KhotanMapping`, `NewKhotanMapping` using Drizzle's `$inferSelect` and `$inferInsert`.

#### Scenario: Types are available for application code
- **WHEN** the user imports `KhotanResource` from the schema file
- **THEN** it SHALL be typed as the select type of the `khotan_resources` table
