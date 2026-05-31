## ADDED Requirements

### Requirement: Package manager detection
The CLI SHALL detect the user's package manager by checking for lockfiles in priority order: `bun.lock` → `pnpm-lock.yaml` → `yarn.lock` → `package-lock.json`. If none found, it SHALL default to `npm`.

#### Scenario: Detect pnpm from lockfile
- **WHEN** the project root contains `pnpm-lock.yaml`
- **THEN** the CLI SHALL use `pnpm` for all install commands

#### Scenario: Detect bun from lockfile
- **WHEN** the project root contains `bun.lock`
- **THEN** the CLI SHALL use `bun` for all install commands

#### Scenario: Detect yarn from lockfile
- **WHEN** the project root contains `yarn.lock`
- **THEN** the CLI SHALL use `yarn` for all install commands

#### Scenario: Fall back to npm
- **WHEN** no lockfile is found in the project root
- **THEN** the CLI SHALL default to `npm`

#### Scenario: Priority when multiple lockfiles exist
- **WHEN** both `pnpm-lock.yaml` and `package-lock.json` exist
- **THEN** the CLI SHALL use `pnpm` (higher priority)

### Requirement: npm package dependency detection
The CLI SHALL check the user's `package.json` for required npm packages (in both `dependencies` and `devDependencies`) before scaffolding a component that requires them.

#### Scenario: Detect missing drizzle-orm for schema
- **WHEN** a user runs `npx khotan add schema` and `drizzle-orm` is not in `package.json`
- **THEN** the CLI SHALL prompt the user to install `drizzle-orm`
- **AND** if the user accepts, the CLI SHALL run the appropriate install command using the detected package manager

#### Scenario: Detect missing drizzle-orm for hub
- **WHEN** a user runs `npx khotan add hub` and `drizzle-orm` is not in `package.json`
- **THEN** the CLI SHALL prompt the user to install `drizzle-orm`

#### Scenario: Package already installed
- **WHEN** a user runs `npx khotan add schema` and `drizzle-orm` is already in `package.json`
- **THEN** the CLI SHALL NOT prompt for installation and proceed directly to scaffolding

#### Scenario: User declines installation
- **WHEN** the user declines a dependency install prompt
- **THEN** the CLI SHALL print a warning that the component may not work without the dependency
- **AND** the CLI SHALL proceed with scaffolding

### Requirement: shadcn component detection
The CLI SHALL check for required shadcn/ui component files before scaffolding components that depend on them.

#### Scenario: Detect missing shadcn components for hub
- **WHEN** a user runs `npx khotan add hub` and shadcn components (`card`, `badge`, `table`, `switch`) are not all present
- **THEN** the CLI SHALL prompt the user to install the missing shadcn components
- **AND** if the user accepts, the CLI SHALL run `npx shadcn@latest add <missing-components>`

#### Scenario: All shadcn components present
- **WHEN** a user runs `npx khotan add hub` and all required shadcn component files exist
- **THEN** the CLI SHALL NOT prompt for shadcn installation and proceed directly to scaffolding

#### Scenario: Partial shadcn components installed
- **WHEN** a user runs `npx khotan add hub` and `card` exists but `table` does not
- **THEN** the CLI SHALL only prompt to install the missing components (`table`)

#### Scenario: Resolve component path from components.json
- **WHEN** `components.json` exists with a custom `aliases.components` path
- **THEN** the CLI SHALL check for component files at that configured path
- **AND** if `components.json` does not exist, the CLI SHALL check `components/ui/` and `src/components/ui/` as fallbacks

### Requirement: Auto-accept flag
The `add` command SHALL support a `--yes` / `-y` flag that automatically accepts all dependency install prompts without user interaction.

#### Scenario: Auto-install with --yes
- **WHEN** a user runs `npx khotan add hub --yes` and dependencies are missing
- **THEN** the CLI SHALL install all missing dependencies without prompting

#### Scenario: Auto-install with -y shorthand
- **WHEN** a user runs `npx khotan add schema -y` and `drizzle-orm` is missing
- **THEN** the CLI SHALL install `drizzle-orm` without prompting

### Requirement: Install command execution
The CLI SHALL execute package install commands using the detected package manager and handle success/failure gracefully.

#### Scenario: Successful npm install
- **WHEN** the CLI runs `npm install drizzle-orm` and it succeeds
- **THEN** the CLI SHALL print a success message and continue with scaffolding

#### Scenario: Failed install
- **WHEN** the CLI runs an install command and it fails (non-zero exit code)
- **THEN** the CLI SHALL print the error output
- **AND** the CLI SHALL continue with scaffolding (non-blocking)

#### Scenario: Install as dev dependency
- **WHEN** the CLI installs `drizzle-kit`
- **THEN** it SHALL be installed as a dev dependency (`--save-dev` / `-D`)
