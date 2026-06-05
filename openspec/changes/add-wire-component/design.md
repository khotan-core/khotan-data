## Context

Khotan-data scaffolds self-contained, user-owned templates for data integration. The existing `plug.ts` template handles outbound HTTP (auth, retry, pagination). The `schema.ts` template tracks plugs, syncs, and runs in Postgres via Drizzle. The factory registers plug/sync metadata at startup.

Currently, the schema has a `webhook` sync type but no mechanism to actually call an external service's subscription API. Users who want push-based data from services with programmatic webhook registration (POST to `/webhooks`, `/subscriptions`, etc.) must hand-roll this lifecycle. Wire fills that gap as a scaffolded template — same philosophy as Plug: zero runtime dependency on khotan-data, user owns the file.

## Goals / Non-Goals

**Goals:**
- Provide a `wire()` factory function that manages webhook subscription lifecycle (create, delete, get) using a Plug instance for HTTP
- Persist subscription state in a `khotan_wires` table so subscriptions are queryable and manageable
- Allow `khotan_runs` to reference wires (webhook-triggered execution records alongside sync-triggered ones)
- Register wire as a CLI component with `requires: ["plug", "schema"]`
- Include commented example usage in the template and CLI output

**Non-Goals:**
- Incoming webhook request handling (user writes their own route handler)
- HMAC signature verification (user adds if needed)
- Secret generation or rotation
- Drift detection / subscription verification against remote state
- Dashboard UI for wire management (future work)
- Callback URL auto-discovery (user passes it explicitly)
- Support for services where webhooks can only be configured via UI/CLI (GCP Pub/Sub, Clerk, etc.)

## Decisions

### Decision 1: Wire is a scaffolded template, not a runtime export

**Choice**: `wire.ts` is scaffolded into the user's project like `plug.ts`

**Alternatives considered**:
- Runtime export from `khotan-data/wire`: Would create an awkward dependency where the package needs to import the user's Plug instance and DB. Breaks the "zero runtime dependency" principle.
- Both (runtime engine + config template): Adds complexity for marginal gain at this scale.

**Rationale**: Wire's logic is ~100-150 lines. Keeping it as a template means the user can add HMAC verification, custom error handling, environment switching, or any other bespoke logic without fighting an abstraction. Consistent with plug.ts approach.

### Decision 2: Config object with buildBody/parseId functions

**Choice**: The `wire()` factory accepts a config with `subscribe.buildBody(callbackUrl)` and `subscribe.parseId(response)` functions.

**Alternatives considered**:
- Static body object: Too inflexible — callback URL changes per environment, some services need dynamic values.
- Class-based adapter: Over-engineered for 2 functions.
- Declarative mapping DSL: Adds learning curve for no real benefit.

**Rationale**: Every service shapes its subscription request and response differently. Two functions (one to build the request, one to extract the remote ID from the response) are the minimal interface that covers all services.

### Decision 3: khotan_wires as a separate table from khotan_syncs

**Choice**: New `khotan_wires` table rather than overloading the syncs table.

**Alternatives considered**:
- Store wire state in khotan_syncs with extra nullable columns: Muddies the sync concept, adds columns that are always null for non-webhook syncs.
- Polymorphic approach with a shared "flows" table: Premature abstraction.

**Rationale**: Wires have different columns than syncs (remoteId, callbackUrl, eventTypes). A separate table keeps both concepts clean. Runs can reference either via nullable FKs.

### Decision 4: Nullable dual FKs on khotan_runs

**Choice**: `khotan_runs` gets a nullable `wire_id` column. Existing `sync_id` becomes nullable. Exactly one must be non-null.

**Alternatives considered**:
- Discriminated `source_type` + `source_id` columns: Loses FK constraint enforcement.
- Wire creates phantom sync rows: Hacky, confusing.

**Rationale**: Real FK constraints are valuable for data integrity. The "exactly one non-null" invariant is enforced at the application level (or with a check constraint if the user wants). This is a minimal schema change.

### Decision 5: db passed at wire config time

**Choice**: The Drizzle db instance is passed when creating the wire instance, not per-operation.

**Alternatives considered**:
- Pass db per call: Repetitive, clutters the API.
- Wire imports db directly: Hardcodes import path, less testable.

**Rationale**: Passing at config time means the wire instance is self-contained and ready to use. User sets it up once (alongside plug), then calls `.create()` / `.delete()` / `.get()` without ceremony.

## Risks / Trade-offs

- **[Breaking schema change]** Making `sync_id` nullable on `khotan_runs` is a schema modification for existing users. → Mitigation: This is a template file the user owns. They apply the change via their own migration. Document clearly in the template comments.

- **[No verification]** Without drift detection, a subscription could be deleted on the remote side without the local DB knowing. → Mitigation: Explicitly out of scope for MVP. User can check manually or we add verification later.

- **[No incoming handler]** Wire only manages the subscription, not what happens when events arrive. Users must write their own route handler. → Mitigation: The commented example in wire.ts shows the full pattern including a sketch of the incoming handler.

- **[Event types are static]** The events array is baked into the config, not dynamic. → Mitigation: For MVP this is fine. User can rebuild the wire config if events change, or modify the template to accept events at create time.
