## MODIFIED Requirements

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
