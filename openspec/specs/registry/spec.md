## Purpose

The registry defines and organises all items that can be scaffolded via `npx khotan add <name>`. Items are split into two categories — **components** and **blocks** — which share the same underlying entry structure and scaffolding mechanism but serve fundamentally different roles.

**Components** are reusable building blocks: library code, UI primitives, schema definitions, API routes. A component never creates a page or navigable route on its own. It is meant to be imported and composed by application code (or by blocks).

**Blocks** are sample routes/pages composed from components. A block wires one or more components into the app router so the user can see them running immediately after scaffolding. Blocks are opinionated starting points — the user owns the output and can restyle, restructure, or delete them.

```
┌─────────────────────────────────────────────────────┐
│                  khotan add <name>                   │
├──────────────────────┬──────────────────────────────┤
│     Components       │          Blocks              │
│                      │                              │
│  plug                │  config-page-1               │
│  schema              │  (future blocks)             │
│  hub                 │                              │
│                      │                              │
│  Library code, UI,   │  Sample routes/pages that    │
│  schemas, API routes │  compose components into     │
│                      │  a running page              │
│                      │                              │
│  Never create pages  │  Always create pages         │
└──────────────────────┴──────────────────────────────┘
```

## Requirements

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

### Requirement: Unified add command
The `add` command SHALL resolve the given name against both components and blocks. Components are checked first, then blocks.

#### Scenario: Add a component by name
- **WHEN** a user runs `npx khotan add hub`
- **THEN** the CLI SHALL look up "hub" in the components registry and scaffold it

#### Scenario: Add a block by name
- **WHEN** a user runs `npx khotan add config-page-1`
- **THEN** the CLI SHALL look up "config-page-1" in the blocks registry and scaffold it

#### Scenario: Name not found in either registry
- **WHEN** a user runs `npx khotan add nonexistent`
- **THEN** the CLI SHALL display an error listing available components and blocks as separate groups

### Requirement: Registry lookup functions
The registry SHALL export lookup functions for both categories: `getComponent(name)`, `getBlock(name)`, and `getEntry(name)` which searches both and returns the entry with its `kind` ("component" or "block").

#### Scenario: getEntry returns kind discriminator
- **WHEN** `getEntry("hub")` is called
- **THEN** it SHALL return `{ entry: <hub entry>, kind: "component" }`

- **WHEN** `getEntry("config-page-1")` is called
- **THEN** it SHALL return `{ entry: <config-page-1 entry>, kind: "block" }`

### Requirement: appRoot output base
The registry SHALL support an `appRoot` output base that resolves to the app directory root (`src/app` or `app` depending on project layout). This enables blocks to place pages at arbitrary routes using their `outputFile` path relative to the app root.

#### Scenario: Block places page at /config
- **WHEN** a block entry specifies `outputBase: "appRoot"` and `outputFile: "config/page.tsx"`
- **THEN** the scaffolder SHALL create the file at `src/app/config/page.tsx` (or `app/config/page.tsx` for non-src layouts)

### Requirement: Listing functions
The registry SHALL export `listComponents()` and `listBlocks()` functions that return entries for their respective categories.

#### Scenario: List components
- **WHEN** `listComponents()` is called
- **THEN** it SHALL return only entries from the components registry

#### Scenario: List blocks
- **WHEN** `listBlocks()` is called
- **THEN** it SHALL return only entries from the blocks registry

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

### Requirement: Registry includes graph component
The component registry SHALL include metadata for a `graph` scaffold target that maps to standalone graph templates.

#### Scenario: Graph appears in registry listing
- **WHEN** the CLI resolves available components from the registry
- **THEN** the registry SHALL include a `graph` entry with description and template mapping metadata

#### Scenario: Graph registry entry resolves templates
- **WHEN** a user runs `npx khotan add graph`
- **THEN** the registry SHALL resolve the graph page template and standalone topology component template for generation

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
