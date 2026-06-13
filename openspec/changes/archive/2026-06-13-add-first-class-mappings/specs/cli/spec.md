## ADDED Requirements

### Requirement: Mappings command group
The CLI SHALL provide a `mappings` command group for operational mapping management. All mappings command output SHALL be valid JSON to stdout for both success and error cases.

#### Scenario: Mappings command appears in CLI help
- **WHEN** a user runs `npx khotan --help`
- **THEN** the CLI help output SHALL list the `mappings` command group

#### Scenario: Mappings commands emit JSON only
- **WHEN** any `khotan mappings` subcommand executes
- **THEN** stdout SHALL contain a single valid JSON payload
- **AND** the command SHALL NOT write human-only formatting, colors, or progress text to stdout

### Requirement: Mappings base connectivity contract
Mappings commands SHALL use the running Khotan API through the same base-path and port resolution model as other operational commands.

#### Scenario: Explicit port and base path are honored
- **WHEN** a user runs a mappings command with `--port 4000 --base-path /api/custom-khotan`
- **THEN** the CLI SHALL target `http://localhost:4000/api/custom-khotan`

#### Scenario: Connectivity failure is machine-readable
- **WHEN** the Khotan API is unreachable
- **THEN** the CLI SHALL return a JSON error payload with `ok: false`
- **AND** the payload SHALL include an error code and actionable hint

### Requirement: Mappings list command
The CLI SHALL provide a paginated `mappings list` command scoped to a resource. The command SHALL support pagination and search-oriented browsing.

#### Scenario: List mappings for one resource
- **WHEN** a user runs `npx khotan mappings list <resource>`
- **THEN** the CLI SHALL request mappings for that resource
- **AND** the JSON output SHALL include the returned mapping rows

#### Scenario: List mappings with explicit pagination
- **WHEN** a user runs `npx khotan mappings list <resource> --limit 25 --offset 50`
- **THEN** the CLI SHALL request the specified slice
- **AND** the JSON output SHALL include paging metadata along with the items

#### Scenario: List mappings with search
- **WHEN** a user runs `npx khotan mappings list <resource> --search "alice@example.com"`
- **THEN** the CLI SHALL request a filtered mapping list using the provided search term

#### Scenario: Unknown resource fails clearly
- **WHEN** a user runs `npx khotan mappings list nonexistent-resource`
- **THEN** the CLI SHALL return a JSON error payload indicating that the resource could not be resolved

### Requirement: Mappings lookup command
The CLI SHALL provide a `mappings lookup` command that supports lookup by canonical `connectValue` and by plug ref.

#### Scenario: Lookup by connect value
- **WHEN** a user runs `npx khotan mappings lookup <resource> --connect-value alice@example.com`
- **THEN** the CLI SHALL resolve the resource and request the mapping by canonical `connectValue`
- **AND** the JSON output SHALL include the resolved mapping row on success

#### Scenario: Lookup by plug ref
- **WHEN** a user runs `npx khotan mappings lookup <resource> --plug shopify --ref gid://shopify/Customer/123`
- **THEN** the CLI SHALL request the mapping by plug ref
- **AND** the JSON output SHALL include the resolved mapping row on success

#### Scenario: Lookup rejects missing mode
- **WHEN** a user runs `npx khotan mappings lookup <resource>` without either `--connect-value` or `--plug` plus `--ref`
- **THEN** the CLI SHALL return a JSON validation error explaining the accepted lookup modes

#### Scenario: Lookup rejects incomplete plug-ref mode
- **WHEN** a user passes `--plug shopify` without `--ref`
- **THEN** the CLI SHALL return a JSON validation error rather than making a malformed API request

### Requirement: Mappings upsert command
The CLI SHALL provide a `mappings upsert` command that creates or updates a mapping using canonical `connectValue`, refs JSON, and optional metadata JSON.

#### Scenario: Create new mapping
- **WHEN** a user runs `npx khotan mappings upsert <resource> --connect-value alice@example.com --refs '{"shopify":"gid://..."}'`
- **THEN** the CLI SHALL create a mapping if one does not already exist
- **AND** the JSON output SHALL include the mapping identity result

#### Scenario: Update existing mapping by natural key
- **WHEN** a user upserts a mapping for the same resource and canonical `connectValue`
- **THEN** the CLI SHALL update that existing mapping rather than create a duplicate

#### Scenario: Upsert accepts metadata
- **WHEN** a user passes `--metadata '{"firstName":"Alice","lastName":"Jones"}'`
- **THEN** the CLI SHALL send the metadata payload along with the upsert request

#### Scenario: Upsert rejects invalid JSON
- **WHEN** a user passes malformed JSON to `--refs` or `--metadata`
- **THEN** the CLI SHALL return a JSON validation error without issuing the API request

### Requirement: Mappings update command
The CLI SHALL provide a `mappings update` command that updates one mapping by row ID.

#### Scenario: Update mapping by ID
- **WHEN** a user runs `npx khotan mappings update <mappingId> --resource <resource> --connect-value alice@example.com --refs '{"shopify":"gid://...","cin7":"cust_456"}'`
- **THEN** the CLI SHALL issue an update request for that row ID
- **AND** the JSON output SHALL include the updated mapping identity result

#### Scenario: Update allows metadata replacement
- **WHEN** a user passes `--metadata` on update
- **THEN** the CLI SHALL send the metadata payload for replacement according to the runtime contract

### Requirement: Mappings delete command
The CLI SHALL provide a `mappings delete` command that deletes one mapping by row ID.

#### Scenario: Delete mapping by ID
- **WHEN** a user runs `npx khotan mappings delete <mappingId>`
- **THEN** the CLI SHALL delete that mapping row
- **AND** the JSON output SHALL indicate success

#### Scenario: Delete unknown mapping returns machine-readable error
- **WHEN** a user attempts to delete a nonexistent mapping row
- **THEN** the CLI SHALL return a JSON error payload rather than silently succeeding

### Requirement: Resource resolution for mappings commands
Mappings CLI commands SHALL allow callers to target a resource by the resource's registered name and SHALL resolve the backing resource record before issuing resource-scoped mapping operations.

#### Scenario: Resolve resource by name for list
- **WHEN** a user runs `npx khotan mappings list customers`
- **THEN** the CLI SHALL resolve the `customers` resource record before calling the resource-scoped mappings endpoint

#### Scenario: Resolve resource by name for lookup
- **WHEN** a user runs `npx khotan mappings lookup customers --connect-value alice@example.com`
- **THEN** the CLI SHALL resolve the `customers` resource record before issuing the lookup request
