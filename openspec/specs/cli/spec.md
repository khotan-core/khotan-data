## Purpose

The khotan CLI scaffolds data components into the user's project following the shadcn model — run a command, get owned code. It provides `init` and `add` commands for project setup and component installation.

## Requirements

### Requirement: CLI entry point
The package SHALL expose a `khotan` CLI binary via the `bin` field in `package.json`. The CLI SHALL be invokable as `npx khotan <command>`.

#### Scenario: CLI is available after install
- **WHEN** a user runs `npx khotan` with no arguments
- **THEN** the CLI SHALL display usage help listing available commands

### Requirement: Init command
The CLI SHALL provide an `init` command that scaffolds a `khotan.config.ts` file into the user's project root. The command SHALL support a `--full` flag for complete project setup.

#### Scenario: First-time init
- **WHEN** a user runs `npx khotan init` in a project with no existing khotan config
- **THEN** the CLI SHALL create a `khotan.config.ts` file in the project root with default configuration (outputDir: `src/lib/khotan`, empty components array)
- **AND** the CLI SHALL print a success message with the created file path

#### Scenario: Init when config already exists
- **WHEN** a user runs `npx khotan init` in a project that already has a `khotan.config.ts`
- **THEN** the CLI SHALL warn the user that a config already exists
- **AND** the CLI SHALL NOT overwrite the existing config

#### Scenario: Init with --full flag in new project
- **WHEN** a user runs `npx khotan init --full` in a project with no `components.json` and no `drizzle-orm` installed
- **THEN** the CLI SHALL detect the package manager
- **AND** the CLI SHALL install `drizzle-orm`, `drizzle-kit` (dev), and `postgres` as dependencies
- **AND** the CLI SHALL run `npx shadcn@latest init --defaults` to initialize shadcn
- **AND** the CLI SHALL run `npx shadcn@latest add card badge table switch` to install required components
- **AND** the CLI SHALL create `khotan.config.ts`
- **AND** the CLI SHALL print a summary of everything that was set up

#### Scenario: Init with --full when shadcn already configured
- **WHEN** a user runs `npx khotan init --full` and `components.json` already exists
- **THEN** the CLI SHALL skip `npx shadcn init`
- **AND** the CLI SHALL still install any missing shadcn components (`card`, `badge`, `table`, `switch`)

#### Scenario: Init with --full when drizzle already installed
- **WHEN** a user runs `npx khotan init --full` and `drizzle-orm` is already in `package.json`
- **THEN** the CLI SHALL skip drizzle-related package installation
- **AND** the CLI SHALL still proceed with shadcn setup and config creation

#### Scenario: Init with --full failure recovery
- **WHEN** a user runs `npx khotan init --full` and a sub-step fails (e.g., shadcn init fails)
- **THEN** the CLI SHALL print the error for the failed step
- **AND** the CLI SHALL continue with remaining steps
- **AND** the CLI SHALL print a summary at the end noting which steps succeeded and which failed

### Requirement: Add command
The CLI SHALL provide an `add <component>` command that scaffolds a component file into the user's project at the configured output directory.

#### Scenario: Add wire component
- **WHEN** a user runs `npx khotan add wire` in a project with a valid `khotan.config.ts`
- **THEN** the CLI SHALL create a `wire.ts` file at `<outputDir>/wire.ts` (e.g., `src/lib/khotan/wire.ts`)
- **AND** the CLI SHALL create the output directory if it does not exist
- **AND** the CLI SHALL print a success message with the created file path and a usage hint

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

#### Scenario: Add plug component
- **WHEN** a user runs `npx khotan add plug` in a project with a valid `khotan.config.ts`
- **THEN** the CLI SHALL create a `plug.ts` file at `<outputDir>/plug.ts`

#### Scenario: Add when config is missing
- **WHEN** a user runs `npx khotan add wire` in a project with no `khotan.config.ts`
- **THEN** the CLI SHALL display an error telling the user to run `npx khotan init` first

#### Scenario: Add when component already exists
- **WHEN** a user runs `npx khotan add wire` and `wire.ts` already exists at the output path
- **THEN** the CLI SHALL warn the user that the file already exists
- **AND** the CLI SHALL prompt the user to confirm overwrite before proceeding

### Requirement: Multi-file component scaffolding
The CLI `add` command SHALL support components that scaffold multiple files to different locations. The registry SHALL allow a component to specify an array of files with their respective output paths.

#### Scenario: Component with multiple output files
- **WHEN** a component in the registry specifies multiple files
- **THEN** the CLI SHALL create each file at its specified location relative to the project root
- **AND** the CLI SHALL create any necessary directories

#### Scenario: Partial overwrite prompt
- **WHEN** a multi-file component is being scaffolded and some files already exist
- **THEN** the CLI SHALL prompt for overwrite confirmation for each existing file individually (or all at once with `--force`)

### Requirement: Add command creates valid component
- **WHEN** a user runs `npx khotan add wire` successfully
- **THEN** the created `wire.ts` file SHALL be valid TypeScript that compiles without errors
- **AND** the file SHALL have zero runtime imports from `khotan-data`
- **AND** the file SHALL be fully self-contained

#### Scenario: Scaffolded wire compiles
- **WHEN** the user runs `tsc --noEmit` on their project after adding wire
- **THEN** the wire.ts file SHALL produce no type errors
