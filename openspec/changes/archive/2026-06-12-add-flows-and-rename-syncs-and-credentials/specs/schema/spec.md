## MODIFIED Requirements

### Requirement: khotan_flows table
The schema SHALL define a `khotan_flows` Drizzle table with the following columns: `id` (text, primary key, default UUID), `plug_id` (text, not null, references khotan_plugs.id), `name` (text, not null), `type` (text, not null — one of 'inflow', 'outflow', 'relay', 'webhook'), `enabled` (boolean, default true), `schedule` (text, nullable), `resource_id` (text, nullable, references khotan_resources.id), `last_run_at` (timestamp with timezone, nullable), `last_run_status` (text, nullable — one of 'ok', 'failed'), `created_at` (timestamp with timezone, default now), `updated_at` (timestamp with timezone, default now).

#### Scenario: Table has foreign key to plugs
- **WHEN** the schema file is loaded by Drizzle
- **THEN** `plug_id` SHALL reference `khotan_plugs.id`
- **AND** the table SHALL have a unique constraint on `(plug_id, name)`

#### Scenario: Table has optional foreign key to resources
- **WHEN** the schema file is loaded by Drizzle
- **THEN** `resource_id` SHALL reference `khotan_resources.id`
- **AND** `resource_id` SHALL be nullable

### Requirement: khotan_runs flow foreign key
The schema SHALL define `khotan_runs` with a nullable `flow_id` foreign key that references `khotan_flows.id`.

#### Scenario: Table has optional foreign key to flows
- **WHEN** the schema file is loaded by Drizzle
- **THEN** `flow_id` SHALL be nullable and reference `khotan_flows.id`

### Requirement: Flow relations and types
The schema SHALL expose relation names and type helpers using flow terminology.

#### Scenario: Plug has many flows
- **WHEN** a relational query fetches a plug with its flows
- **THEN** the relation SHALL return all flows where `plug_id` matches the plug's `id`

#### Scenario: Flow has many runs
- **WHEN** a relational query fetches a flow with its runs
- **THEN** the relation SHALL return all runs where `flow_id` matches the flow's `id`

#### Scenario: Flow type helpers are exported
- **WHEN** the user imports flow table types from the schema file
- **THEN** the schema SHALL export flow-named type helpers derived from `khotan_flows`

## REMOVED Requirements

### Requirement: khotan_syncs table and sync-named references
**Reason**: Hard rename from sync terminology to flow terminology at persistence level.
**Migration**: Rename `khotan_syncs` to `khotan_flows`, rename `sync_id` references to `flow_id`, and update relation/type names accordingly.

#### Scenario: Legacy sync table naming removed
- **WHEN** schema tables are scaffolded
- **THEN** they SHALL NOT define `khotan_syncs` as the primary flow table
