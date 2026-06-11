## ADDED Requirements

### Requirement: Agent skill registry entry
The registry SHALL include an `agent-skill` component entry that scaffolds the probe skill file for AI agents.

#### Scenario: Agent skill component registered
- **WHEN** the registry is queried for `agent-skill`
- **THEN** it SHALL return a component entry with:
  - `name`: `"agent-skill"`
  - `description`: A description indicating it teaches AI agents to use khotan probe
  - `templatePath`: pointing to the `agent-skill.md` template
  - `outputFile`: `.cursor/skills/khotan-probe/SKILL.md`
  - `outputBase`: a base that resolves to project root

#### Scenario: Agent skill has no dependencies
- **WHEN** the agent-skill component is scaffolded
- **THEN** it SHALL NOT require any npm packages, shadcn components, or other khotan components
