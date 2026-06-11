## ADDED Requirements

### Requirement: catchEvent builder function
The scaffolded `catch.ts` SHALL export a `catchEvent()` builder function that accepts a workflow function and returns a `CatchRegistration` object. The workflow function SHALL conform to the `CatchWorkflow` type signature: `(ctx: CatchContext) => Promise<void>`.

#### Scenario: Define a catch registration
- **WHEN** a user calls `catchEvent(myWorkflow)`
- **THEN** the function SHALL return a `CatchRegistration` object with `type: "catch"` and a reference to the workflow function

### Requirement: CatchContext type
The scaffolded `catch.ts` SHALL export a `CatchContext` interface with: `event` (Record<string, unknown> — the parsed webhook payload), `eventType` (string — the event type from the payload or header), and `headers` (Record<string, string> — incoming request headers).

#### Scenario: CatchContext is serializable
- **WHEN** the factory starts a catch workflow
- **THEN** all fields of `CatchContext` SHALL be JSON-serializable plain data (no class instances, functions, or DB connections)

### Requirement: Catch workflow pattern
The user's catch workflow function SHALL contain a `"use workflow"` directive and orchestrate one or more step functions with `"use step"` directives. Step functions have full Node.js access and import their own dependencies (e.g., `db` from the user's project).

#### Scenario: Catch workflow with a persist step
- **WHEN** the user defines a workflow that calls a step function importing their Drizzle `db`
- **THEN** the step SHALL execute durably with automatic retry on transient failure
- **AND** the step SHALL have full access to Node.js APIs and npm packages

#### Scenario: Catch workflow with multiple steps
- **WHEN** the user defines a workflow with multiple step functions
- **THEN** each step SHALL execute independently with its own retry and persistence

### Requirement: Catch template is self-contained
The scaffolded `catch.ts` SHALL have zero runtime imports from `khotan-data`. It SHALL only define types, interfaces, and the builder function.

#### Scenario: No khotan-data runtime dependency
- **WHEN** the `catch.ts` template is inspected
- **THEN** it SHALL contain zero import statements referencing `khotan-data`

### Requirement: Commented usage example
The scaffolded `catch.ts` SHALL include a commented-out usage example showing a complete catch workflow with a step that persists an event to a Drizzle table.

#### Scenario: Example is present and commented
- **WHEN** a user opens the scaffolded `catch.ts`
- **THEN** the file SHALL contain a multi-line commented example showing a full catch definition with `"use workflow"` and `"use step"` directives

### Requirement: CLI registry entry for catch
The `catch` component SHALL be registered in the CLI registry with `name: "catch"`, a description, output to `webhooks/catch.ts`, and `requires: ["wire"]`.

#### Scenario: Catch requires wire
- **WHEN** a user runs `npx khotan add catch` without wire scaffolded
- **THEN** the CLI SHALL offer to add the required wire component first

#### Scenario: Catch scaffolds to webhooks directory
- **WHEN** a user runs `npx khotan add catch`
- **THEN** the `catch.ts` file SHALL be created at `{outputDir}/webhooks/catch.ts`
