## Purpose

Wire is a scaffolded template for webhook subscription lifecycle management. It provides a `wire()` builder function that defines hook-based subscription logic. The user creates per-service wire files (e.g. `stripe-wire.ts`) using this builder. The khotan factory then orchestrates the full lifecycle — calling hooks, managing DB persistence via the adapter, and exposing `create`/`delete`/`get` methods on the factory's `wire(plugName)` interface. Like Plug, the wire template has zero runtime dependencies on khotan-data — the user owns the file.

## Requirements

### Requirement: Wire builder function
The scaffolded `wire.ts` SHALL export a `wire()` builder function that accepts a `WireConfig` object and returns it. The config SHALL accept: `events` (string array of subscribed event types), `onSubscribe` (async hook called during connection), `onUnsubscribe` (async hook called during disconnection), and optionally `onVerify` (async hook for signature verification).

#### Scenario: Define a wire configuration
- **WHEN** a user calls `wire({ events: [...], onSubscribe(ctx) { ... }, onUnsubscribe(ctx) { ... } })`
- **THEN** the function SHALL return the WireConfig object for registration with the factory

#### Scenario: Wire config is registered on a plug
- **WHEN** the user registers the wire config in their khotan factory config under `plug.wires`
- **THEN** the factory SHALL use the hooks for lifecycle management via `factory.wire(plugName)`

### Requirement: onSubscribe hook
The `onSubscribe` hook SHALL receive a `WireSubscribeContext` with: `plug` (bound Plug instance with vars auto-injected), `callbackUrl` (string), `events` (string array), `wireVars` (previously stored wire-specific vars), and `setWireVars` (function to persist wire-specific vars like signing secrets). The hook SHALL return `{ remoteId: string }`.

#### Scenario: onSubscribe receives bound plug and callback URL
- **WHEN** the factory calls `wire(plugName).create(callbackUrl)`
- **THEN** `onSubscribe` SHALL be called with a context containing the bound plug and callbackUrl
- **AND** the user's hook makes the HTTP call to the external service directly

#### Scenario: onSubscribe returns remote ID
- **WHEN** the hook returns `{ remoteId: "wh_123" }`
- **THEN** the factory SHALL store `remoteId` in the `khotan_wires` table

#### Scenario: onSubscribe can persist wire vars
- **WHEN** the hook calls `ctx.setWireVars({ webhookSecret: "whsec_..." })`
- **THEN** the factory SHALL encrypt and store the vars in wire metadata

### Requirement: onUnsubscribe hook
The `onUnsubscribe` hook SHALL receive a `WireUnsubscribeContext` with: `plug` (bound Plug instance), `remoteId` (the subscription ID on the external service), `wireVars` (stored wire-specific vars), and `setWireVars` (function to update wire vars).

#### Scenario: onUnsubscribe receives remote ID
- **WHEN** the factory calls `wire(plugName).delete(wireId)`
- **THEN** `onUnsubscribe` SHALL be called with the stored `remoteId` from the database
- **AND** the user's hook makes the HTTP call to remove the subscription

### Requirement: onVerify hook (optional)
The optional `onVerify` hook SHALL receive a `WireVerifyContext` with: `headers` (incoming request Headers), `body` (raw request body), and `wireVars` (stored wire-specific vars including signing secrets). It SHALL return a boolean indicating signature validity.

#### Scenario: Verify incoming webhook
- **WHEN** a webhook request arrives and `onVerify` is defined
- **THEN** the hook SHALL receive the headers and body for signature verification
- **AND** return `true` if valid, `false` otherwise

### Requirement: Factory wire create operation
The factory's `wire(plugName).create(callbackUrl)` method SHALL: create or reuse a wire row (initially with "pending" status), call the `onSubscribe` hook with a bound plug, update the wire row to "active" with the returned remoteId, and return the wire record.

#### Scenario: Successful subscription creation
- **WHEN** `factory.wire("myplug").create("https://myapp.com/webhooks")` is called
- **THEN** the factory SHALL call `onSubscribe` with the bound plug and callbackUrl
- **AND** the factory SHALL update the `khotan_wires` row to status "active" with the remoteId
- **AND** the factory SHALL return the created record including `id`, `remoteId`, and `callbackUrl`

#### Scenario: External service returns error
- **WHEN** the `onSubscribe` hook throws (e.g. plug returns HTTP 400)
- **THEN** the wire row SHALL remain in "pending" status (not updated to active)
- **AND** the error SHALL propagate to the caller

### Requirement: Factory wire delete operation
The factory's `wire(plugName).delete(wireId)` method SHALL: read the wire record, call `onUnsubscribe` with the stored remoteId, and update the row status to "disabled".

#### Scenario: Successful subscription deletion
- **WHEN** `factory.wire("myplug").delete(wireId)` is called with a valid wire ID
- **THEN** the factory SHALL call `onUnsubscribe` with the stored remoteId
- **AND** the factory SHALL update the database row status to "disabled"

#### Scenario: Wire ID not found
- **WHEN** `wire.delete(wireId)` is called with a non-existent ID
- **THEN** the factory SHALL throw an error indicating the wire was not found

#### Scenario: External service delete fails
- **WHEN** the `onUnsubscribe` hook throws
- **THEN** the factory SHALL NOT modify the database row
- **AND** the error SHALL propagate to the caller

### Requirement: Factory wire get operation
The factory's `wire(plugName).get()` method SHALL return the current wire record for the plug from the database, or null if no wire exists.

#### Scenario: Wire exists
- **WHEN** `wire.get()` is called and a wire row exists for this plug
- **THEN** the factory SHALL return the record including `id`, `remoteId`, `callbackUrl`, `eventTypes`, `status`, and `createdAt`

#### Scenario: No wire
- **WHEN** `wire.get()` is called and no wire row exists
- **THEN** the factory SHALL return null

### Requirement: BoundPlug interface
The wire template SHALL export a `BoundPlug` interface representing a plug with vars and auth auto-injected by the factory. It SHALL expose `get`, `post`, `put`, `patch`, `delete` methods matching the Plug HTTP interface.

#### Scenario: Bound plug used in hooks
- **WHEN** the factory invokes onSubscribe or onUnsubscribe
- **THEN** it SHALL provide a bound plug that automatically injects stored vars into requests

### Requirement: Wire template is self-contained
The scaffolded `wire.ts` SHALL import only from the user's own project files (e.g., `../plugs/plug` for the Plug type). It SHALL NOT import from `khotan-data` at runtime.

#### Scenario: No khotan-data runtime dependency
- **WHEN** the wire.ts template is inspected
- **THEN** it SHALL contain zero import statements referencing `khotan-data`

### Requirement: Commented usage example
The scaffolded `wire.ts` SHALL include a commented-out usage example at the bottom of the file showing how to create a per-service wire definition using the builder, including onSubscribe, onUnsubscribe, and onVerify hooks.

#### Scenario: Example is present and commented
- **WHEN** a user opens the scaffolded wire.ts
- **THEN** the file SHALL contain a multi-line commented example showing a full wire definition (e.g. stripe-wire.ts)

### Requirement: CLI registry entry
The wire component SHALL be registered in the CLI registry with `name: "wire"`, a description, multi-file output (wire.ts to `wires/wire.ts`, wire-panel.tsx to components), and `requires: ["plug", "schema"]`.

#### Scenario: Wire requires plug and schema
- **WHEN** a user runs `npx khotan add wire` without plug or schema scaffolded
- **THEN** the CLI SHALL offer to add the required components first

#### Scenario: Wire scaffolds to output directory
- **WHEN** a user runs `npx khotan add wire`
- **THEN** the wire.ts file SHALL be created at `{outputDir}/wires/wire.ts`
- **AND** the wire-panel.tsx SHALL be created in the components directory

### Requirement: CLI post-install guidance
After scaffolding wire.ts, the CLI SHALL print usage guidance showing how to import wire, define a per-service wire config, and register it with the khotan factory.

#### Scenario: CLI prints usage after scaffolding
- **WHEN** `npx khotan add wire` completes successfully
- **THEN** the CLI SHALL print an example showing how to import wire and configure it
