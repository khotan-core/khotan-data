## Purpose

The khotan CLI scaffolds components and blocks into the user's project following the shadcn model — run a command, get owned code. It provides `init` and `add` commands for project setup and component/block installation.

## Requirements

### Requirement: CLI entry point
The package SHALL expose a `khotan` CLI binary via the `bin` field in `package.json`. The CLI SHALL be invokable as `npx khotan <command>`.

#### Scenario: CLI is available after install
- **WHEN** a user runs `npx khotan` with no arguments
- **THEN** the CLI SHALL display usage help listing available commands including `probe`

### Requirement: Init command
The CLI SHALL provide an `init` command that scaffolds a `khotan.config.ts` file into the user's project root. The command SHALL support a `--full` flag for complete project setup. The command SHALL optionally install the khotan agent skill suite.

#### Scenario: First-time init
- **WHEN** a user runs `npx khotan init` in a project with no existing khotan config
- **THEN** the CLI SHALL create a `khotan.config.ts` file in the project root with default configuration (outputDir: `src/lib/khotan`, empty components array)
- **AND** the CLI SHALL prompt whether to install agent skills for AI-assisted development
- **AND** the CLI SHALL print a success message with the created file path

#### Scenario: Init with --yes auto-installs skills
- **WHEN** a user runs `npx khotan init --yes`
- **THEN** the CLI SHALL install the khotan agent skills into detected agent directories without prompting
- **AND** the installed skills SHALL include `khotan-probe` at `<agent-dir>/skills/khotan-probe/SKILL.md`

#### Scenario: Init auto-installs khotan-data
- **WHEN** a user runs `npx khotan init` and `khotan-data` is not in the consumer's `package.json` dependencies
- **THEN** the CLI SHALL automatically install `khotan-data` using the detected package manager after creating `khotan.config.ts`

#### Scenario: Init skips khotan-data install when already present
- **WHEN** a user runs `npx khotan init` and `khotan-data` is already in the consumer's `package.json`
- **THEN** the CLI SHALL skip the `khotan-data` install step

#### Scenario: Init when config already exists
- **WHEN** a user runs `npx khotan init` in a project that already has a `khotan.config.ts`
- **THEN** the CLI SHALL warn the user that a config already exists
- **AND** the CLI SHALL NOT overwrite the existing config
- **AND** the CLI SHALL still check and install `khotan-data` if missing

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

### Requirement: Components vs Blocks
The add command supports two categories of addable items — **components** and **blocks**. See the [registry spec](../registry/spec.md) for the full definition of each category and the registry API. In the CLI context, both are scaffolded identically via `khotan add <name>`.

#### Scenario: Unknown name shows both categories
- **WHEN** a user runs `npx khotan add unknown-thing`
- **THEN** the CLI SHALL display an error listing available components and blocks as separate groups

### Requirement: Add command
The CLI SHALL provide an `add <name>` command that scaffolds a component or block into the user's project at the configured output directory.

#### Scenario: Add hub component
- **WHEN** a user runs `npx khotan add hub` in a project with a valid `khotan.config.ts`
- **THEN** the CLI SHALL scaffold multiple files: `components/khotan/hub.tsx`, the catch-all API route, and the khotan config file
- **AND** the CLI SHALL print a success message listing all created files and next steps

#### Scenario: Add schema component with Drizzle config detection
- **WHEN** a user runs `npx khotan add schema` in a project with a `drizzle.config.ts` that specifies a schema path
- **THEN** the CLI SHALL read `drizzle.config.ts` to determine the schema directory
- **AND** the CLI SHALL place `khotan.ts` in the detected Drizzle schema directory (e.g., `src/db/khotan.ts` or `db/schema/khotan.ts`)

#### Scenario: Add schema updates drizzle.config.ts when schema is a single file
- **WHEN** a user runs `npx khotan add schema` and `drizzle.config.ts` has `schema` pointing to a single file (e.g., `"./src/db/schema.ts"`)
- **THEN** the CLI SHALL warn that Drizzle Kit won't pick up `khotan.ts` with a single-file schema
- **AND** the CLI SHALL prompt the user to update the schema value to a glob (e.g., `"./src/db/*"`)
- **AND** if accepted, the CLI SHALL rewrite the schema value in `drizzle.config.ts` preserving the quote style
- **AND** the CLI SHALL print a confirmation of what was changed

#### Scenario: Add schema skips drizzle.config.ts update when schema is already a glob
- **WHEN** a user runs `npx khotan add schema` and `drizzle.config.ts` has `schema` pointing to a glob or directory
- **THEN** the CLI SHALL NOT prompt about `drizzle.config.ts`
- **AND** the CLI SHALL NOT modify `drizzle.config.ts`

#### Scenario: Add schema updates barrel file with prompt
- **WHEN** a user runs `npx khotan add schema` and an `index.ts` barrel file exists in the detected schema directory
- **AND** the barrel file does not already re-export from `./khotan`
- **THEN** the CLI SHALL prompt the user to add `export * from "./khotan"` to the barrel file
- **AND** if accepted, the CLI SHALL append the re-export and print a confirmation

#### Scenario: Add schema skips barrel update when already present
- **WHEN** a user runs `npx khotan add schema` and the barrel `index.ts` already contains a re-export from `./khotan`
- **THEN** the CLI SHALL NOT modify the barrel file
- **AND** the CLI SHALL print a message indicating the barrel already re-exports khotan

#### Scenario: Add schema prints re-export hint when no barrel exists
- **WHEN** a user runs `npx khotan add schema` and no `index.ts` barrel file exists in the schema directory
- **THEN** the CLI SHALL print a re-export hint with the correct import path for the user to add manually

#### Scenario: Add schema --yes auto-accepts config updates
- **WHEN** a user runs `npx khotan add schema --yes`
- **THEN** the CLI SHALL auto-accept the drizzle.config.ts update and barrel update without prompting

#### Scenario: Add schema skips config updates in non-interactive mode
- **WHEN** a user runs `npx khotan add schema` in a non-TTY environment without `--yes`
- **THEN** the CLI SHALL skip the drizzle.config.ts and barrel updates
- **AND** the CLI SHALL print what the user needs to do manually

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

#### Scenario: Add when config is missing (lazy init cascade)
- **WHEN** a user runs `npx khotan add plug` in a project with no `khotan.config.ts`
- **THEN** the CLI SHALL automatically run the init flow (creating `khotan.config.ts` and installing `khotan-data`)
- **AND** the CLI SHALL proceed with the add command after init completes successfully
- **AND** the CLI SHALL print a message indicating init is running before proceeding

#### Scenario: Add when component already exists
- **WHEN** a user runs `npx khotan add plug` and `plug.ts` already exists at the output path
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

#### Scenario: Add config-page-1 block
- **WHEN** a user runs `npx khotan add config-page-1` in a project with a valid `khotan.config.ts`
- **THEN** the CLI SHALL create `app/config/page.tsx` (or `src/app/config/page.tsx` for src layout)
- **AND** the page SHALL import and render the `<KhotanHub />` component

### Requirement: Add command creates valid component
- **WHEN** a user runs `npx khotan add plug` successfully
- **THEN** the created `plug.ts` file SHALL be valid TypeScript that compiles without errors
- **AND** the file SHALL have zero runtime imports from `khotan-data`
- **AND** the file SHALL be fully self-contained

#### Scenario: Scaffolded plug compiles
- **WHEN** the user runs `tsc --noEmit` on their project after adding plug
- **THEN** the plug.ts file SHALL produce no type errors

### Requirement: CLI scaffolds graph block
The CLI SHALL provide a `graph` scaffold target that generates a standalone graph page and topology component files.

#### Scenario: Add graph block
- **WHEN** a user runs `npx khotan add graph`
- **THEN** the CLI SHALL scaffold a standalone graph page file in the app routes
- **AND** the CLI SHALL scaffold a reusable topology component file under the khotan component output path
- **AND** the CLI SHALL print a success message listing all created files

#### Scenario: Graph files already exist
- **WHEN** a user runs `npx khotan add graph` and target files already exist
- **THEN** the CLI SHALL prompt for overwrite confirmation for each existing file (or use `--force` to skip prompts)

### Requirement: Mappings command group
The CLI SHALL provide a `mappings` command group for operational mapping management. All mappings command output SHALL be valid JSON to stdout for both success and error cases.

#### Scenario: Mappings command appears in CLI help
- **WHEN** a user runs `npx khotan --help`
- **THEN** the CLI help output SHALL list the `mappings` command group

#### Scenario: Mappings commands emit JSON only
- **WHEN** any `khotan mappings` subcommand executes
- **THEN** stdout SHALL contain a single valid JSON payload
- **AND** the command SHALL NOT write human-only formatting, colors, or progress text to stdout

### Requirement: Mappings base connectivity contract
Mappings commands SHALL use the running Khotan API through the same base-path and port resolution model as other operational commands.

#### Scenario: Explicit port and base path are honored
- **WHEN** a user runs a mappings command with `--port 4000 --base-path /api/custom-khotan`
- **THEN** the CLI SHALL target `http://localhost:4000/api/custom-khotan`

#### Scenario: Connectivity failure is machine-readable
- **WHEN** the Khotan API is unreachable
- **THEN** the CLI SHALL return a JSON error payload with `ok: false`
- **AND** the payload SHALL include an error code and actionable hint

### Requirement: Mappings list command
The CLI SHALL provide a paginated `mappings list` command scoped to a resource. The command SHALL support pagination and search-oriented browsing.

#### Scenario: List mappings for one resource
- **WHEN** a user runs `npx khotan mappings list <resource>`
- **THEN** the CLI SHALL request mappings for that resource
- **AND** the JSON output SHALL include the returned mapping rows

#### Scenario: List mappings with explicit pagination
- **WHEN** a user runs `npx khotan mappings list <resource> --limit 25 --offset 50`
- **THEN** the CLI SHALL request the specified slice
- **AND** the JSON output SHALL include paging metadata along with the items

#### Scenario: List mappings with search
- **WHEN** a user runs `npx khotan mappings list <resource> --search "alice@example.com"`
- **THEN** the CLI SHALL request a filtered mapping list using the provided search term

#### Scenario: Unknown resource fails clearly
- **WHEN** a user runs `npx khotan mappings list nonexistent-resource`
- **THEN** the CLI SHALL return a JSON error payload indicating that the resource could not be resolved

### Requirement: Mappings lookup command
The CLI SHALL provide a `mappings lookup` command that supports lookup by canonical `connectValue` and by plug ref.

#### Scenario: Lookup by connect value
- **WHEN** a user runs `npx khotan mappings lookup <resource> --connect-value alice@example.com`
- **THEN** the CLI SHALL resolve the resource and request the mapping by canonical `connectValue`
- **AND** the JSON output SHALL include the resolved mapping row on success

#### Scenario: Lookup by plug ref
- **WHEN** a user runs `npx khotan mappings lookup <resource> --plug shopify --ref gid://shopify/Customer/123`
- **THEN** the CLI SHALL request the mapping by plug ref
- **AND** the JSON output SHALL include the resolved mapping row on success

#### Scenario: Lookup rejects missing mode
- **WHEN** a user runs `npx khotan mappings lookup <resource>` without either `--connect-value` or `--plug` plus `--ref`
- **THEN** the CLI SHALL return a JSON validation error explaining the accepted lookup modes

#### Scenario: Lookup rejects incomplete plug-ref mode
- **WHEN** a user passes `--plug shopify` without `--ref`
- **THEN** the CLI SHALL return a JSON validation error rather than making a malformed API request

### Requirement: Mappings upsert command
The CLI SHALL provide a `mappings upsert` command that creates or updates a mapping using canonical `connectValue`, refs JSON, and optional metadata JSON.

#### Scenario: Create new mapping
- **WHEN** a user runs `npx khotan mappings upsert <resource> --connect-value alice@example.com --refs '{"shopify":"gid://..."}'`
- **THEN** the CLI SHALL create a mapping if one does not already exist
- **AND** the JSON output SHALL include the mapping identity result

#### Scenario: Update existing mapping by natural key
- **WHEN** a user upserts a mapping for the same resource and canonical `connectValue`
- **THEN** the CLI SHALL update that existing mapping rather than create a duplicate

#### Scenario: Upsert accepts metadata
- **WHEN** a user passes `--metadata '{"firstName":"Alice","lastName":"Jones"}'`
- **THEN** the CLI SHALL send the metadata payload along with the upsert request

#### Scenario: Upsert rejects invalid JSON
- **WHEN** a user passes malformed JSON to `--refs` or `--metadata`
- **THEN** the CLI SHALL return a JSON validation error without issuing the API request

### Requirement: Mappings update command
The CLI SHALL provide a `mappings update` command that updates one mapping by row ID.

#### Scenario: Update mapping by ID
- **WHEN** a user runs `npx khotan mappings update <mappingId> --resource <resource> --connect-value alice@example.com --refs '{"shopify":"gid://...","cin7":"cust_456"}'`
- **THEN** the CLI SHALL issue an update request for that row ID
- **AND** the JSON output SHALL include the updated mapping identity result

#### Scenario: Update allows metadata replacement
- **WHEN** a user passes `--metadata` on update
- **THEN** the CLI SHALL send the metadata payload for replacement according to the runtime contract

### Requirement: Mappings delete command
The CLI SHALL provide a `mappings delete` command that deletes one mapping by row ID.

#### Scenario: Delete mapping by ID
- **WHEN** a user runs `npx khotan mappings delete <mappingId>`
- **THEN** the CLI SHALL delete that mapping row
- **AND** the JSON output SHALL indicate success

#### Scenario: Delete unknown mapping returns machine-readable error
- **WHEN** a user attempts to delete a nonexistent mapping row
- **THEN** the CLI SHALL return a JSON error payload rather than silently succeeding

### Requirement: Resource resolution for mappings commands
Mappings CLI commands SHALL allow callers to target a resource by the resource's registered name and SHALL resolve the backing resource record before issuing resource-scoped mapping operations.

#### Scenario: Resolve resource by name for list
- **WHEN** a user runs `npx khotan mappings list customers`
- **THEN** the CLI SHALL resolve the `customers` resource record before calling the resource-scoped mappings endpoint

#### Scenario: Resolve resource by name for lookup
- **WHEN** a user runs `npx khotan mappings lookup customers --connect-value alice@example.com`
- **THEN** the CLI SHALL resolve the `customers` resource record before issuing the lookup request
