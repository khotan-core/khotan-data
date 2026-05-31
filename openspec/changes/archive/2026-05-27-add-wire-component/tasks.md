## 1. Wire Component Template

- [x] 1.1 Create `src/cli/templates/wire.ts` — the self-contained wire template file with: `WireError` class, `AuthStrategy` interface, auth factories (`bearer`, `basic`, `apiKey`, `custom`), `PaginationStrategy` interface, pagination factories (`cursorPagination`, `offsetPagination`, `keysetPagination`), retry logic with exponential backoff + jitter + 429 Retry-After, `Wire` class with `get`/`post`/`put`/`patch`/`delete`/`request`/`paginate`/`withAuth`, and the `wire()` factory function
- [x] 1.2 Write tests for the wire template — verify auth strategies apply correct headers, retry logic respects attempts/backoff/429, pagination iterates pages correctly, timeout aborts requests, `withAuth` returns a new instance with swapped auth, error handling produces `WireError` with status/body/url

## 2. CLI Setup

- [x] 2.1 Add CLI dependencies to `package.json` — `commander` for arg parsing, `prompts` (or similar) for interactive prompts, add `bin` field pointing to `dist/cli.js`
- [x] 2.2 Create `src/cli/index.ts` — CLI entry point with `#!/usr/bin/env node` shebang, register `init` and `add` commands via commander
- [x] 2.3 Update `tsup.config.ts` — add `src/cli/index.ts` as an additional entry point, configure it to produce a standalone CJS/ESM executable (not a library bundle)

## 3. Init Command

- [x] 3.1 Create `src/cli/commands/init.ts` — implements `khotan init`: checks if `khotan.config.ts` already exists, writes the default config stub if not, prints success message
- [x] 3.2 Create the `khotan.config.ts` template — minimal config with `outputDir` and `components` fields

## 4. Add Command

- [x] 4.1 Create `src/cli/commands/add.ts` — implements `khotan add <component>`: reads `khotan.config.ts` to get outputDir, validates component name against registry, copies template file to output path, creates directories as needed, warns and prompts on overwrite
- [x] 4.2 Create `src/cli/registry.ts` — component registry mapping component names to their template file paths (just `wire` for now)

## 5. Integration & Build

- [x] 5.1 Verify the full flow end-to-end: `npx khotan init` → creates config, `npx khotan add wire` → creates wire.ts at configured path, wire.ts compiles with `tsc --noEmit`
- [x] 5.2 Add CLI tests — test init creates config, test add creates wire file, test add without init shows error, test overwrite prompt
