## ADDED Requirements

### Requirement: Registry includes cache component
The component registry SHALL include metadata for a `cache` scaffold target that generates reusable cache-definition source files for khotan projects.

#### Scenario: Cache component appears in component listing
- **WHEN** the CLI resolves available components from the registry
- **THEN** the registry SHALL include a `cache` component entry
- **AND** that entry SHALL describe it as a first-class durable cache component for khotan sync workloads

#### Scenario: Cache component resolves template files
- **WHEN** a user runs `npx khotan add cache`
- **THEN** the registry SHALL resolve the template files required to scaffold the cache builder and example files

#### Scenario: Cache remains a component
- **WHEN** the registry returns the `cache` entry
- **THEN** the entry SHALL be classified as a component rather than a block
- **AND** its scaffolded files SHALL not create an app-router page

### Requirement: Cache scaffold follows owned-code conventions
The `cache` scaffold target SHALL generate owned source files that users can customize and then register in `khotan.ts`.

#### Scenario: Cache builder file is scaffolded
- **WHEN** a user scaffolds the `cache` component
- **THEN** the generated files SHALL include a reusable builder or registration helper for defining cache behavior

#### Scenario: Cache example file is scaffolded
- **WHEN** a user scaffolds the `cache` component
- **THEN** the generated files SHALL include an example file showing how to define a cache and register it in `khotan.ts`

### Requirement: Cache dependencies are declared
The registry entry for `cache` SHALL declare any required khotan dependencies needed for successful generation.

#### Scenario: Cache requires schema support
- **WHEN** the registry is queried for `cache`
- **THEN** its metadata SHALL require the khotan schema component so the generated project has the standard cache tables available
