## Purpose

The agent skill is a scaffoldable markdown file that teaches AI agents (Cursor, Claude, etc.) how to use the `khotan probe` CLI command for API debugging, endpoint exploration, and type verification.

## Requirements

### Requirement: Agent skill template
The package SHALL include a skill template file (`agent-skill.md`) that teaches AI agents how to use the `khotan probe` command. The template SHALL be a valid Cursor/Claude skill file format.

#### Scenario: Skill file content
- **WHEN** the agent skill is scaffolded into a project
- **THEN** the resulting `SKILL.md` file SHALL include:
  - A trigger description explaining when to use the skill (API shape verification, type mismatch debugging, endpoint exploration)
  - Complete command syntax for all probe sub-modes (`--list`, `--info`, fire request, `--endpoint`, `--compare`)
  - Output format description so the agent knows how to parse results
  - Common workflow patterns (discover → probe → compare → fix)

### Requirement: Skill scaffolding via add command
The agent skill SHALL be installable via `npx khotan add agent-skill`. The skill file SHALL be placed at `.cursor/skills/khotan-probe/SKILL.md` relative to the project root.

#### Scenario: Add agent skill
- **WHEN** a user runs `npx khotan add agent-skill`
- **THEN** the CLI SHALL create `.cursor/skills/khotan-probe/SKILL.md` in the project root
- **AND** the CLI SHALL print a success message confirming the skill was installed

#### Scenario: Add agent skill when already exists
- **WHEN** a user runs `npx khotan add agent-skill` and the skill file already exists
- **THEN** the CLI SHALL prompt for overwrite confirmation (following existing add command behavior)

### Requirement: Skill installation during init
The `khotan init` command SHALL ask once whether to install the khotan agent skill set. The prompt SHALL respect the `--yes` flag.

#### Scenario: Init prompts for skill installation
- **WHEN** a user runs `npx khotan init` interactively
- **THEN** the CLI SHALL prompt "Install agent skills for AI-assisted development? (Y/n)"
- **AND** if accepted, the CLI SHALL install the khotan skills to detected agent directories in one step

#### Scenario: Init with --yes installs skills
- **WHEN** a user runs `npx khotan init --yes`
- **THEN** the CLI SHALL install the khotan skill set without prompting

#### Scenario: Init skill prompt declined
- **WHEN** a user runs `npx khotan init` and declines the skill prompt
- **THEN** the CLI SHALL NOT create any khotan skill files
- **AND** the CLI SHALL continue with the rest of init normally
