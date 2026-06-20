## Context

A flow today carries a single `schedule` (cron) and is executed with a free-form `runType` string (`full | delta | backfill | reconcile | dry-run | webhook`) that the framework stores on the run and passes to `ctx.runType` — it attaches no behavior to it. The cron dispatcher fires each due flow with one default run type. There are no lifecycle hooks, so failure alerting (Slack, etc.) has to be hand-rolled inside each flow.

Flows run two ways: durably on Vercel Workflow (`workflow(ctx)`) or inline (`run(ctx)`). Runs are persisted to `khotan_runs` and finalized (status + counts) by the runtime in both paths. The relevant requirements live in the `factory` and `schema` capabilities.

## Goals / Non-Goals

**Goals:**
- One flow can run in multiple named **variants**, each with its own optional `schedule`.
- Flow code can read the active variant via `ctx.variant`.
- Per-variant `onError` / `onComplete` hooks fire on terminal run states, with a built-in `slackNotifier`.
- Replace the framework's `runType` concept with `variant` (the variant name *is* the mode).
- Keep existing single-schedule flows working without edits.

**Non-Goals:**
- Per-variant overrides beyond `schedule`, `onError`, `onComplete` (no per-variant `resource`, `limits`, `maxPages`, retry/backoff — flow code reads `ctx.variant` and decides). Explicitly scoped out per product direction.
- Alerting channels beyond a Slack webhook helper (users write their own hook fn for anything else).
- Changing how pagination/delta logic works — that stays in user flow code.

## Decisions

### 1. `variants` map on the flow; the name is the mode
`FlowRegistration` gains `variants?: Record<string, FlowVariant>` where `FlowVariant = { schedule?: string; onError?: FlowHook; onComplete?: FlowHook }`. A flow with **no** `variants` is normalized at registration to `{ default: { schedule: <top-level schedule> } }`. This preserves the existing registration shape and means every run always has a variant (`"default"` when unspecified).

*Alternative considered:* keep `runType` and add a separate `schedules` array. Rejected — it splits "mode" across two fields and keeps the pass-through `runType` the user called redundant.

### 2. `ctx.variant` replaces `ctx.runType` (BREAKING)
`FlowRunContext` / `FlowWorkflowContext` expose `variant: string` where `runType` was injected. `runType` is removed from the public context and config. `--run-type` (CLI) and `{ runType }` (API/`start`) are accepted as **deprecated aliases** mapping to `variant` for one minor release to avoid breaking existing scripts; they are documented as deprecated and slated for removal.

### 3. Lifecycle hooks fire at run finalization
The runtime invokes the active variant's hook when a run reaches a terminal state, from the single place that writes the final run row (covers both `workflow` and inline `run` paths): `failed` or `partial` → `onError`; `completed`/`ok` → `onComplete`. Hooks receive `(ctx, run)` where `run` is a summary `{ id, status, variant, durationMs, extracted, transformed, created, updated, deleted, failed, error }`. Hook errors are caught and logged — a failing notifier never changes run status or throws.

*Alternative considered:* a global `onRunComplete` on the factory. Rejected — per-variant is what enables "alert only on the daily healthcheck."

### 4. `slackNotifier(webhookUrl)` helper
Exported from the package: `slackNotifier(url): FlowHook` returns a hook that POSTs a compact JSON message (flow name, variant, status, error, counts) to a Slack incoming webhook via `fetch`. No new dependency.

### 5. Cron dispatcher walks flow × variant
`dispatchScheduledFlows` enumerates each flow's variants and triggers any variant whose `schedule` matches/overdue, passing that variant name. Variants without a `schedule` are manual-only and never auto-fire.

### 6. Runs schema: `variant` + `source` (BREAKING)
`khotan_runs.run_type` (enum) is replaced by:
- `variant` (text, not null) — the variant name (free-form).
- `source` (text, not null, default `'manual'`, one of `scheduled | manual | webhook`) — how the run was triggered, so inbound-webhook runs stay distinguishable from scheduled modes (the one thing `runType` encoded that isn't a "mode").

Indexes/relations on `khotan_runs` are unchanged except the column rename.

## Risks / Trade-offs

- **Removing `runType` is breaking** → Mitigation: implicit `default` variant keeps registrations working; `ctx.variant` is a drop-in; `--run-type`/`{runType}` kept as deprecated aliases for one minor; migration + template/skill updates shipped in this change.
- **Hook throwing could break a run** → Mitigation: hooks are wrapped in try/catch and only logged; never affect run status.
- **Durable (workflow) runs finalize asynchronously** → Mitigation: invoke hooks from the existing run-finalization path that already writes terminal status, not from request scope.
- **Historical run rows have no `source`** → Mitigation: migration sets `variant = old run_type`, `source = 'webhook'` where `run_type = 'webhook'` else `'scheduled'`; lossy for old rows only.
- **Many variants = more cron evaluations** → Mitigation: per-variant overdue check reuses existing schedule matching; bounded by registered variants.

## Migration Plan

1. Ship schema change; consumers run `npx khotan migrate` (or `--push`). Migration renames `run_type`→`variant` and adds `source` with the mapping above.
2. Code normalizes legacy flows (no `variants`) into a `default` variant — no consumer edits required to keep running.
3. Update scaffolding templates (`inflow`/`outflow`/`relay` examples), `skill-flow`, and `runs-table.tsx` to use `variant`.
4. `--run-type` / `{ runType }` continue to work (deprecated) for one minor; emit a deprecation note.
5. Rollback: revert the package; the `variant`/`source` columns are additive-compatible with old reads if needed (old code ignored unknown columns), but the enum drop requires the migration to be reverted too.

## Open Questions

- Keep the `default` variant name, or require explicit variants once any are declared? (Leaning: `default` always exists when none declared; if variants *are* declared without a `default`, an un-specified trigger errors with the available names.)
- Should `onError` also fire on `partial` (some records failed) or only `failed`? (Leaning: yes — fire on both `failed` and `partial`, since a partial healthcheck is still actionable.)
- How long to keep the `--run-type` / `runType` aliases before removal?
