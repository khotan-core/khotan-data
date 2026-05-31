## 1. Dependency Detection Utilities

- [x] 1.1 Create `src/cli/deps.ts` with `detectPackageManager(cwd)` — check lockfiles in priority order (bun → pnpm → yarn → npm), return manager name and install command prefix
- [x] 1.2 Add `checkNpmPackages(cwd, packages)` — read `package.json`, return array of missing packages from both dependencies and devDependencies
- [x] 1.3 Add `checkShadcnComponents(cwd, components)` — read `components.json` for aliases path, check filesystem for component files, return array of missing component names
- [x] 1.4 Add `installPackages(cwd, packages, opts)` — execute install command with detected package manager, support `devDependency` flag, return success/failure
- [x] 1.5 Add `installShadcnComponents(cwd, components)` — run `npx shadcn@latest add <components>`, return success/failure
- [x] 1.6 Write tests for `detectPackageManager` — test each lockfile detection, fallback to npm, priority ordering
- [x] 1.7 Write tests for `checkNpmPackages` — test present packages, missing packages, missing package.json
- [x] 1.8 Write tests for `checkShadcnComponents` — test present components, missing components, custom alias paths, no components.json fallback

## 2. Add Command Dependency Checks

- [x] 2.1 Define per-component dependency requirements in registry (npm packages and shadcn components each component needs)
- [x] 2.2 Update `add.ts` — before scaffolding, run dependency checks based on component requirements
- [x] 2.3 Implement install prompt flow — show missing deps, ask to install, run install, handle failure gracefully
- [x] 2.4 Add `--yes` / `-y` flag to `add` command — auto-accept all install prompts
- [x] 2.5 Ensure scaffolding proceeds regardless of install prompt outcome (with warning if declined)
- [x] 2.6 Write tests for add command dependency flow — test prompt shown, --yes skips prompt, decline still scaffolds

## 3. Init --full Command

- [x] 3.1 Add `--full` flag to init command in `src/cli/commands/init.ts`
- [x] 3.2 Implement full setup sequence — detect PM, install drizzle packages, init shadcn, add shadcn components, create config
- [x] 3.3 Add skip logic — skip drizzle install if already in package.json, skip shadcn init if components.json exists
- [x] 3.4 Implement failure recovery — continue on sub-step failure, collect results, print summary at end
- [x] 3.5 Write tests for `init --full` — test fresh project, test with existing deps, test partial failure handling
