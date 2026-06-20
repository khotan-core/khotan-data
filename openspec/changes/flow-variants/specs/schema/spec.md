## MODIFIED Requirements

### Requirement: khotan_runs table
The schema SHALL define a `khotan_runs` Drizzle table with the following columns: `id` (text, primary key, default UUID), `flow_id` (text, **nullable**, references khotan_flows.id), `wire_id` (text, **nullable**, references khotan_wires.id), `variant` (text, not null — the variant name the run executed, e.g. 'default', 'delta', 'full', 'healthcheck'), `source` (text, not null, default 'manual' — one of 'scheduled', 'manual', 'webhook' — how the run was triggered), `status` (text, not null, default 'pending' — one of 'pending', 'running', 'ok', 'failed'), `started_at` (timestamp with timezone, default now), `completed_at` (timestamp with timezone, nullable), `duration_ms` (integer, nullable), `extracted` (integer, default 0), `transformed` (integer, default 0), `created` (integer, default 0), `updated` (integer, default 0), `deleted` (integer, default 0), `failed` (integer, default 0), `error` (text, nullable), `metadata` (jsonb, nullable). The previous `run_type` enum column is replaced by `variant` + `source`; a migration SHALL set `variant` from the prior `run_type` value and `source` to 'webhook' where `run_type` was 'webhook' else 'scheduled'.

#### Scenario: Table has optional foreign key to flows
- **WHEN** the schema file is loaded by Drizzle
- **THEN** `flow_id` SHALL be nullable and reference `khotan_flows.id`

#### Scenario: Table has optional foreign key to wires
- **WHEN** the schema file is loaded by Drizzle
- **THEN** `wire_id` SHALL be nullable and reference `khotan_wires.id`

#### Scenario: Run records its variant
- **WHEN** a row is inserted into `khotan_runs` for a flow run
- **THEN** `variant` SHALL be the name of the variant that executed (defaulting to 'default')

#### Scenario: Run records its trigger source
- **WHEN** a row is inserted into `khotan_runs`
- **THEN** `source` SHALL indicate whether the run was 'scheduled', 'manual', or 'webhook'

#### Scenario: Run references either flow, wire, or webhook handler
- **WHEN** a row is inserted into `khotan_runs`
- **THEN** the row MAY reference a flow, wire, or webhook handler depending on run source

#### Scenario: Run counters default to zero
- **WHEN** a row is inserted with only required fields
- **THEN** `extracted`, `transformed`, `created`, `updated`, `deleted`, and `failed` SHALL all default to 0
