## ADDED Requirements

### Requirement: Registry includes mapping browser component
The component registry SHALL include metadata for a `mapping-browser` scaffold target that generates a reusable mappings management UI component.

#### Scenario: Mapping browser appears in component listing
- **WHEN** the CLI resolves available components from the registry
- **THEN** the registry SHALL include a `mapping-browser` component entry
- **AND** that entry SHALL describe it as a mappings browsing and management surface

#### Scenario: Mapping browser resolves UI templates
- **WHEN** a user runs `npx khotan add mapping-browser`
- **THEN** the registry SHALL resolve the template files required to scaffold the reusable mappings UI component

#### Scenario: Mapping browser remains a component
- **WHEN** the registry returns the `mapping-browser` entry
- **THEN** the entry SHALL be classified as a component rather than a block
- **AND** its scaffolded files SHALL not create a page route on their own

### Requirement: Registry includes mappings page block
The block registry SHALL include metadata for a `mappings-page-1` scaffold target that generates a ready-made page route rendering the mappings browser component.

#### Scenario: Mappings page appears in block listing
- **WHEN** the CLI resolves available blocks from the registry
- **THEN** the registry SHALL include a `mappings-page-1` block entry

#### Scenario: Mappings page block resolves page template
- **WHEN** a user runs `npx khotan add mappings-page-1`
- **THEN** the registry SHALL resolve a page template that renders the mappings browser component

#### Scenario: Mappings page is classified as a block
- **WHEN** the registry returns the `mappings-page-1` entry
- **THEN** the entry SHALL be classified as a block
- **AND** at least one of its output files SHALL create an app-router page

### Requirement: Mapping browser dependencies are declared
The registry entries for the mappings browser component and mappings page block SHALL declare any required khotan components, npm packages, and shadcn dependencies needed for generation.

#### Scenario: Mapping browser declares UI dependencies
- **WHEN** the registry is queried for `mapping-browser`
- **THEN** its metadata SHALL include any shadcn primitives required for searchable table, edit/create, and delete interactions

#### Scenario: Mappings page declares component dependency
- **WHEN** the registry is queried for `mappings-page-1`
- **THEN** its metadata SHALL require the `mapping-browser` component so the page scaffold has the underlying UI available
