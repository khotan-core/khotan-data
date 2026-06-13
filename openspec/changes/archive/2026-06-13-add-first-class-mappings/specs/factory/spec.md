## ADDED Requirements

### Requirement: Factory validates resource mapping contracts
The khotan factory SHALL validate resource mapping declarations at configuration time before serving requests or initializing database state.

#### Scenario: Resource participant plug must be registered
- **WHEN** a resource declares a participating plug name that does not exist in the `plugs` registration array
- **THEN** the factory SHALL throw a configuration-time error

#### Scenario: Flow resource validation remains compatible
- **WHEN** a flow references a resource by name and that resource is registered with mapping-specific declarations
- **THEN** the factory SHALL still accept the flow-resource relationship
- **AND** the mapping-specific declarations SHALL NOT break normal flow registration

#### Scenario: Duplicate mapping participant definitions are rejected
- **WHEN** a resource config attempts to define the same participating plug more than once
- **THEN** the factory SHALL reject the configuration before initialization

### Requirement: Programmatic mapping accessors
The factory instance SHALL expose programmatic mapping helpers so application code can interact with mappings without issuing raw HTTP requests.

#### Scenario: Lookup mapping by connect value from application code
- **WHEN** application code requests a mapping using a resource identifier and canonical `connectValue`
- **THEN** the factory SHALL resolve and return the matching mapping row or null

#### Scenario: Lookup mapping by plug ref from application code
- **WHEN** application code requests a mapping using `{ resourceId, plugName, ref }`
- **THEN** the factory SHALL resolve and return the matching mapping row or null

#### Scenario: List mappings with pagination from application code
- **WHEN** application code requests mappings for a resource with pagination parameters
- **THEN** the factory SHALL return a paginated result rather than requiring callers to fetch the full mapping set

#### Scenario: Upsert mapping from application code
- **WHEN** application code submits `{ resourceId, connectValue, refs, metadata }`
- **THEN** the factory SHALL upsert the mapping through the adapter
- **AND** it SHALL return the created or updated identity result

#### Scenario: Delete mapping from application code
- **WHEN** application code requests deletion of a mapping by row ID
- **THEN** the factory SHALL delete that mapping through the adapter

### Requirement: Mapping list API supports operational browsing
The factory handler SHALL provide a mapping list surface suitable for browser UI and agent CLI use. The surface SHALL support pagination and search for a single resource.

#### Scenario: Paginated mapping list request
- **WHEN** the handler receives a request for mappings of one resource with `limit` and `offset`
- **THEN** it SHALL return only that slice of data
- **AND** it SHALL include pagination metadata sufficient for clients to continue browsing

#### Scenario: Mapping list search by connect value
- **WHEN** the handler receives a resource mappings request with a search term
- **THEN** it SHALL filter the result set according to the runtime search contract

#### Scenario: Mapping list remains resource-scoped
- **WHEN** the handler lists mappings for a resource
- **THEN** it SHALL scope the result set to that resource only
- **AND** it SHALL NOT mix mappings across resources

### Requirement: Mapping lookup API supports canonical connect value
The factory handler SHALL support direct mapping lookup by canonical `connectValue` in addition to lookup by plug ref.

#### Scenario: Lookup by connect value returns mapping
- **WHEN** the handler receives a mapping lookup request for an existing `{ resourceId, connectValue }`
- **THEN** it SHALL return the matching mapping row with a success status

#### Scenario: Lookup by connect value returns not found
- **WHEN** the handler receives a mapping lookup request for a missing `{ resourceId, connectValue }`
- **THEN** it SHALL return 404

#### Scenario: Lookup by connect value does not require row ID
- **WHEN** a caller knows the canonical shared identity but not the mapping row ID
- **THEN** the handler SHALL allow the caller to resolve the mapping without first listing all mappings

### Requirement: Mapping mutations enforce resource plug membership
When a resource declares participating plugs, the factory SHALL enforce that mapping mutations only write `refs` entries for those plugs.

#### Scenario: Upsert with allowed refs succeeds
- **WHEN** a mapping mutation includes only refs for plugs declared on the resource
- **THEN** the factory SHALL allow the mutation

#### Scenario: Upsert with undeclared ref plug fails
- **WHEN** a mapping mutation includes a ref key for a plug not declared on the resource
- **THEN** the factory SHALL reject the mutation with a client error

#### Scenario: Delete remains available for valid mapping row
- **WHEN** the caller deletes a mapping row by ID
- **THEN** plug membership validation SHALL NOT block the deletion
