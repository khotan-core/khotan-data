## ADDED Requirements

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
