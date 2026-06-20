## Why

Real integrations need the *same* flow to run in different modes on different cadences — e.g. a cheap daily "healthcheck" probe, a weekday "delta" sync, and a weekly "full" rebuild — and they need to know when a run fails. Today a flow has a single `schedule` and a free-form `runType` that the framework only passes through, with no way to schedule multiple modes per flow and no lifecycle hook for alerting. Users end up registering near-duplicate flows and bolting on their own failure notifications.

## What Changes

- Introduce **flow variants**: a flow may declare a `variants` map of named profiles, each `{ schedule?, onError?, onComplete? }`. The variant **name** is the run mode.
- The flow run context exposes **`ctx.variant`** (string). Flow code branches on `ctx.variant` (e.g. `"healthcheck"`, `"delta"`, `"full"`) instead of `ctx.runType`.
- **BREAKING**: `runType` is removed from the public flow context and config; `variant` replaces it as the user-facing run mode.
- Add **`onError` and `onComplete` lifecycle hooks** per variant, invoked by the runtime when a run terminates (failed/partial → `onError`, success → `onComplete`). Ship a batteries-included `slackNotifier(webhookUrl)` helper.
- The **cron dispatcher** schedules each flow × variant by that variant's `schedule`; variants with no `schedule` are manual-only.
- **Triggering** selects a variant: `khotanData.flow(name).start({ variant })`, the flow-run API body `{ variant }`, and the CLI `--variant` flag (replacing `--run-type`).
- **BREAKING**: the `khotan_runs.run_type` enum is replaced by a free-form `variant` (text) column plus an internal `source` column (`scheduled` | `manual` | `webhook`) so non-flow runs (inbound webhooks) remain distinguishable from scheduled modes.
- **Back-compat shape**: a flow that declares no `variants` is treated as having a single implicit `default` variant carrying the flow's top-level `schedule`; `ctx.variant === "default"` for those runs.

## Capabilities

### New Capabilities
<!-- none — flow behavior already lives in the factory capability -->

### Modified Capabilities
- `factory`: flow registration gains `variants`; the flow run context exposes `variant` (removing `runType`); per-variant `onError`/`onComplete` hooks run on terminal run states; the cron dispatcher schedules flow×variant pairs; the programmatic flow starter and trigger API select a variant.
- `schema`: the `khotan_runs` table replaces the `run_type` enum with a free-form `variant` text column and adds a `source` column distinguishing scheduled/manual/webhook runs.

## Impact

- **Factory runtime** (`src/factory/runtime.ts`, `src/factory/types.ts`): flow registration validation, run-context construction, cron dispatcher, programmatic starter, trigger API route, and the new hook invocation + `slackNotifier` helper.
- **Schema** (`src/factory/schema.ts`, `src/cli/templates/schema.ts`): `khotan_runs` columns — requires a migration for existing consumers.
- **CLI** (`src/cli/commands/flows.ts`): `--run-type` → `--variant`.
- **Templates** (`inflow`/`outflow`/`relay` examples) and the **`skill-flow`** docs: `ctx.runType` → `ctx.variant`.
- **Hub UI** (`runs-table.tsx`): display `variant` (+ `source`) instead of `runType`.
