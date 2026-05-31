## Why

Running `npx khotan add hub` or `npx khotan add schema` fails with confusing import errors if the user hasn't manually installed the right dependencies (drizzle-orm, shadcn components, etc.). Each component has implicit prerequisites that the user must discover through trial-and-error. For new projects, the setup involves running 4-5 separate commands before khotan is usable.

## What Changes

- `add` commands detect missing dependencies before scaffolding and offer to install them automatically (e.g., `add schema` checks for `drizzle-orm`, `add hub` checks for shadcn components)
- New `init --full` flag performs complete project setup: installs drizzle-orm + driver, initializes shadcn, installs required shadcn components, then runs the normal `init`
- Dependency detection is non-blocking — if the user declines, scaffolding proceeds with a warning

## Capabilities

### New Capabilities

- `dependency-install`: Smart dependency detection and installation logic — checking package.json for packages, detecting shadcn config, prompting to install missing deps, and running package manager commands

### Modified Capabilities

- `cli`: Add `--full` flag to `init` command; add dependency checking hooks to `add` command before scaffolding

## Impact

- **CLI commands**: `src/cli/commands/init.ts` gains `--full` option; `src/cli/commands/add.ts` gains pre-scaffold dependency checks
- **New source file**: `src/cli/deps.ts` — dependency detection and install utilities
- **Dependencies**: No new package dependencies (uses child_process to shell out to npm/pnpm/yarn)
- **User experience**: Smoother onboarding — one command gets a working setup
