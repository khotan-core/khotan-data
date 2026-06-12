## 1. Spec + terminology baseline

- [x] 1.1 Finalize flow/variable terminology in all delta specs and remove unresolved wording gaps.
- [x] 1.2 Confirm hard-rename scope (no aliases) is reflected across proposal/design/specs artifacts.

## 2. Schema and adapter rename

- [x] 2.1 Rename schema/table definitions from `khotan_syncs` to `khotan_flows` in factory mirror and scaffolded schema template.
- [x] 2.2 Rename run foreign-key naming from `syncId`/`sync_id` to `flowId`/`flow_id` where flow runs are represented.
- [x] 2.3 Update adapter methods/types from sync naming to flow naming (`upsertFlow`, `listFlows`, `toggleFlowEnabled`, etc.).
- [x] 2.4 Update indexes, relation helpers, and type exports to flow naming.

## 3. Factory API + runtime behavior

- [x] 3.1 Rename config registration key from `syncs` to `flows` and update validation errors/messages to flow terms.
- [x] 3.2 Replace `/syncs*` routes with `/flows*` routes in the handler dispatcher and response payloads.
- [x] 3.3 Replace `/credentials/:plugName` routes with `/variables/:plugName` routes and aligned payload names.
- [x] 3.4 Add manual/API flow trigger execution path(s) for inflow/outflow/relay and insert run rows in `khotan_runs`.
- [x] 3.5 Ensure flow run lifecycle updates status/counters/metadata for success and failure paths.

## 4. CLI registry + templates

- [x] 4.1 Add `inflow`, `outflow`, and `relay` entries to CLI registry with separate templates under `flows/`.
- [x] 4.2 Create `src/cli/templates/inflow.ts`, `outflow.ts`, and `relay.ts` with component-specific builder/types/examples.
- [x] 4.3 Update scaffolded config/template wording from sync/credentials to flow/variables.
- [x] 4.4 Update CLI help/output text to reflect new component names and route terminology.

## 5. Hub and generated UI

- [x] 5.1 Update Hub template models/state/labels from sync naming to flow naming.
- [x] 5.2 Update Hub fetch and toggle calls from `/api/khotan/syncs` to `/api/khotan/flows`.
- [x] 5.3 Update variable-management UI/API wording and endpoints from credentials to variables.

## 6. Tests and verification

- [x] 6.1 Update unit/integration tests in `src/factory.test.ts` (and related tests) for hard-rename routes and payloads.
- [x] 6.2 Add/adjust tests for flow trigger execution and run record behavior.
- [x] 6.3 Run package test/build checks to verify renamed interfaces compile and pass.

## 7. Docs and external validation

- [x] 7.1 Update khotan-data docs/spec text and scaffolded skills to flow/variables terminology.
- [x] 7.2 Sync ai-native-etl docs pages (`.md` and `page.tsx`) to match hard rename and flow component model.
- [x] 7.3 Validate in `brs-khotan-connector` using pack/install workflow and verify `/api/khotan/flows`, `/api/khotan/variables`, and Hub behavior.
