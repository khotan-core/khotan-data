## Purpose

Wire is a scaffolded template for webhook subscription lifecycle management. It provides a `wire()` factory function that uses a Plug instance to programmatically create and delete webhook subscriptions on external services, and persists subscription state in the `khotan_wires` database table. Like Plug, the wire template has zero runtime dependencies on khotan-data — the user owns the file.

## Requirements

### Requirement: Wire factory function
The scaffolded `wire.ts` SHALL export a `wire()` factory function that accepts a configuration object and returns a Wire instance. The configuration SHALL accept: `plug` (Plug instance), `db` (Drizzle database instance), `subscribe` (subscription config object), and `unsubscribe` (unsubscription config object).

#### Scenario: Create a wire instance
- **WHEN** a user calls `wire({ plug, db, subscribe: { ... }, unsubscribe: { ... } })`
- **THEN** the function SHALL return a Wire instance with `create`, `delete`, and `get` methods

#### Scenario: Wire requires a plug instance
- **WHEN** a user creates a wire without providing a plug
- **THEN** the wire SHALL fail with a clear error indicating plug is required

### Requirement: Subscribe configuration
The `subscribe` field SHALL accept: `path` (string — the endpoint path on the external service), `buildBody` (function that accepts a `callbackUrl` string and returns the request body), and `parseId` (function that accepts the API response and returns the remote subscription ID as a string).

#### Scenario: buildBody receives callback URL
- **WHEN** `wire.create(callbackUrl)` is called
- **THEN** `subscribe.buildBody` SHALL be called with the provided callbackUrl
- **AND** the result SHALL be used as the POST body to the subscribe path

#### Scenario: parseId extracts remote ID
- **WHEN** the external service responds to the subscribe request
- **THEN** `subscribe.parseId` SHALL be called with the parsed response
- **AND** the returned string SHALL be stored as `remoteId` in the database

### Requirement: Unsubscribe configuration
The `unsubscribe` field SHALL accept: `path` (function that accepts the remote subscription ID and returns the endpoint path) and optionally `method` (HTTP method, defaults to "DELETE").

#### Scenario: Default delete method
- **WHEN** `unsubscribe.method` is not specified
- **THEN** the wire SHALL use HTTP DELETE when unsubscribing

#### Scenario: Custom delete method
- **WHEN** `unsubscribe.method` is set to "POST"
- **THEN** the wire SHALL use HTTP POST when unsubscribing

### Requirement: Create operation
The Wire instance SHALL expose a `create(callbackUrl: string)` method that: calls the plug to create a subscription on the external service, persists the result in the `khotan_wires` table, and returns the created wire record.

#### Scenario: Successful subscription creation
- **WHEN** `wire.create("https://myapp.com/api/webhooks/service")` is called
- **THEN** the wire SHALL POST to `subscribe.path` using the configured plug
- **AND** the wire SHALL insert a row into `khotan_wires` with status "active"
- **AND** the wire SHALL return the created record including `id`, `remoteId`, and `callbackUrl`

#### Scenario: External service returns error
- **WHEN** the plug POST to the subscribe path fails (e.g. PlugError with status 400)
- **THEN** the wire SHALL NOT insert a row into the database
- **AND** the error SHALL propagate to the caller

### Requirement: Delete operation
The Wire instance SHALL expose a `delete(wireId: string)` method that: reads the wire record from the database, calls the plug to delete the subscription on the external service, and removes or disables the database row.

#### Scenario: Successful subscription deletion
- **WHEN** `wire.delete(wireId)` is called with a valid wire ID
- **THEN** the wire SHALL call the plug with the unsubscribe path (built from remoteId)
- **AND** the wire SHALL update the database row status to "disabled"

#### Scenario: Wire ID not found
- **WHEN** `wire.delete(wireId)` is called with a non-existent ID
- **THEN** the wire SHALL throw an error indicating the wire was not found

#### Scenario: External service delete fails
- **WHEN** the plug call to the unsubscribe path fails
- **THEN** the wire SHALL NOT modify the database row
- **AND** the error SHALL propagate to the caller

### Requirement: Get operation
The Wire instance SHALL expose a `get()` method that returns the current active wire record from the database, or null if no active subscription exists.

#### Scenario: Active wire exists
- **WHEN** `wire.get()` is called and an active wire row exists for this plug
- **THEN** the wire SHALL return the record including `id`, `remoteId`, `callbackUrl`, `eventTypes`, `status`, and `createdAt`

#### Scenario: No active wire
- **WHEN** `wire.get()` is called and no active wire row exists
- **THEN** the wire SHALL return null

### Requirement: Wire template is self-contained
The scaffolded `wire.ts` SHALL import only from the user's own project files (e.g., `./plug` for the Plug type, `drizzle-orm` for query helpers). It SHALL NOT import from `khotan-data` at runtime.

#### Scenario: No khotan-data runtime dependency
- **WHEN** the wire.ts template is inspected
- **THEN** it SHALL contain zero import statements referencing `khotan-data`

### Requirement: Commented usage example
The scaffolded `wire.ts` SHALL include a commented-out usage example at the bottom of the file showing how to create a wire instance with a plug, configure subscribe/unsubscribe, and call create/delete/get.

#### Scenario: Example is present and commented
- **WHEN** a user opens the scaffolded wire.ts
- **THEN** the file SHALL contain a multi-line commented example showing full wire configuration

### Requirement: CLI registry entry
The wire component SHALL be registered in the CLI registry with `name: "wire"`, a description, `templatePath` pointing to the wire template, `outputFile: "wire.ts"`, and `requires: ["plug", "schema"]`.

#### Scenario: Wire requires plug and schema
- **WHEN** a user runs `npx khotan add wire` without plug or schema scaffolded
- **THEN** the CLI SHALL offer to add the required components first

#### Scenario: Wire scaffolds to output directory
- **WHEN** a user runs `npx khotan add wire`
- **THEN** the wire.ts file SHALL be created in the configured khotan output directory (e.g., `src/lib/khotan/wire.ts`)

### Requirement: CLI post-install guidance
After scaffolding wire.ts, the CLI SHALL print usage guidance showing how to create a wire instance, including import paths and a minimal configuration example.

#### Scenario: CLI prints usage after scaffolding
- **WHEN** `npx khotan add wire` completes successfully
- **THEN** the CLI SHALL print an example showing how to import wire and configure it with a plug instance
