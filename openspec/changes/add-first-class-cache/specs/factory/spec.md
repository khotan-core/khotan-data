## ADDED Requirements

### Requirement: Factory validates cache registrations
The khotan factory SHALL validate registered cache definitions at configuration time before serving requests or initializing database state.

#### Scenario: Cache scope plug must exist
- **WHEN** a cache definition declares `scope.plug` and that plug name is not present in the registered `plugs` array
- **THEN** the factory SHALL reject the configuration before initialization

#### Scenario: Cache scope resource must exist
- **WHEN** a cache definition declares `scope.resource` and no resource with that name exists in the registered `resources` array
- **THEN** the factory SHALL reject the configuration before initialization

#### Scenario: Cache scope flow must exist
- **WHEN** a cache definition declares `scope.flow` and no registered flow with that name exists
- **THEN** the factory SHALL reject the configuration before initialization

#### Scenario: Cache names are unique
- **WHEN** two cache definitions are registered with the same `name`
- **THEN** the factory SHALL reject the configuration before initialization

### Requirement: Factory upserts registered cache definitions
When `init()` is called or the first handler request is received, the factory SHALL upsert registered cache definitions into the runtime's standard cache-definition table in addition to existing khotan resources, plugs, and flows.

#### Scenario: First initialization persists cache definitions
- **WHEN** the factory initializes with one or more registered cache definitions
- **THEN** it SHALL persist those definitions into the runtime data model

#### Scenario: Reinitialization updates cache definitions idempotently
- **WHEN** the process initializes again with the same cache definitions
- **THEN** the factory SHALL update existing definition rows rather than create duplicates

### Requirement: Programmatic cache accessors
The factory instance SHALL expose programmatic helpers for reading, writing, and deleting cache entries without requiring raw HTTP requests.

#### Scenario: Read cache entry from application code
- **WHEN** application code requests a cache entry by registered cache name and logical key
- **THEN** the factory SHALL return the cached value or null

#### Scenario: Write cache entry from application code
- **WHEN** application code writes a value to a registered cache name and logical key
- **THEN** the factory SHALL create or update that cache entry

#### Scenario: Delete cache entry from application code
- **WHEN** application code deletes a registered cache name and logical key
- **THEN** the factory SHALL remove that cache entry from normal reads

### Requirement: Workflow contexts expose cache helpers
Execution contexts used by flows, relays, catches, and passes SHALL provide workflow-safe cache helpers so durable workflows can use registered caches directly.

#### Scenario: Relay workflow reads cached snapshot
- **WHEN** a relay workflow needs a previously stored expensive fetch result
- **THEN** the workflow context SHALL allow the relay to read that cache entry without issuing a raw runtime HTTP request

#### Scenario: Pass workflow writes dedupe marker
- **WHEN** a pass workflow wants to mark an inbound event as already processed
- **THEN** the workflow context SHALL allow the pass to write a cache entry during execution

#### Scenario: Flow workflow busts stale cache key
- **WHEN** a flow workflow determines a cache entry must be refreshed
- **THEN** the workflow context SHALL allow the flow to delete that cache entry

### Requirement: Handler provides cache operations
The factory handler SHALL expose cache-entry operations through the standard khotan runtime route so future tooling can inspect and operate on registered caches.

#### Scenario: Lookup cache entry by cache and key
- **WHEN** the handler receives a request for a cache entry identified by a registered cache and logical key
- **THEN** it SHALL return the cached value or a not-found response

#### Scenario: Upsert cache entry through handler
- **WHEN** the handler receives a write request for a registered cache and logical key
- **THEN** it SHALL create or update the cache entry according to the cache contract

#### Scenario: Delete cache entry through handler
- **WHEN** the handler receives a delete request for a registered cache and logical key
- **THEN** it SHALL remove that cache entry from normal reads
