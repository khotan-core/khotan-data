## Why

AI agents working in khotan-data projects cannot easily fire requests through plugs to verify API response shapes against typed endpoint definitions. Today this requires writing throwaway scripts, manually constructing auth headers, or navigating the browser-based plug debugger. A CLI command lets an agent (or developer in terminal) probe APIs instantly through the real plug code path and diff responses against declared types — collapsing a multi-step manual process into a single command.

## What Changes

- Add `khotan probe` CLI command that hits the running dev server's debug route to fire requests through configured plugs
- Add a deep schema comparison engine that infers the shape of an actual JSON response and diffs it against the declared Zod endpoint schema
- Add an agent skill file (`SKILL.md`) that teaches AI agents when and how to use the probe command
- Extend `khotan init` and the CLI registry to support scaffolding the agent skill into consumer projects

## Capabilities

### New Capabilities
- `probe`: CLI command for firing requests through plugs via the debug route, with sub-modes for listing plugs, showing endpoint info, firing requests, and comparing response shapes against typed schemas
- `agent-skill`: Scaffoldable skill file that teaches AI agents how to use the probe command, installable via `khotan add agent-skill` or optionally during `khotan init`

### Modified Capabilities
- `cli`: Add `probe` command registration and `add agent-skill` support in init flow
- `registry`: Add `agent-skill` entry as a scaffoldable component

## Impact

- **CLI** (`src/cli/index.ts`): Register new `probe` command
- **New files**: `src/cli/commands/probe.ts` (command), `src/cli/compare.ts` (diff engine)
- **Registry** (`src/cli/registry.ts`): New `agent-skill` component entry
- **Templates**: New `agent-skill.md` template file
- **Init command** (`src/cli/commands/init.ts`): Optional prompt to install agent skill
- **Build config** (`tsup.config.ts`): Include new command and template in dist
- **Dependencies**: None new — uses existing `commander` for CLI, existing debug route for execution
