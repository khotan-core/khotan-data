## MODIFIED Requirements

### Requirement: Agent skill template
Generated khotan skill templates SHALL use flow and variable terminology consistently when describing configuration, runtime APIs, and dashboard operations.

#### Scenario: Skill guidance references flows
- **WHEN** skill templates explain plug ETL registration
- **THEN** they SHALL reference `flows` as plug sub-resources

#### Scenario: Skill guidance references variables
- **WHEN** skill templates explain plug secret/config management
- **THEN** they SHALL reference variables terminology instead of credentials terminology

## REMOVED Requirements

### Requirement: Sync and credentials wording in generated skills
**Reason**: Hard rename across product language and public interfaces.
**Migration**: Update generated skills and router docs to flow/variables terms.

#### Scenario: Legacy wording removed
- **WHEN** skill files are scaffolded
- **THEN** they SHALL NOT teach sync or credentials terminology for current APIs
