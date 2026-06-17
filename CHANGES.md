# khotan-data — Hardening Roadmap

A working dump of everything found during the full technical review, grouped into **three sequential bodies of work**. Each group is sized to become its own OpenSpec change later, and each is designed to leave the package **building, testing, and publishing green** so you can verify between steps.

Sequencing rationale:

1. **Group 1 — Decompose & Type** is a behavior-preserving structural refactor. It creates the module boundaries and typed contracts that the next two groups depend on. Lowest risk; existing tests are the safety net.
2. **Group 2 — Router & Runtime Correctness** rebuilds the HTTP layer and fixes real runtime/security/robustness bugs on top of the clean modules from Group 1.
3. **Group 3 — CLI, Templates & Primitives DX** hardens everything that ships *into consumer projects* (the scaffolding CLI, templates, and published ETL primitives) — the open-source-friendliness layer.

Current baseline for reference:

- `src/factory.ts` — **5,562 lines**, single file. The `khotan()` function alone is **~2,530 lines** (lines 3001–5530); the request `handler()` is **~1,260 lines** (4113–5375).
- `src/factory.test.ts` — 3,917 lines. `src/cli/cli.test.ts` — 2,051 lines.
- Published primitives (`pipeline-builder.ts`, `transformers.ts`, `drizzle-load.ts`, `extractors.ts`, `loaders.ts`) are clean and well-commented — they are mostly *not* touched until Group 3, and only lightly.

---

## Group 1 — Decompose the runtime engine & type the adapter

**Goal:** Break the `factory.ts` monolith into focused, individually-testable modules and replace the stringly-typed adapter contract with real types. **No behavior change.** Public exports from `khotan-data/factory` must remain identical (verify against `package.json` `exports` and `src/index.ts`).

**Why this is first:** Everything else is easier once the file is navigable and the data flowing through the system is typed. An OSS contributor currently has to load 5,562 lines and a 2,530-line closure to change anything.

### 1.1 Split `src/factory.ts` into modules

Today one file contains: internal Drizzle schema (26–305), AES-GCM crypto + hex helpers (307–360), CLI HMAC auth (362–442), ~40 interfaces/types (444–1263), `drizzleAdapter` (1270–2199), workflow import shims (2201–2342), a full cron parser (2344–2583), Zod introspection (2589–2700+), and the `khotan()` factory (3001–5530).

Proposed layout (names indicative — keep `factory.ts` as the thin public entry that re-exports so consumer imports don't break):

- `src/factory/schema.ts` — the 9 internal `pgTable` definitions (`khotan_plugs`, `khotan_resources`, `khotan_flows`, `khotan_wires`, `khotan_webhook_handlers`, `khotan_webhook_events`, `khotan_runs`, `khotan_mappings`, `khotan_caches`, `khotan_cache_entries`).
- `src/factory/crypto.ts` — `deriveKey`, `encryptVars`, `decryptVars`, `hexToBytes`, `bytesToHex`.
- `src/factory/cli-auth.ts` — `deriveCliToken`, `timingSafeEqualHex`, `isCliRequestAuthorized`, `CLI_TOKEN_SCHEME`, `CLI_TOKEN_WINDOW_MS`. (Note: `deriveCliToken` is currently exported and the CLI mirrors it in `src/cli/cli-auth.ts` — keep them in sync or share.)
- `src/factory/cron.ts` — `parseCronValue`, `matchesCronField`, `matchesCronSchedule`, `startOfUtcMinute`, alias tables, `isCronRequestAuthorized`. This is self-contained and trivially unit-testable in isolation.
- `src/factory/zod-introspect.ts` — `serializeZodSchema`, `serializeZodField`, `serializeEndpoints`. Clearly label as **best-effort, non-load-bearing** (see 1.4).
- `src/factory/types.ts` — the registration/context/adapter interfaces.
- `src/factory/drizzle-adapter.ts` — `drizzleAdapter()` (~930 lines).
- `src/factory/runtime/` — the inner functions of `khotan()` lifted to top-level functions that take an explicit context object (see 1.3): `init`, mapping CRUD, `wire`, var management, `triggerFlowRun`, `dispatchScheduledFlows`.
- `src/factory/router.ts` — the request router (rewritten in Group 2; in Group 1 just *move* it).
- `src/factory.ts` — thin: `khotan()`, `toNextJsHandler()`, and re-exports.

Update `tsup.config.ts` entry points if needed; confirm `dist/factory.*` and `dist/plug-client.*` still emit correctly.

### 1.2 Move the top-of-file hacks out

- `declare const process` (line 3) and the hand-rolled `kd()` debug logger (5–8) should live in a small `src/factory/debug.ts` (or use a real typed `process` via build config). The same `kd` blob is **also pasted into the `plug.ts` template** — Group 3 fixes that copy; Group 1 should at least make the runtime one a single shared util.

### 1.3 Convert `khotan()` from a 2,530-line closure to composed functions

The inner functions capture `adapter`, `secret`, `plugs`, `instanceId`, `resourceNames`, etc. Extract them to top-level functions that receive an explicit `KhotanRuntimeContext` object. This removes hoisting hazards like `secret` being declared at line 5377 but used by `getWireVars` at 3528.

`khotan()` becomes: validate config → build context → register runtime helpers → return the instance object.

### 1.4 Type the adapter contract (kills the stringly-typed access)

Today the adapter returns `Promise<Record<string, unknown>>` for nearly everything (interface at 964–1135), forcing defensive casts throughout (`plug["name"]`, `dbPlug["id"] as string`, `typeof flow["plugName"] === "string"`, etc.).

- Define real row models. Infer them from the Drizzle tables (`InferSelectModel<typeof khotanPlugs>`, etc.) so they can't drift from the schema.
- Change `KhotanAdapter` method signatures to return typed rows.
- Resolve the **dual-casing smell**: `getRunWorkflowId` (4105–4111) and `getRunWithWorkflowStatus` (4078–4083) check **both** `workflowRunId` and `workflow_run_id`. Pick one canonical shape (camelCase, since Drizzle returns mapped names) and delete the fallback.
- Net effect: hundreds of `typeof x === "string"` guards and `as string` casts disappear.

### 1.5 Move test seams out of the public surface

`__setWorkflowStartForTests`, `__setWorkflowGetRunForTests`, `__setWorkflowGetWritableForTests` (2229–2245) are exported from the published package. Relocate behind an internal-only module or a test-only export path so they aren't part of the public API.

### 1.6 Split the tests alongside the source

Once modules exist, carve `factory.test.ts` (3,917 lines) into per-module suites (`cron.test.ts`, `crypto.test.ts`, `cli-auth.test.ts` already exists, adapter tests, router tests). Keep total coverage equal or higher.

**Done-when (Group 1):**
- `npm run check` (typecheck + lint + format + test) passes.
- `npm run build` emits the same `exports` surface; a smoke import of `khotan-data/factory` works.
- No diff in runtime behavior — existing `factory.test.ts` assertions pass unchanged (or are moved verbatim).

---

## Group 2 — Rebuild the HTTP router & fix runtime correctness, robustness, and security

**Goal:** Replace the positional/brittle router with a declarative, auditable one, de-duplicate the runtime hot paths, and fix the genuine correctness/security/robustness bugs. Builds directly on Group 1's modules.

### 2.1 Replace the positional segment router

The current router (`handler`, 4113–5375) computes `segments.indexOf("plugs")`, `indexOf("flows")`, … for 12 keywords (4122–4135), then branches with ~40 conditions like `if (cachesIdx !== -1 && cachesIdx === segments.length - 3)`.

Problems:
- **Collision-prone:** `indexOf("plugs")` matches *any* segment named `plugs` — a cache key `"plugs"`, a mapping `connectValue`, or a plug literally named `runs`/`flows` can mis-route.
- **Order-dependent & unauditable:** no route table; reordering branches changes behavior; you can't see all routes at once.
- **GET/POST/PUT/PATCH/DELETE for one resource are split across hundreds of lines** because everything is wrapped in `if (request.method === ...)` blocks.

Solution: a declarative route table — `{ method, pattern, handler }` entries matched against the path **after** the configurable base prefix (e.g. `/api/khotan`), with named params (`:plugName`, `:id`, `:key`). Match on the *full* pattern, not "does this keyword appear somewhere." Add a single fallthrough `404`. Each route handler becomes a small named function (testable in isolation).

This is the single biggest readability + correctness win and should roughly halve the handler.

### 2.2 Preserve and centralize the auth gate

The authorize gate (4137–4176) and the exemptions (inbound webhook, cron, debug) must be preserved exactly. In the new router, express exemptions as route metadata (e.g. `auth: "webhook" | "cron" | "debug" | "authorize"`) instead of the current `isInboundWebhook`/`isCronRoute`/`isDebugRoute` positional checks (4140–4143). Keep the actionable `401` body (`code: "authorize_rejected"` + hint) intact.

### 2.3 De-duplicate the catch/pass webhook loops

In the inbound-webhook route, `for (const c of catches)` (4725–4794) and `for (const p of passes)` (4796–4881) are ~95% identical: event-filter → enabled check → `insertRun` → `insertWebhookEvent` → `startWorkflow` → extract `runId`/`id` → `updateRun`, plus identical error handling. Collapse into one function parameterized by handler type and a context builder (`pass` adds `destVars` resolution). ~150 lines → one helper.

### 2.4 Single decrypt-or-fallback helper

The "try `decryptVars`, catch, try plain `JSON.parse`, catch, return `{}`" pattern is copy-pasted in at least three places: `getWireVars` (3523–3545), the webhook handler (4655–4678), and `getStoredVarsByPlugId` (5399–5409).

- Extract one `readEncryptedJson(raw, secret)` helper.
- **Decide deliberately** what decryption failure means. Today a wrong key or corrupt blob returns `{}` indistinguishably from "no vars configured" — a silent, undebuggable failure for OSS users. At minimum log via the debug logger; consider surfacing a typed error for the management API path.

### 2.5 Fix fire-and-forget webhook processing on serverless

The webhook route returns `202` immediately and processes in a floating `void Promise.resolve().then(...)` (4716). On Vercel/serverless the function can be frozen or killed once the response is sent, so this work may silently never complete — bad for a package whose pitch includes reliable webhook ingestion.

Solution: use a pluggable "after-response" mechanism — Vercel's `waitUntil()` when available (via `@vercel/functions` or the request context), with a documented fallback. Make the contract explicit in docs.

### 2.6 Document & bound the runtime registry lifecycle

`khotanRuntimeRegistry` (module-level `Map`, line 842) is written on every `khotan()` (line 5503) and **never cleared**. In tests, HMR, or multi-instance apps it grows unbounded. Decide on the intended lifecycle:
- Document single-instance-per-process as the norm, **and/or**
- Provide a teardown/`dispose()` on the instance that removes its `instanceId`, **and/or**
- Warn on repeated registration of the same logical config.

### 2.7 Replace the legacy-schema fallback

`listWebhookEventsPage` (2040–2114) catches DB errors and string-matches messages like `column "wire_id" does not exist`, then re-runs a hand-written raw SQL query. This migration shim lives permanently in a hot path. Replace with a proper migration (the schema/`add schema` flow) and remove the runtime branch, or gate it behind a one-time detection rather than per-request `try/catch`.

### 2.8 Isolate & guard the Zod introspection

`serializeZodSchema`/`serializeZodField` (2589–2700+) reach into private `_def`/`def`/`typeName` internals across Zod 3 and 4 with `any` and `catch { /* best-effort */ }`. Keep it strictly scoped to the debug-UI endpoint, label it clearly as best-effort, and add a version-tolerance test so a Zod bump can't silently break it without a red test.

### 2.9 Security posture: make "insecure" require intent

`authorize` is optional; today you `console.warn` (3006–3020) but still serve credentialed management routes. Consider requiring an explicit opt-out (e.g. `authorize: false`) so silence can never mean "publicly exposed." Keep the existing warnings for `KHOTAN_SECRET`. (Behavior change — coordinate with docs in Group 3.)

**Done-when (Group 2):**
- `npm run check` passes; router behavior covered by tests including the collision cases that previously could mis-route (e.g. a cache key named `plugs`).
- Webhook processing demonstrably completes after the `202` in the target runtime (test/mocked `waitUntil`).
- No remaining duplicate decrypt/catch-pass blocks; the dual-casing fallback is gone (depends on 1.4).

---

## Group 3 — Harden the CLI, templates, scaffolding, and published primitives

**Goal:** Make everything that ships *into consumer projects* robust and predictable — the scaffolding CLI, the string templates, and the published ETL primitives. This is the "open-source-friendly, won't-corrupt-my-repo" layer.

### 3.1 Extract shared CLI utilities (kill the copy-paste)

These helpers are reimplemented near-verbatim across `commands/probe.ts`, `wire.ts`, `flows.ts`, `mappings.ts`, `plug-vars.ts`: `parseEnvFile`, `parsePortFromEnvFile`/`resolvePort`, `output`/`fail`, `checkConnectivity`, `resolveBaseUrl`, and a `fetchJson`. They have already drifted (only some check `401`; only some normalize `{ plugs: [] }` vs array response shapes).

Create `src/cli/cli-api.ts` (or similar) with one implementation each. Consolidate the `.env` parsing — the current `KHOTAN_SECRET` regex in `cli-auth.ts` (`/^KHOTAN_SECRET\s*=\s*["']?(.*?)["']?\s*$/`) truncates values containing `=` or `#` and doesn't handle `export ...`. Use a small real dotenv parse.

### 3.2 Unify `outputDir` resolution (one source of truth)

`init` defaults to `src/khotan` (or `khotan`), but `add` and `generate` default to `src/lib/khotan` — and all three parse `khotan.config.ts` with the same brittle regex `/outputDir:\s*["']([^"']+)["']/`. A user who runs `init` then `add schema` without a parseable config gets files scattered across two trees, breaking imports. The skill docs say `src/khotan`.

Solution: one `resolveOutputDir()` used everywhere, one default, and a clear error if the config can't be parsed rather than a silent divergent fallback.

### 3.3 Stop mutating user source files with regex (or make it safe + reversible)

The CLI rewrites consumer files as strings:
- `next.config.*` import injection + default-export wrap (`next-config.ts` ~25–66) — the greedy `objectExportPattern` `\{[\s\S]*\}` (~58) can over-match; only handles `export default identifier`, not `export default withX(config)`.
- `drizzle.config.ts` schema rewrite (`drizzle-detect.ts` ~82–94) — **writes the file back unchanged on a regex miss, then reports success** (`generate.ts` ~51–56). Only reads `drizzle.config.ts`, not `.mts/.js/.cjs`. Aggressive glob expansion (`./src/db/schema.ts` → `./src/db/*`).
- barrel `index.ts` append (`add.ts` ~567–572, `generate.ts` ~68–69).

Solution options (pick per file): prefer AST-based edits, or detect-and-instruct (print the exact manual edit) when the shape isn't recognized, and **always** verify the regex actually matched before writing + reporting success. Never silently no-op-then-claim-success.

### 3.4 Make `generate` non-destructive

`generate` (`commands/generate.ts` ~42–44) overwrites `khotan.ts` with **no prompt and no `--force`**, destroying user schema edits, and auto-mutates drizzle config + barrel unconditionally (~47–71). Align with `add schema`: prompt unless `--yes`/`--force`.

### 3.5 Fix `--yes` / `--force` semantics and recursive installs

- `--yes` currently only affects the agent-skills prompt; it does **not** make scaffolding non-interactive (users still hit overwrite prompts), and `init --full` ignores `opts.yes` entirely. Make `--yes` mean "non-interactive" consistently (shadcn-style); keep `--force` = overwrite files.
- Recursive required-component install uses `execSync('node ' + (process.argv[1] ?? '') + ' add ...')` (`add.ts` ~283–287) — unreliable under `npx`/`pnpm exec`/`bunx`, doesn't forward `--without-ui`. Replace with a direct internal call to the shared scaffold function; resolve CLI path via `import.meta.url` only if a subprocess is truly needed.
- `init --full` prints failed steps but **exits 0** (~416–422) — CI can't detect partial setup. Exit non-zero on failure.

### 3.6 Fix `isScaffolded` and partial-scaffold integrity

`isScaffolded` uses `.some()` (`add.ts` ~81–85): for multi-file components, **one** existing file marks the whole thing installed, so a prior partial add silently skips dependencies. Require all files present (or track a manifest in `khotan.config.ts`). Consider rollback / clear messaging when a multi-file scaffold is interrupted (currently leaves an inconsistent tree, ~389–402).

### 3.7 Redact secrets in CLI output

`plug vars show` / `--list` (`commands/plug-vars.ts` ~143–155) print decrypted secret values as plaintext JSON to stdout — lands in shell history / CI logs. Redact fields marked `secret: true` by default; require an explicit `--show-secrets` to reveal.

### 3.8 Fix the corrupted/dead templates

- `templates/plug.ts` (~1–15): the `kd()` debug helper was pasted **inside the file header comment block**, so every `khotan add plug` scaffolds broken comments + stray debug code into the consumer project. Clean the header; move any debug helper to a proper location or drop it.
- `templates/khotan-route.ts`: dead/unused (route is generated inline by `init`), and it hardcodes `@/khotan/khotan`. Remove it or wire it up as the single source.
- Fix the wrong/generic post-`add` usage hints (`add.ts` ~587–617): non-`wire` single-file components all print a plug import example; the `wire` hint is missing the `wires/` path segment.

### 3.9 Probe/CLI connectivity correctness

`checkConnectivity` in `probe.ts` (~69–85) probes the **debug** route for all operations, so even `khotan plug --list` requires `KHOTAN_DEBUG=1` — but `--list` actually hits the management `/plugs` route, which isn't debug-gated. Use the right health check per operation and only require debug for debug routes. Add consistent `401` handling to `--info`/`--compare`/request-firing (currently only `--list` checks 401).

### 3.10 Agent-skill installer hygiene

`agent-detect.ts`: skills are written even when no agent dir exists (defaults to both `.cursor` + `.claude`, ~50–60) with no confirm; existing skills are never refreshed on upgrade (~95–114) so stale guidance persists silently; `AGENTS.md` link rewriting only targets the primary agent. Add: confirmation when no agent is detected, version-stamped skill files with refresh-on-upgrade, and correct multi-agent link rewriting.

### 3.11 Published primitive fixes (`src/pipeline-builder.ts`)

These are small but are correctness/contract issues in the most-copied public API:
- **`run()` swallows errors:** with default `continueOnError: false`, the thrown error is caught (248–258) and a result is returned instead of rejecting. Either reject the promise or document clearly that errors only surface via `result.errors`. Align README + types.
- **`step:start` granularity:** emitted per-record inside the transform loop (199) — a 10k-record batch emits 10k events per step. Emit per step/batch, consistent with the loader.
- **Silent abort:** `if (signal?.aborted) break;` (181) ends a run indistinguishably from success. Emit a cancellation event and/or set a `cancelled` flag on the result.

### 3.12 Docs alignment

Update `README.md` and the skill templates (`src/cli/templates/skill-*.md`) for: the unified `outputDir`, the `--yes`/`--force` semantics, the `authorize` opt-out from 2.9, the webhook `waitUntil` contract from 2.5, and the corrected pipeline error/abort contract from 3.11.

**Done-when (Group 3):**
- `npm run check` passes; CLI tests cover the unified helpers, `outputDir` resolution, non-destructive `generate`, secret redaction, and the corrected probe connectivity.
- `khotan add plug` produces a clean file (no debug code in comments).
- README + skills match actual behavior.

---

## Cross-cutting acceptance (end state)

By the end of all three groups:

- `factory.ts` is a thin entry point; the engine lives in focused, individually-tested modules.
- The HTTP API is defined by an auditable route table with no positional collisions.
- The adapter is fully typed; no `Record<string, unknown>` casts or dual-casing fallbacks remain.
- No duplicated decrypt/catch-pass/CLI-helper logic.
- Webhook processing reliably completes on serverless.
- The CLI never silently corrupts or no-ops on a user's config, never leaks secrets to stdout, and behaves consistently across `--yes`/`--force`.
- Templates scaffold clean, professional code.
- Published primitives honor their documented contracts.
- `npm run check` and `npm run build` are green after each group, so the package keeps working the whole way.
