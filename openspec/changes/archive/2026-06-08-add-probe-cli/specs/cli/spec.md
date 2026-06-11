## MODIFIED Requirements

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
