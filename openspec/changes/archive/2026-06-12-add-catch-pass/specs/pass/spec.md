## ADDED Requirements

### Requirement: pass builder function
The scaffolded `pass.ts` SHALL export a `pass()` builder function that accepts a `PassConfig` object with `to` (string — destination plug name) and `workflow` (a workflow function conforming to `PassWorkflow` type). It SHALL return a `PassRegistration` object.

#### Scenario: Define a pass registration
- **WHEN** a user calls `pass({ to: "slack", workflow: myPassWorkflow })`
- **THEN** the function SHALL return a `PassRegistration` object with `type: "pass"`, the `to` field, and a reference to the workflow function

### Requirement: PassContext type
The scaffolded `pass.ts` SHALL export a `PassContext` interface with: `event` (Record<string, unknown>), `eventType` (string), `headers` (Record<string, string>), `destVars` (Record<string, string> — variables for the destination plug, auto-injected by the factory), and `khotanRunId` (string — the run identifier created by the factory for tracking).

#### Scenario: PassContext includes destination vars
- **WHEN** the factory starts a pass workflow
- **THEN** `destVars` SHALL contain the stored credential vars for the destination plug (decrypted from the database)
- **AND** all fields of `PassContext` SHALL be JSON-serializable

### Requirement: Pass workflow pattern
The user's pass workflow function SHALL contain a `"use workflow"` directive and orchestrate one or more step functions. Step functions import the Plug builder and construct a destination plug using the passed `destVars` for auth.

#### Scenario: Pass workflow with a forward step
- **WHEN** the user defines a workflow step that constructs a plug from `destVars` and calls it
- **THEN** the step SHALL execute durably with automatic retry on transient failure
- **AND** the destination plug SHALL be constructed fresh within the step using serialized credentials

### Requirement: Pass template is self-contained
The scaffolded `pass.ts` SHALL have zero runtime imports from `khotan-data`. It SHALL only define types, interfaces, and the builder function.

#### Scenario: No khotan-data runtime dependency
- **WHEN** the `pass.ts` template is inspected
- **THEN** it SHALL contain zero import statements referencing `khotan-data`

### Requirement: Commented usage example
The scaffolded `pass.ts` SHALL include a commented-out usage example showing a complete pass workflow with a step that constructs a destination plug and forwards an event.

#### Scenario: Example is present and commented
- **WHEN** a user opens the scaffolded `pass.ts`
- **THEN** the file SHALL contain a multi-line commented example showing a full pass definition with `to`, `"use workflow"`, `"use step"`, and plug construction from `destVars`

### Requirement: CLI registry entry for pass
The `pass` component SHALL be registered in the CLI registry with `name: "pass"`, a description, output to `webhooks/pass.ts`, and `requires: ["wire", "plug"]`.

#### Scenario: Pass requires wire and plug
- **WHEN** a user runs `npx khotan add pass` without wire or plug scaffolded
- **THEN** the CLI SHALL offer to add the required components first

#### Scenario: Pass scaffolds to webhooks directory
- **WHEN** a user runs `npx khotan add pass`
- **THEN** the `pass.ts` file SHALL be created at `{outputDir}/webhooks/pass.ts`
