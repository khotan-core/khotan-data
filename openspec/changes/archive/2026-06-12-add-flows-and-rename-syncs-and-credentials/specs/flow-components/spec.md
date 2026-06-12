## ADDED Requirements

### Requirement: Separate flow component templates
The CLI SHALL scaffold three separate flow component templates: `inflow`, `outflow`, and `relay`. Each component SHALL generate its own file under a flows directory in the user output path and define a Vercel Workflow-backed builder with typed context.

#### Scenario: Add inflow component
- **WHEN** a user runs `npx khotan add inflow`
- **THEN** the CLI SHALL scaffold a flow template file for inflow
- **AND** the output path SHALL be under `<outputDir>/flows/`
- **AND** the template SHALL expose an `inflow()` builder that accepts a Workflow function

#### Scenario: Add outflow component
- **WHEN** a user runs `npx khotan add outflow`
- **THEN** the CLI SHALL scaffold a flow template file for outflow
- **AND** the output path SHALL be under `<outputDir>/flows/`
- **AND** the template SHALL expose an `outflow()` builder that accepts a Workflow function

#### Scenario: Add relay component
- **WHEN** a user runs `npx khotan add relay`
- **THEN** the CLI SHALL scaffold a flow template file for relay
- **AND** the output path SHALL be under `<outputDir>/flows/`
- **AND** the template SHALL expose a `relay()` builder that accepts a Workflow function and destination `to`

### Requirement: Flow components are plug sub-resources
The runtime config SHALL model flows as sub-resources of plugs. A plug registration SHALL use a `flows` array to register flow entries.

#### Scenario: Register plug with flows
- **WHEN** a user defines a plug with `flows: [{ name, type, ... }]`
- **THEN** the factory SHALL accept the registration and treat each entry as owned by that plug

### Requirement: Flow execution and run tracking
The factory SHALL support manual/API-triggered flow execution for `inflow`, `outflow`, and `relay`, and SHALL write execution records to `khotan_runs`.

#### Scenario: Trigger flow run
- **WHEN** a flow is triggered through the factory API
- **THEN** the factory SHALL start the flow execution path for that flow type
- **AND** the factory SHALL create a run record in `khotan_runs`
- **AND** if the registered flow has a Workflow function, the factory SHALL start it through Vercel Workflow and persist the Workflow run ID

#### Scenario: Track run lifecycle
- **WHEN** a flow run starts and completes
- **THEN** the run record SHALL include run status transitions and execution counters
