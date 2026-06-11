## ADDED Requirements

### Requirement: Flow component scaffold commands
The CLI `add` command SHALL support `inflow`, `outflow`, and `relay` as addable components.

#### Scenario: Add inflow component
- **WHEN** a user runs `npx khotan add inflow`
- **THEN** the CLI SHALL scaffold the inflow template into the configured output directory

#### Scenario: Add outflow component
- **WHEN** a user runs `npx khotan add outflow`
- **THEN** the CLI SHALL scaffold the outflow template into the configured output directory

#### Scenario: Add relay component
- **WHEN** a user runs `npx khotan add relay`
- **THEN** the CLI SHALL scaffold the relay template into the configured output directory

## MODIFIED Requirements

### Requirement: Add command
The CLI SHALL scaffold flow and variable terminology in generated files and command guidance. Generated config examples SHALL use `flows` (not `syncs`) and variable wording (not credentials wording).

#### Scenario: Generated config uses flows key
- **WHEN** the CLI scaffolds khotan config examples
- **THEN** it SHALL use `flows` as the plug sub-resource key

#### Scenario: Generated wording uses variables
- **WHEN** the CLI scaffolds UI/runtime templates that reference plug secrets
- **THEN** it SHALL use variable terminology consistently

## REMOVED Requirements

### Requirement: Sync-first scaffold wording
**Reason**: Hard product rename to flows.
**Migration**: Replace CLI usage and generated references from sync/syncs to flow/flows.

#### Scenario: Legacy sync wording removed
- **WHEN** a user runs CLI scaffolding commands
- **THEN** scaffolded output SHALL NOT instruct users to register `syncs`
