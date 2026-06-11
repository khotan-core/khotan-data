## MODIFIED Requirements

### Requirement: Plug registration
Each plug registration SHALL be an object with `name` (string, unique identifier), `baseUrl` (string), `authType` (string — one of 'bearer', 'basic', 'apiKey', 'custom'), and optional `flows` (array of flow registrations). Each flow registration SHALL have `name` (string), `type` (string — one of 'inflow', 'outflow', 'relay', 'webhook'), optional `schedule` (string, cron expression), and optional `resource` (string — name of a registered resource this flow uses).

#### Scenario: Register a plug with flows
- **WHEN** a user registers a plug `{ name: "stripe", baseUrl: "https://api.stripe.com", authType: "bearer", flows: [{ name: "products-inflow", type: "inflow", schedule: "0 * * * *" }] }`
- **THEN** the factory SHALL accept this configuration for database upsert

#### Scenario: Register a plug with flows that reference resources
- **WHEN** a user registers a plug `{ name: "shopify", baseUrl: "https://...", authType: "bearer", flows: [{ name: "products-inflow", type: "inflow", resource: "products" }] }`
- **THEN** the factory SHALL accept this configuration and link the flow to the "products" resource on init

#### Scenario: Flow references unknown resource
- **WHEN** a flow registration includes `resource: "products"` but no resource named "products" exists in the `resources` config array
- **THEN** the factory SHALL throw an error at configuration time

### Requirement: API handler
The factory `handler` SHALL expose flow and variable routes using flow/variable naming only. It SHALL route requests for plug, flow, run, resource, mapping, wire, webhook-handler, debug, and variable operations.

#### Scenario: List flows
- **WHEN** the handler receives `GET .../flows`
- **THEN** it SHALL return a JSON response with all flows including their plug name

#### Scenario: List runs for a flow
- **WHEN** the handler receives `GET .../flows/:id/runs`
- **THEN** it SHALL return runs ordered by started_at descending

#### Scenario: Toggle flow enabled
- **WHEN** the handler receives `PATCH .../flows/:id` with `{ enabled: boolean }`
- **THEN** it SHALL update the flow enabled state and return the updated payload

#### Scenario: Variable routes use variables naming
- **WHEN** the handler receives requests under `.../variables/:plugName`
- **THEN** it SHALL perform variable read/write/delete operations for that plug

## REMOVED Requirements

### Requirement: Sync routes and sync config naming
**Reason**: Product vocabulary is now flow-first and uses hard rename semantics.
**Migration**: Replace `syncs` config key with `flows`, and replace `/syncs*` API usage with `/flows*`.

#### Scenario: Legacy sync route removed
- **WHEN** a client calls `GET .../syncs`
- **THEN** the handler SHALL NOT serve the legacy sync route

### Requirement: Credentials route naming
**Reason**: Plug secret/config management is renamed to variables for consistency with plug var fields.
**Migration**: Replace `/credentials/:plugName` calls with `/variables/:plugName`.

#### Scenario: Legacy credentials route removed
- **WHEN** a client calls `GET .../credentials/:plugName`
- **THEN** the handler SHALL NOT serve the legacy credentials route
