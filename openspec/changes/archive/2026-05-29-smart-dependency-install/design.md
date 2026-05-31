## Context

The khotan CLI currently scaffolds components but assumes the user has already installed all prerequisites. For `add schema`, the user needs `drizzle-orm`. For `add hub`, the user needs `drizzle-orm` plus several shadcn components (`card`, `badge`, `table`, `switch`). For new projects, getting from zero to a working khotan setup requires 4-5 manual commands. This friction can be eliminated by detecting and offering to install missing dependencies.

The CLI already detects shadcn via `components.json` and Drizzle via `drizzle.config.ts` — this change extends that detection to package-level dependencies and offers installation.

## Goals / Non-Goals

**Goals:**
- Detect missing npm packages before scaffolding and prompt the user to install them
- Detect missing shadcn components before scaffolding hub and prompt to install them
- `init --full` performs complete setup in one command for new projects
- Auto-detect the user's package manager (npm, pnpm, yarn, bun)
- Non-blocking — user can always decline and proceed with a warning

**Non-Goals:**
- No version pinning — install latest compatible versions
- No package manager preference enforcement — detect what's already in use
- No automatic `drizzle-kit push` or database setup — that's project-specific
- No modification of existing shadcn theme/config — just ensure components exist
- No network connectivity checks — let the package manager handle failures

## Decisions

### 1. Package manager detection via lockfile

**Decision:** Detect the package manager by checking for lockfiles in order: `bun.lock` → `pnpm-lock.yaml` → `yarn.lock` → `package-lock.json`. Fall back to `npm` if none found.

**Rationale:** Lockfiles are the most reliable signal. Checking `packageManager` in `package.json` would also work but isn't universal. Order prioritizes newer/faster tools.

**Alternative considered:** Always use `npm`. Rejected because users on pnpm/yarn/bun would get a second lockfile.

### 2. Dependency checks happen per-component, not globally

**Decision:** Each `add` command checks only the dependencies its component needs. `add schema` checks for `drizzle-orm`. `add hub` checks for `drizzle-orm` + shadcn components. `add plug` checks nothing (zero deps).

**Rationale:** Components are independent. Installing everything upfront would install unused packages. This keeps the model clean — you only get prompted for what you actually need.

**Alternative considered:** A global `khotan doctor` command. Could be added later but per-command checks are more ergonomic for the common case.

### 3. `init --full` is an opinionated all-in-one setup

**Decision:** `init --full` runs: (1) detect package manager, (2) install `drizzle-orm` + `drizzle-kit` + `postgres` as dependencies, (3) run `npx shadcn@latest init --defaults` if no `components.json`, (4) install shadcn components (`card`, `badge`, `table`, `switch`), (5) create `khotan.config.ts`. It uses `--defaults` for shadcn to avoid interactive prompts.

**Rationale:** The goal is "one command, working setup." Users who want control over shadcn theme/style can run `npx shadcn init` manually first — if `components.json` already exists, `init --full` skips shadcn init and only adds the specific components.

**Alternative considered:** Making `init --full` interactive (choosing driver, theme, etc.). Rejected for v0 — `postgres` is the only supported driver and shadcn defaults are fine for most.

### 4. shadcn component detection by checking the filesystem

**Decision:** Check if each required shadcn component file exists at the path specified in `components.json` (or fall back to `components/ui/<name>.tsx`). If missing, offer to run `npx shadcn@latest add <component>`.

**Rationale:** shadcn scaffolds real files — checking for them is definitive. The `components.json` file contains the configured `aliases.components` path which tells us where to look.

**Alternative considered:** Parsing `components.json` registry. Rejected because the file doesn't track installed components — only configuration.

### 5. npm package detection via package.json

**Decision:** Check the user's `package.json` for required packages in both `dependencies` and `devDependencies`. If missing, prompt to install.

**Rationale:** Reading `package.json` is synchronous and reliable. Checking `node_modules` would also work but is fragile (partial installs, hoisting).

### 6. Install prompts are skippable with --yes flag

**Decision:** Add a `--yes` / `-y` flag to `add` commands that auto-accepts all install prompts. `init --full` implicitly has `--yes` behavior (it installs without asking since that's its purpose).

**Rationale:** CI environments and experienced users who know what they want shouldn't be blocked by prompts. Mirrors common CLI patterns (`apt install -y`, `npm init -y`).

## Risks / Trade-offs

**[shadcn CLI changes between versions]** → We shell out to `npx shadcn@latest`, which could change its CLI interface. Mitigation: Pin to the `add` subcommand which has been stable. Wrap in try/catch with helpful error if it fails.

**[Package manager detection is heuristic]** → A project could have multiple lockfiles (e.g., migrating from npm to pnpm). Mitigation: Priority order is deterministic. User can always decline the auto-install and do it manually.

**[`init --full` picks postgres driver]** → Some users may want `@neondatabase/serverless` or `pg`. Mitigation: Document that `--full` is opinionated. Users can swap the driver afterward. Future: add `--driver` flag.

**[Network required for installs]** → If offline, install prompts will fail. Mitigation: Let the package manager handle the error — it gives clear offline messages. The scaffolding still succeeds even if install is declined.
