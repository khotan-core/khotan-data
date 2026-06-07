## MODIFIED Requirements

### Requirement: Two registry categories
The registry SHALL maintain two separate collections: `COMPONENTS` and `BLOCKS`. Both collections SHALL use the same `ComponentEntry` shape so the scaffolding pipeline treats them uniformly.

#### Scenario: Component does not create a page route
- **WHEN** a component is scaffolded
- **THEN** none of its output files SHALL be a `page.tsx` or `page.ts` file inside the app directory

#### Scenario: Block creates at least one page route
- **WHEN** a block is scaffolded
- **THEN** at least one of its output files SHALL be a `page.tsx` or `page.ts` file inside the app directory

#### Scenario: Plug component scaffolds multiple files
- **WHEN** a user runs `npx khotan add plug`
- **THEN** the CLI SHALL scaffold both `plug.ts` (the Plug class) and `plug.example.ts` (the example contract file)
- **AND** both files SHALL be placed in the plugs subdirectory of the output directory

## ADDED Requirements

### Requirement: Plug example contract template
The registry SHALL include a `plug.example.ts` template file that demonstrates the typed endpoints pattern. The file SHALL show: importing `zod` and `defineContract`/`createPlugClient` from `khotan-data/plug`, defining a contract with 2-3 example endpoints (GET list, GET by id, POST create), and creating a typed client.

#### Scenario: Example file is self-contained
- **WHEN** the `plug.example.ts` template is scaffolded
- **THEN** the file SHALL be a complete, runnable example that imports from `./plug` and `khotan-data/plug`
- **AND** the file SHALL include inline comments explaining the pattern

#### Scenario: Example shows path params, query, and body
- **WHEN** a user reads the scaffolded `plug.example.ts`
- **THEN** it SHALL demonstrate at least one endpoint with path params (`:id`), one with query params, and one with a request body

### Requirement: Plug component dependencies updated
The `plug` registry entry SHALL declare `zod` as an npm dependency so the CLI offers to install it during scaffolding.

#### Scenario: CLI offers to install zod
- **WHEN** a user runs `npx khotan add plug` and `zod` is not installed
- **THEN** the CLI SHALL list `zod` as a missing package and offer to install it

#### Scenario: No @ts-rest/core dependency
- **WHEN** a user runs `npx khotan add plug`
- **THEN** the CLI SHALL NOT require or suggest installing `@ts-rest/core`
