## Why

The package currently mixes old and new language (`syncs` vs `flows`, `credentials` vs `variables`) and does not yet formalize Inflow/Outflow/Relay as first-class executable components. This creates product ambiguity and slows adoption of khotan as a clear, ETL-first runtime.

## What Changes

- Add first-class flow components for `inflow`, `outflow`, and `relay` as separate scaffolded component files (parallel to `catch.ts` and `pass.ts`) for consumer projects.
- Implement flow execution in the factory for manual/API-driven runs, including run creation and status/stat tracking in `khotan_runs`.
- **BREAKING**: hard-rename public runtime/API/CLI terminology from `syncs` to `flows` (no compatibility alias).
- **BREAKING**: hard-rename plug secret-management terminology from `credentials` to `variables` across API surface, factory methods, UI wording, and docs.
- **BREAKING**: rename persistence naming from `khotan_syncs` to `khotan_flows`, including schema definitions and related references.
- Update Hub, CLI templates, docs, and spec language to consistently use flow/variable terminology.

## Capabilities

### New Capabilities
- `flow-components`: First-class Inflow/Outflow/Relay component templates and flow-run execution model for ETL work.

### Modified Capabilities
- `factory`: Rename sync APIs/models to flow APIs/models; rename credentials APIs/models to variables APIs/models; add flow execution paths and run tracking behavior.
- `schema`: Replace sync table/type naming with flow naming and update related foreign keys/indexes/relations.
- `cli`: Add `inflow`, `outflow`, and `relay` scaffold entries and update generated language from sync/credentials to flow/variables.
- `hub`: Rename sync UI/API integration to flows and credential UI/API integration to variables.
- `registry`: Add flow components to the component registry and update descriptions/labels to flow terminology.
- `agent-skill`: Update generated skill/docs guidance to flow and variables vocabulary where applicable.

## Impact

- Affected code: `src/factory.ts`, `src/factory.test.ts`, `src/cli/` (registry, templates, commands), schema templates, docs/spec files, and generated Hub/template consumers.
- Affected APIs: `/api/khotan/syncs*` and `/api/khotan/credentials*` removed/replaced by `/api/khotan/flows*` and `/api/khotan/variables*`.
- Affected data model: `khotan_syncs` renamed to `khotan_flows` with corresponding reference updates.
- Dependencies/systems: consumer projects and test app (`brs-khotan-connector`) require updated config keys/routes and regenerated scaffold files.
