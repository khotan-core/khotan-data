## MODIFIED Requirements

### Requirement: Plug registration
Each plug registration SHALL be an object with `name` (string, unique identifier), `baseUrl` (string), `authType` (string — one of 'bearer', 'basic', 'apiKey', 'custom'), and optional `flows` (array of flow registrations). Each flow registration SHALL have `name` (string), `type` (string — one of 'inflow', 'outflow', 'relay', 'webhook'), optional `schedule` (string, cron expression), optional `variants` (map of variant name → variant config `{ schedule?: string; onError?: function; onComplete?: function }`), optional `resource` (string — name of a registered resource this flow feeds), optional `to` (destination plug/system name for relay flows), optional `workflow` (Vercel Workflow execution function), and optional `run` (inline/manual execution function). A flow SHALL NOT declare both a top-level `schedule` and a `variants` map; if `variants` is present the top-level `schedule` is omitted.

#### Scenario: Register a plug with flows
- **WHEN** a user registers a plug `{ name: "stripe", baseUrl: "https://api.stripe.com", authType: "bearer", flows: [{ name: "products-inflow", type: "inflow", schedule: "0 * * * *" }] }`
- **THEN** the factory SHALL accept this configuration for database upsert

#### Scenario: Register a plug with flows that reference resources
- **WHEN** a user registers a plug `{ name: "shopify", baseUrl: "https://...", authType: "bearer", flows: [{ name: "products-inflow", type: "inflow", resource: "products" }] }`
- **THEN** the factory SHALL accept this configuration and link the flow to the "products" resource on init

#### Scenario: Register a flow with variants
- **WHEN** a user registers a flow `{ name: "pronto-items", type: "inflow", resource: "items", variants: { healthcheck: { schedule: "0 6 * * *" }, full: { schedule: "0 2 * * 0" } } }`
- **THEN** the factory SHALL accept this configuration for database upsert
- **AND** SHALL treat each variant as an independently schedulable run mode

#### Scenario: Flow references unknown resource
- **WHEN** a flow registration includes `resource: "products"` but no resource named "products" exists in the `resources` config array
- **THEN** the factory SHALL throw an error at configuration time

#### Scenario: Plug name uniqueness
- **WHEN** two plugs are registered with the same `name`
- **THEN** the factory SHALL throw an error at configuration time (before any database operation)

### Requirement: Programmatic flow starter
The factory instance SHALL expose `flow(flowNameOrId, options?).start(startOptions?)` so application code can start a tracked flow run without calling Vercel Workflow APIs directly. `startOptions` SHALL accept `variant` (string) selecting the variant for the run (defaulting to `default`), and SHALL accept `runType` as a deprecated alias for `variant`.

#### Scenario: Start a flow by registered name
- **WHEN** a user calls `khotanData.flow("products-inflow", { plugName: "shopify" }).start({ variant: "delta" })`
- **THEN** the factory SHALL resolve the registered flow, create a `khotan_runs` row with `variant` = `"delta"`, and start the registered flow execution path

#### Scenario: Ambiguous flow name
- **WHEN** multiple registered plugs have a flow with the same name
- **THEN** `flow(name).start()` SHALL throw and instruct the user to pass `{ plugName }`

## ADDED Requirements

### Requirement: Flow variant normalization
The factory SHALL normalize every registered flow to a non-empty map of variants. A flow that declares no `variants` SHALL be treated as having a single variant named `default` whose `schedule` is the flow's top-level `schedule` (or none). Variant names SHALL be non-empty and unique within a flow.

#### Scenario: Flow without variants gets an implicit default
- **WHEN** a flow is registered with `{ name: "products-inflow", type: "inflow", schedule: "0 * * * *" }` and no `variants`
- **THEN** the factory SHALL treat it as having one variant `default` with `schedule: "0 * * * *"`
- **AND** runs of that flow SHALL have `variant` equal to `"default"`

#### Scenario: Duplicate or empty variant name rejected
- **WHEN** a flow declares a variant whose name is empty or duplicates another variant name on the same flow
- **THEN** the factory SHALL throw an error at configuration time

### Requirement: Flow run context exposes the active variant
The flow run context (both the inline `run(ctx)` and durable `workflow(ctx)` paths) SHALL expose `variant` (string) identifying the active variant for the run. The context SHALL NOT expose `runType`.

#### Scenario: Variant available in flow code
- **WHEN** a flow run executes for the variant `"healthcheck"`
- **THEN** `ctx.variant` SHALL equal `"healthcheck"`

#### Scenario: Default variant in context
- **WHEN** a flow with no declared variants runs
- **THEN** `ctx.variant` SHALL equal `"default"`

### Requirement: Variant lifecycle hooks
A variant MAY declare `onError` and `onComplete` hook functions. When a run reaches a terminal state, the factory SHALL invoke the active variant's hook from the run-finalization path: `onError` for `failed` or `partial` runs, `onComplete` for successful runs. Each hook SHALL receive `(ctx, run)` where `run` summarizes the run (`id`, `status`, `variant`, `durationMs`, and counters `extracted`/`transformed`/`created`/`updated`/`deleted`/`failed`, plus `error`). A hook that throws SHALL be caught and logged and SHALL NOT change the run's recorded status.

#### Scenario: onError fires on failure
- **WHEN** a run for a variant with an `onError` hook ends with status `failed`
- **THEN** the factory SHALL invoke `onError(ctx, run)` with the run summary

#### Scenario: onComplete fires on success
- **WHEN** a run for a variant with an `onComplete` hook ends successfully
- **THEN** the factory SHALL invoke `onComplete(ctx, run)` with the run summary

#### Scenario: Hook error is isolated
- **WHEN** a variant hook throws during invocation
- **THEN** the error SHALL be caught and logged
- **AND** the run's recorded status SHALL be unchanged

### Requirement: Slack notifier helper
The package SHALL export `slackNotifier(webhookUrl)` from `khotan-data/factory` returning a hook function compatible with `onError`/`onComplete`. The returned hook SHALL POST a JSON message including the flow name, variant, status, error, and counters to the given Slack incoming webhook URL.

#### Scenario: Notify Slack on failure
- **WHEN** a variant is configured with `onError: slackNotifier(url)` and a run fails
- **THEN** the factory SHALL POST a JSON message describing the failed run to `url`

### Requirement: Variant-aware scheduling
The cron dispatcher SHALL evaluate each registered flow's variants and trigger any variant whose `schedule` matches the current time (and is overdue), passing that variant name to the run. Variants without a `schedule` SHALL be manual-only and SHALL NOT be auto-triggered.

#### Scenario: Variant scheduled independently
- **WHEN** the dispatcher runs and a flow has variants `healthcheck` (`0 6 * * *`) and `full` (`0 2 * * 0`), and the current time matches only `healthcheck`
- **THEN** the dispatcher SHALL trigger a run for the `healthcheck` variant only

#### Scenario: Manual-only variant not auto-triggered
- **WHEN** a variant has no `schedule`
- **THEN** the dispatcher SHALL never auto-trigger it

### Requirement: Flow run trigger selects a variant
Triggering a flow run SHALL select a variant by name via the programmatic starter (`flow(name).start({ variant })`), the trigger API body (`{ variant }`), and the CLI (`--variant`). When no variant is specified, the run SHALL use the `default` variant if one exists; if the flow declares variants and none is `default`, the trigger SHALL fail with an error listing the available variant names. The created `khotan_runs` row SHALL record the selected variant. For one minor release, `runType` (programmatic/API) and `--run-type` (CLI) SHALL be accepted as deprecated aliases mapping to `variant`.

#### Scenario: Start a flow with an explicit variant
- **WHEN** a user calls `khotanData.flow("pronto-items").start({ variant: "delta" })`
- **THEN** the factory SHALL create a `khotan_runs` row with `variant` = `"delta"` and start the flow execution path with `ctx.variant` = `"delta"`

#### Scenario: Trigger without variant uses default
- **WHEN** a flow with no declared variants is triggered without a variant
- **THEN** the run SHALL use variant `"default"`

#### Scenario: Trigger without variant when none is default
- **WHEN** a flow declares variants `delta` and `full` (no `default`) and is triggered without a variant
- **THEN** the trigger SHALL fail with an error listing `delta` and `full`

#### Scenario: Deprecated runType alias
- **WHEN** a caller passes `{ runType: "delta" }` (or CLI `--run-type delta`)
- **THEN** the factory SHALL treat it as `variant: "delta"` and SHALL emit a deprecation notice
