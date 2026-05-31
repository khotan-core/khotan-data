## ADDED Requirements

### Requirement: CLI entry point
The package SHALL expose a `khotan` CLI binary via the `bin` field in `package.json`. The CLI SHALL be invokable as `npx khotan <command>`.

#### Scenario: CLI is available after install
- **WHEN** a user runs `npx khotan` with no arguments
- **THEN** the CLI SHALL display usage help listing available commands

### Requirement: Init command
The CLI SHALL provide an `init` command that scaffolds a `khotan.config.ts` file into the user's project root.

#### Scenario: First-time init
- **WHEN** a user runs `npx khotan init` in a project with no existing khotan config
- **THEN** the CLI SHALL create a `khotan.config.ts` file in the project root with default configuration (outputDir: `src/lib/khotan`, empty components array)
- **AND** the CLI SHALL print a success message with the created file path

#### Scenario: Init when config already exists
- **WHEN** a user runs `npx khotan init` in a project that already has a `khotan.config.ts`
- **THEN** the CLI SHALL warn the user that a config already exists
- **AND** the CLI SHALL NOT overwrite the existing config

### Requirement: Add command
The CLI SHALL provide an `add <component>` command that scaffolds a component file into the user's project at the configured output directory.

#### Scenario: Add wire component
- **WHEN** a user runs `npx khotan add wire` in a project with a valid `khotan.config.ts`
- **THEN** the CLI SHALL create a `wire.ts` file at `<outputDir>/wire.ts` (e.g., `src/lib/khotan/wire.ts`)
- **AND** the CLI SHALL create the output directory if it does not exist
- **AND** the CLI SHALL print a success message with the created file path and a usage hint

#### Scenario: Add when config is missing
- **WHEN** a user runs `npx khotan add wire` in a project with no `khotan.config.ts`
- **THEN** the CLI SHALL display an error telling the user to run `npx khotan init` first

#### Scenario: Add when component already exists
- **WHEN** a user runs `npx khotan add wire` and `wire.ts` already exists at the output path
- **THEN** the CLI SHALL warn the user that the file already exists
- **AND** the CLI SHALL prompt the user to confirm overwrite before proceeding

### Requirement: Add command creates valid component
- **WHEN** a user runs `npx khotan add wire` successfully
- **THEN** the created `wire.ts` file SHALL be valid TypeScript that compiles without errors
- **AND** the file SHALL have zero runtime imports from `khotan-data`
- **AND** the file SHALL be fully self-contained

#### Scenario: Scaffolded wire compiles
- **WHEN** the user runs `tsc --noEmit` on their project after adding wire
- **THEN** the wire.ts file SHALL produce no type errors
