## ADDED Requirements

### Requirement: Registry includes graph component
The component registry SHALL include metadata for a `graph` scaffold target that maps to standalone graph templates.

#### Scenario: Graph appears in registry listing
- **WHEN** the CLI resolves available components from the registry
- **THEN** the registry SHALL include a `graph` entry with description and template mapping metadata

#### Scenario: Graph registry entry resolves templates
- **WHEN** a user runs `npx khotan add graph`
- **THEN** the registry SHALL resolve the graph page template and standalone topology component template for generation
