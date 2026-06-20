## 1. Types & config

- [ ] 1.1 Add `FlowVariant` type (`{ schedule?: string; onError?: FlowHook; onComplete?: FlowHook }`) and `FlowHook` signature `(ctx, run) => void | Promise<void>` to `src/factory/types.ts`
- [ ] 1.2 Add optional `variants?: Record<string, FlowVariant>` to `FlowRegistration`; document that `variants` and top-level `schedule` are mutually exclusive
- [ ] 1.3 Replace `runType: string` with `variant: string` in `FlowRunContext` and `FlowWorkflowContext`
- [ ] 1.4 Update `FlowStartOptions` to accept `variant?: string` and keep `runType?: string` as a deprecated alias
- [ ] 1.5 Add a `RunSummary` type for hook payloads (`id`, `status`, `variant`, `durationMs`, counters, `error`)

## 2. Variant normalization & validation

- [ ] 2.1 Normalize every registered flow to a non-empty variants map; synthesize `{ default: { schedule } }` when no `variants` declared
- [ ] 2.2 Validate variant names are non-empty and unique per flow; throw at config time otherwise
- [ ] 2.3 Throw at config time if a flow declares both top-level `schedule` and `variants`

## 3. Schema & migration

- [ ] 3.1 In `src/factory/schema.ts` and `src/cli/templates/schema.ts`, replace `khotan_runs.run_type` enum with `variant` (text, not null) and add `source` (text, not null, default 'manual', enum scheduled|manual|webhook)
- [ ] 3.2 Update the runs index set / relations to reflect the column rename (keep status + started_at indexes)
- [ ] 3.3 Write the migration mapping `variant = run_type`, `source = 'webhook' where run_type='webhook' else 'scheduled'`
- [ ] 3.4 Update adapter `insertRun`/`updateRun` and run read mappings in `src/factory/drizzle-adapter.ts` to use `variant` + `source`

## 4. Runtime: context, triggering, scheduling

- [ ] 4.1 Inject `variant` into the run context wherever `runType` was set in `src/factory/runtime.ts`
- [ ] 4.2 Resolve the variant on trigger (programmatic `start`, API body, CLI): default to `default`; error listing variants when none is `default`; map deprecated `runType` → `variant` with a deprecation notice
- [ ] 4.3 Persist `variant` + `source` on run creation (source = scheduled|manual|webhook based on trigger path)
- [ ] 4.4 Update the cron dispatcher (`dispatchScheduledFlows`) to iterate flow × variant and trigger by each variant's `schedule`; skip variants without a schedule

## 5. Lifecycle hooks & Slack helper

- [ ] 5.1 Invoke the active variant's `onError`/`onComplete` from the run-finalization path (covers `workflow` and inline `run`); `onError` on `failed`/`partial`, `onComplete` on success
- [ ] 5.2 Build the `RunSummary` payload and wrap hook invocation in try/catch (log on throw, never change run status)
- [ ] 5.3 Implement and export `slackNotifier(webhookUrl)` from `khotan-data/factory`

## 6. CLI

- [ ] 6.1 In `src/cli/commands/flows.ts`, add `--variant` and keep `--run-type` as a deprecated alias mapping to `variant`

## 7. Templates, skills, UI

- [ ] 7.1 Update `inflow`/`outflow`/`relay` example templates to use `ctx.variant` instead of `ctx.runType`
- [ ] 7.2 Update `skill-flow.md` (and any `khotan-config`/`hub` template references) for variants + `ctx.variant`
- [ ] 7.3 Update `runs-table.tsx` to display `variant` and `source` instead of `runType`

## 8. Tests & docs

- [ ] 8.1 Unit tests: variant normalization, default synthesis, name validation, schedule/variants exclusivity
- [ ] 8.2 Unit tests: trigger variant resolution (default, missing-default error, deprecated runType alias)
- [ ] 8.3 Unit tests: cron dispatcher fires per-variant schedules; manual-only variants not auto-fired
- [ ] 8.4 Unit tests: hooks fire on terminal states, hook errors isolated; `slackNotifier` POSTs expected payload
- [ ] 8.5 Add a changeset describing the breaking `runType` → `variant` change and migration
