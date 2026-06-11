## Context

The current runtime and scaffolding evolved from a sync-first model and now has mixed terminology and partial flow behavior. The package already stores flow-like types (`inflow`, `outflow`, `relay`) but still exposes `syncs` in config, APIs, schema names, tests, Hub UI, and docs. Plug secret APIs are similarly mixed between `credentials` and `variables`.

This change is cross-cutting and breaking:
- it renames public API nouns (`syncs` -> `flows`, `credentials` -> `variables`),
- renames persistence primitives (`khotan_syncs` -> `khotan_flows`),
- introduces first-class flow component templates (`inflow.ts`, `outflow.ts`, `relay.ts`),
- and adds executable flow-run behavior (manual/API initiated) in the factory.

The user explicitly wants no compatibility aliases and no transitional naming.

## Goals / Non-Goals

**Goals:**
- Establish `flows` as the only runtime, API, and documentation term (hard rename).
- Establish `variables` as the only term for plug-managed secrets/config values (hard rename).
- Introduce separate scaffolded flow component files for Inflow, Outflow, and Relay in consumer codebases.
- Implement flow execution pathways in the factory for API/manual triggers with consistent run tracking in `khotan_runs`.
- Rename schema/table/type names and related indexes/relations from sync-based to flow-based naming.
- Keep flows as sub-resources of plugs in config and runtime ownership.

**Non-Goals:**
- Backward compatibility aliases (`/syncs`, `syncs:` config key, credentials endpoints) are out of scope.
- Cron orchestration and scheduler integration changes beyond current manual/API execution are out of scope for this iteration.
- New ETL tool plugin systems or extra in-flow tooling are out of scope.
- Re-architecting webhook (`wire`/`catch`/`pass`) behavior is out of scope except where naming/shared run surfaces must stay consistent.

## Decisions

### Decision 1: Perform hard rename with no compatibility bridge
- **Choice:** Replace sync and credential naming everywhere in one change set.
- **Rationale:** Product language is central to adoption and "half-half" naming causes ongoing confusion. User explicitly requested hard rename.
- **Alternatives considered:**
  - **Alias period (`syncs` and `flows` both supported):** Safer rollout but rejected due to user direction and ongoing vocabulary drift.
  - **Partial rename (UI/docs only):** Lower risk but leaves technical debt and mismatched API contracts.

### Decision 2: Keep flows nested under plugs (sub-resources)
- **Choice:** Continue plug-owned registration model; replace `syncs` array with `flows` array on plug registrations.
- **Rationale:** Maintains existing ownership and lifecycle semantics (upsert per plug on init) while updating naming.
- **Alternatives considered:**
  - **Top-level global `flows` registry:** More flexible but larger conceptual and migration blast radius.

### Decision 3: Add separate flow templates, one file per component
- **Choice:** Scaffold `inflow.ts`, `outflow.ts`, and `relay.ts` as separate components similar to `catch.ts` and `pass.ts`.
- **Rationale:** Clear component boundaries and discoverability for users; aligns with request for separate files per flow component.
- **Alternatives considered:**
  - **Single generic flow template:** Less code duplication but weaker DX and less explicit component identity.

### Decision 4: Introduce factory flow execution via explicit trigger paths
- **Choice:** Add factory endpoints and internal execution code for manual/API-driven flow runs first, with run records in `khotan_runs`.
- **Rationale:** Delivers "where real ETL work gets done" without blocking on scheduler integration.
- **Alternatives considered:**
  - **Scheduler-first implementation:** More complete but slows delivery and raises complexity.
  - **Template-only change:** Insufficient, does not deliver runnable flow behavior.

### Decision 5: Rename persistence entities to flow naming
- **Choice:** Rename schema/table objects and references from `khotan_syncs`/`sync_id` naming to flow equivalents.
- **Rationale:** Hard rename should be reflected in persisted model and not remain a thin UI/API veneer.
- **Alternatives considered:**
  - **Keep old table and map in code:** Lower migration risk but violates hard-rename intent and leaves permanent mismatch.

### Decision 6: Rename secret-management APIs to variables
- **Choice:** Replace `/credentials/*` routes and method naming with `/variables/*` and variable naming in runtime/UI/docs.
- **Rationale:** Aligns user-facing mental model with plug vars (`varFields`, `setVars`, etc.) and removes mixed language.
- **Alternatives considered:**
  - **Dual route support:** Rejected by user for this change.

## Risks / Trade-offs

- **[Breaking API/config/schema changes can disrupt existing consumers]** -> Mitigation: explicit migration section in docs/specs/tasks; verify end-to-end in `brs-khotan-connector`.
- **[Table rename/data migration complexity in existing deployments]** -> Mitigation: define migration steps and ordering in tasks; include rollback notes.
- **[Large cross-cutting rename may miss references]** -> Mitigation: exhaustive grep-based checklist across source, templates, tests, OpenSpec specs, and docs repo.
- **[Flow execution scope may be interpreted as scheduler-complete]** -> Mitigation: explicitly scope this phase to manual/API triggers and defer scheduling.
- **[Terminology churn may affect generated skills and docs quality]** -> Mitigation: update both khotan repo templates and ai-native-etl docs in same change.

## Migration Plan

1. Add/modify specs to define new contracts (`flows`, `variables`, flow components, flow execution).
2. Implement schema rename (`khotan_syncs` -> `khotan_flows`) and related reference updates in runtime/templates/tests.
3. Rename factory adapter methods, route parsing, request handlers, and response shapes to flow/variable naming.
4. Add flow templates + registry entries and update CLI output/help text.
5. Update Hub template and generated client-facing copy to flows/variables.
6. Update docs/spec language in both repos (`khotan-data`, `ai-native-etl`) for semantic consistency.
7. Validate in `brs-khotan-connector` using pack/install workflow and endpoint/UI checks.
8. Rollback strategy: revert change and run reverse migration only if deployment fails before consumer migration is complete.

## Open Questions

- Should flow trigger endpoint naming include run-type at path level or body field only (e.g., `/flows/:id/trigger` with `{ type }`)?
- Should `khotan_runs` foreign key rename from `sync_id` to `flow_id` be in this same change or staged in a follow-up migration?
