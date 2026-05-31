## MODIFIED Requirements

### Requirement: Add command
The CLI SHALL provide an `add <component>` command that scaffolds a component file into the user's project at the configured output directory.

#### Scenario: Add schema component
- **WHEN** a user runs `npx khotan add schema` in a project with a valid `khotan.config.ts`
- **THEN** the CLI SHALL create a `schema.ts` file at `<outputDir>/schema.ts`
- **AND** the CLI SHALL print a success message with the created file path
- **AND** the CLI SHALL print a hint to re-export from the user's Drizzle schema barrel file

#### Scenario: Add plug component (unchanged)
- **WHEN** a user runs `npx khotan add plug` in a project with a valid `khotan.config.ts`
- **THEN** the CLI SHALL create a `plug.ts` file at `<outputDir>/plug.ts`
