## ADDED Requirements

### Requirement: Flow component entries
The components registry SHALL include entries for `inflow`, `outflow`, and `relay`.

#### Scenario: Registry resolves inflow component
- **WHEN** `getComponent("inflow")` is called
- **THEN** it SHALL return a component entry with an inflow template path and output file under `flows/`

#### Scenario: Registry resolves outflow component
- **WHEN** `getComponent("outflow")` is called
- **THEN** it SHALL return a component entry with an outflow template path and output file under `flows/`

#### Scenario: Registry resolves relay component
- **WHEN** `getComponent("relay")` is called
- **THEN** it SHALL return a component entry with a relay template path and output file under `flows/`

## MODIFIED Requirements

### Requirement: Registry descriptions and labels
Registry-provided descriptions for ETL entries SHALL use flow terminology and SHALL NOT use sync-first naming for Inflow, Outflow, or Relay entries.

#### Scenario: Component listing uses flow naming
- **WHEN** a user lists addable components
- **THEN** registry metadata for ETL components SHALL describe them as flows
