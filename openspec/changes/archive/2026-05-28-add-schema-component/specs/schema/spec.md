## ADDED Requirements

### Requirement: khotan_plugs table
The schema SHALL define a `khotan_plugs` Drizzle table with the following columns: `id` (text, primary key, default UUID), `name` (text, unique, not null), `base_url` (text, not null), `auth_type` (text, not null — one of 'bearer', 'basic', 'apiKey', 'custom'), `enabled` (boolean, default true), `status` (text, default 'idle' — one of 'connected', 'error', 'idle'), `status_message` (text, nullable), `encrypted_credentials` (text, nullable), `created_at` (timestamp with timezone, default now), `updated_at` (timestamp with timezone, default now).

#### Scenario: Table has correct columns and defaults
- **WHEN** the schema file is loaded by Drizzle
- **THEN** the `khotan_plugs` table SHALL have all specified columns with their types and defaults
- **AND** `id` SHALL auto-generate a UUID via `$defaultFn`
- **AND** `name` SHALL have a unique constraint
- **AND** `created_at` and `updated_at` SHALL default to the current timestamp

### Requirement: khotan_syncs table
The schema SHALL define a `khotan_syncs` Drizzle table with the following columns: `id` (text, primary key, default UUID), `plug_id` (text, not null, references khotan_plugs.id), `name` (text, not null), `type` (text, not null — one of 'inflow', 'outflow', 'relay', 'webhook'), `enabled` (boolean, default true), `schedule` (text, nullable — cron expression), `last_run_at` (timestamp with timezone, nullable), `last_run_status` (text, nullable — one of 'ok', 'failed'), `created_at` (timestamp with timezone, default now), `updated_at` (timestamp with timezone, default now).

#### Scenario: Table has foreign key to plugs
- **WHEN** the schema file is loaded by Drizzle
- **THEN** `plug_id` SHALL reference `khotan_plugs.id`
- **AND** the table SHALL have a unique constraint on `(plug_id, name)`

#### Scenario: Sync types are constrained
- **WHEN** a row is inserted into `khotan_syncs`
- **THEN** the `type` column SHALL accept 'inflow', 'outflow', 'relay', or 'webhook'

### Requirement: khotan_runs table
The schema SHALL define a `khotan_runs` Drizzle table with the following columns: `id` (text, primary key, default UUID), `sync_id` (text, not null, references khotan_syncs.id), `run_type` (text, not null — one of 'full', 'delta', 'backfill', 'reconcile', 'dry-run'), `status` (text, not null, default 'pending' — one of 'pending', 'running', 'ok', 'failed'), `started_at` (timestamp with timezone, default now), `completed_at` (timestamp with timezone, nullable), `duration_ms` (integer, nullable), `extracted` (integer, default 0), `transformed` (integer, default 0), `created` (integer, default 0), `updated` (integer, default 0), `deleted` (integer, default 0), `failed` (integer, default 0), `error` (text, nullable), `metadata` (jsonb, nullable).

#### Scenario: Table has foreign key to syncs
- **WHEN** the schema file is loaded by Drizzle
- **THEN** `sync_id` SHALL reference `khotan_syncs.id`

#### Scenario: Run counters default to zero
- **WHEN** a row is inserted with only required fields
- **THEN** `extracted`, `transformed`, `created`, `updated`, `deleted`, and `failed` SHALL all default to 0

### Requirement: Schema exports Drizzle relations
The schema file SHALL export Drizzle `relations` definitions for all three tables so that relational queries work (e.g., querying a plug with its syncs and runs).

#### Scenario: Plug has many syncs
- **WHEN** a relational query fetches a plug with its syncs
- **THEN** the relation SHALL return all syncs where `plug_id` matches the plug's `id`

#### Scenario: Sync has many runs
- **WHEN** a relational query fetches a sync with its runs
- **THEN** the relation SHALL return all runs where `sync_id` matches the sync's `id`

### Requirement: Schema includes indexes
The schema file SHALL define indexes for common query patterns: syncs by plug_id, runs by sync_id, runs by status, and runs by started_at (descending for recent runs).

#### Scenario: Query recent runs efficiently
- **WHEN** the database is queried for the 10 most recent runs of a sync
- **THEN** an index on `(sync_id, started_at DESC)` SHALL be available to optimize the query

### Requirement: Schema is self-contained
The schema file SHALL import only from `drizzle-orm/pg-core` and `drizzle-orm`. It SHALL NOT import from `khotan-data` or any other package beyond `drizzle-orm`.

#### Scenario: No khotan-data runtime dependency
- **WHEN** the schema file is inspected
- **THEN** it SHALL contain zero import statements referencing `khotan-data`

### Requirement: Schema exports type helpers
The schema file SHALL export TypeScript type helpers derived from the tables: `KhotanPlug`, `NewKhotanPlug`, `KhotanSync`, `NewKhotanSync`, `KhotanRun`, `NewKhotanRun` using Drizzle's `$inferSelect` and `$inferInsert`.

#### Scenario: Types are available for application code
- **WHEN** the user imports `KhotanPlug` from the schema file
- **THEN** it SHALL be typed as the select type of the `khotan_plugs` table
