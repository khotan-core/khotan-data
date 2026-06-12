## MODIFIED Requirements

### Requirement: Plug registration
Each plug registration SHALL be an object with `name` (string, unique identifier), `baseUrl` (string), `authType` (string — one of 'bearer', 'basic', 'apiKey', 'custom'), optional `flows` (array of flow registrations), optional `wires` (array of wire configs), optional `catches` (array of CatchRegistration objects), and optional `passes` (array of PassRegistration objects). Each flow registration SHALL have `name` (string), `type` (string — one of 'inflow', 'outflow', 'relay', 'webhook'), optional `schedule` (string, cron expression), and optional `resource` (string — name of a registered resource this flow feeds).

#### Scenario: Register a plug with catches
- **WHEN** a user registers a plug `{ name: "pollinate", ..., catches: [pollinateCatch] }`
- **THEN** the factory SHALL accept the catch registrations and associate them with the plug

#### Scenario: Register a plug with passes
- **WHEN** a user registers a plug `{ name: "stripe", ..., passes: [stripeToSlack] }`
- **THEN** the factory SHALL accept the pass registrations and associate them with the plug
- **AND** the factory SHALL validate that the `to` plug name referenced in each pass exists in the plugs array

#### Scenario: Pass references unknown destination plug
- **WHEN** a pass registration has `to: "slack"` but no plug named "slack" exists in the plugs array
- **THEN** the factory SHALL throw an error at configuration time

#### Scenario: Catches or passes without wire onVerify
- **WHEN** a plug has catches or passes registered but its wire does not define `onVerify`
- **THEN** the factory SHALL throw an error at configuration time with a message indicating that `onVerify` is required for webhook processing

## ADDED Requirements

### Requirement: Webhook receive route
The factory handler SHALL respond to `POST /webhook/:plugName` requests. This route receives inbound webhook events from external services.

#### Scenario: Receive webhook for known plug
- **WHEN** a POST request arrives at `/webhook/pollinate`
- **THEN** the factory SHALL identify the "pollinate" plug and proceed with verification

#### Scenario: Receive webhook for unknown plug
- **WHEN** a POST request arrives at `/webhook/unknown`
- **THEN** the factory SHALL return 404 with `{ error: "Unknown plug: unknown" }`

#### Scenario: Receive webhook for plug without wire
- **WHEN** a POST request arrives at `/webhook/cin7` and "cin7" has no active wire
- **THEN** the factory SHALL return 404 with `{ error: "No active wire for plug: cin7" }`

### Requirement: Webhook verification via Wire onVerify
The factory's webhook route SHALL read the raw request body (before JSON parsing), look up the active wire for the plug, retrieve stored wireVars, and call the wire's `onVerify` hook with the headers, raw body, and wireVars.

#### Scenario: Verification succeeds
- **WHEN** `onVerify` returns `true`
- **THEN** the factory SHALL proceed to start catch/pass workflows

#### Scenario: Verification fails
- **WHEN** `onVerify` returns `false`
- **THEN** the factory SHALL return 401 with `{ error: "Webhook verification failed" }`

#### Scenario: Raw body preserved for verification
- **WHEN** a webhook request arrives
- **THEN** the factory SHALL read the body as raw text first (for signature verification)
- **AND** parse it as JSON only after verification succeeds

### Requirement: Start catch workflows
After successful verification, the factory SHALL start all catch workflows registered on the plug by calling `start()` from `workflow/api` with a `CatchContext` argument containing the parsed event, event type, headers, and `khotanRunId`.

#### Scenario: Single catch registered
- **WHEN** a verified event arrives and the plug has one catch registered
- **THEN** the factory SHALL call `start(catch.workflow, [ctx])` once

#### Scenario: Multiple catches registered (fan-out)
- **WHEN** a verified event arrives and the plug has multiple catches registered
- **THEN** the factory SHALL call `start()` for each catch workflow (fan-out, all fire)

#### Scenario: No catches registered
- **WHEN** a verified event arrives and the plug has no catches
- **THEN** the factory SHALL skip catch processing (not an error)

### Requirement: Start pass workflows
After successful verification, the factory SHALL start all pass workflows registered on the plug. For each pass, it SHALL read the destination plug's stored vars from the database (decrypted), then call `start()` with a `PassContext` containing event, event type, headers, destVars, and `khotanRunId`.

#### Scenario: Pass with destination vars
- **WHEN** a verified event arrives and the plug has a pass with `to: "slack"`
- **THEN** the factory SHALL read the stored vars for the "slack" plug from the database
- **AND** call `start(pass.workflow, [ctx])` with `ctx.destVars` containing the decrypted vars

#### Scenario: Destination plug has no stored vars
- **WHEN** a pass targets a plug that has no vars stored in the database
- **THEN** the factory SHALL start the workflow with `destVars` as an empty object

#### Scenario: Multiple passes registered (fan-out)
- **WHEN** a verified event arrives and the plug has multiple passes
- **THEN** the factory SHALL call `start()` for each pass workflow

### Requirement: Webhook route response
After scheduling webhook processing, the factory SHALL immediately return 202 with `{ received: true }`. Workflow execution happens asynchronously — the response does not wait for workflow completion.

#### Scenario: Immediate acknowledgement
- **WHEN** webhook processing is accepted for asynchronous execution
- **THEN** the factory SHALL return `{ received: true }` with status 202
- **AND** the response SHALL NOT block on workflow completion

#### Scenario: Workflow start failure
- **WHEN** asynchronous workflow start fails after acknowledgement
- **THEN** the factory SHALL log the failure for diagnostics
- **AND** the webhook route response SHALL remain the previously returned accepted acknowledgement

### Requirement: Event type extraction
The factory SHALL extract the event type from the parsed JSON payload. It SHALL look for a `type` field at the top level of the payload. If no `type` field exists, it SHALL use `"unknown"` as the event type.

#### Scenario: Event has type field
- **WHEN** the parsed payload is `{ "type": "order.created", "id": "123" }`
- **THEN** `eventType` in the context SHALL be `"order.created"`

#### Scenario: Event has no type field
- **WHEN** the parsed payload is `{ "id": "123", "action": "created" }`
- **THEN** `eventType` SHALL be `"unknown"`
