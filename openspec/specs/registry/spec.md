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
