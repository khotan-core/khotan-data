## MODIFIED Requirements

### Requirement: Add command
The CLI SHALL provide an `add <component>` command that scaffolds a component file into the user's project at the configured output directory.

#### Scenario: Add hub component
- **WHEN** a user runs `npx khotan add hub` in a project with a valid `khotan.config.ts`
- **THEN** the CLI SHALL scaffold multiple files: `components/khotan/hub.tsx`, the catch-all API route, and the khotan config file
- **AND** the CLI SHALL print a success message listing all created files and next steps

#### Scenario: Add schema component with Drizzle config detection
- **WHEN** a user runs `npx khotan add schema` in a project with a `drizzle.config.ts` that specifies a schema path
- **THEN** the CLI SHALL read `drizzle.config.ts` to determine the schema directory
- **AND** the CLI SHALL place `schema.ts` in the detected Drizzle schema directory (e.g., `src/db/schema/khotan.ts` or `db/schema/khotan.ts`)
- **AND** the CLI SHALL print a re-export hint using the detected path

#### Scenario: Add schema when Drizzle config not found
- **WHEN** a user runs `npx khotan add schema` and no `drizzle.config.ts` exists
- **THEN** the CLI SHALL prompt the user for the schema output directory
- **AND** the CLI SHALL default the prompt to the current `outputDir` from `khotan.config.ts`

#### Scenario: Add schema when Drizzle config schema path is unparseable
- **WHEN** a user runs `npx khotan add schema` and `drizzle.config.ts` exists but the schema path cannot be extracted
- **THEN** the CLI SHALL fall back to prompting the user for the schema output directory

#### Scenario: Add plug component (unchanged)
- **WHEN** a user runs `npx khotan add plug` in a project with a valid `khotan.config.ts`
- **THEN** the CLI SHALL create a `plug.ts` file at `<outputDir>/plug.ts`

## ADDED Requirements

### Requirement: Multi-file component scaffolding
The CLI `add` command SHALL support components that scaffold multiple files to different locations. The registry SHALL allow a component to specify an array of files with their respective output paths.

#### Scenario: Component with multiple output files
- **WHEN** a component in the registry specifies multiple files
- **THEN** the CLI SHALL create each file at its specified location relative to the project root
- **AND** the CLI SHALL create any necessary directories

#### Scenario: Partial overwrite prompt
- **WHEN** a multi-file component is being scaffolded and some files already exist
- **THEN** the CLI SHALL prompt for overwrite confirmation for each existing file individually (or all at once with `--force`)
