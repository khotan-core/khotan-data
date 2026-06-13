## Context

khotan already has a useful identity core:

- `resources` define logical entity types such as products or customers
- `khotan_mappings` stores one row per entity instance inside a resource
- `refs` stores per-plug external identifiers
- `metadata` stores contextual, non-identity fields
- the runtime already exposes CRUD and lookup endpoints for mappings

What is missing is the product layer around that model. Users cannot scaffold a dedicated mappings component, agents do not have a first-class mappings CLI, and the resource config is too weak for the way mappings are actually used in relays, passes, and reconciliation flows. In practice, users want to declare which plugs participate in a resource, what unique identifier each plug contributes, and what shared field or fields produce the canonical `connectValue`.

This design promotes mappings from "available infrastructure" to a first-class khotan capability without abandoning the existing one-row-per-resource-entity model.

## Goals / Non-Goals

**Goals:**
- Preserve the existing one-row-per-resource-entity mapping shape
- Keep `connectValue` as the canonical natural key used for human lookup and cross-system grouping
- Treat per-plug external identifiers as first-class data in `refs`, not ad hoc metadata
- Allow resource config to declare:
  - participant plugs
  - one unique identifier descriptor per plug
  - a connect field that can be single-field or composite at config time
- Add runtime APIs that support:
  - lookup by connect value
  - lookup by plug ref
  - paginated list/search
  - create, update, and delete
- Add an operational CLI that is easy for agents to script against
- Add a scaffolded mappings browser component and page block for humans

**Non-Goals:**
- Changing the underlying `khotan_mappings` row shape from one row per entity to pairwise source-target rows
- Introducing multiple unique identifiers per plug in v1
- Adding automatic mapping creation inside flows, relays, or passes in this change
- Adding conflict-resolution policies for competing metadata updates
- Persisting UI table preferences, custom saved views, or role-based authorization
- Turning metadata into a fully typed schema with database-enforced columns

## Decisions

### Decision: Keep one canonical mapping row per resource entity

Mappings will remain resource-scoped and canonical:

- one row per logical entity within a resource
- one `connectValue` per row
- one `refs` object keyed by plug name
- one `metadata` object for contextual fields

This matches the current schema and preserves the best property of the existing model: a single lookup can answer "what are all known identities for this customer/product/order?"

**Alternatives considered**
- **Pairwise mappings**: rejected because they scale poorly with more plugs and make common questions require multi-hop lookups
- **One row per plug identity**: rejected because it fragments the canonical view of an entity

### Decision: Per-plug unique identifiers stay in `refs`, not `metadata`

Per-plug external IDs are the actual cross-system mapping and will stay first-class in `refs`.

Example:

```json
{
  "connectValue": "alice@example.com",
  "refs": {
    "shopify": "gid://shopify/Customer/123",
    "cin7": "cust_456"
  },
  "metadata": {
    "firstName": "Alice",
    "lastName": "Jones"
  }
}
```

This keeps identity semantics clean:

- `connectValue` answers "what shared thing is this?"
- `refs` answers "what is this thing called in each plug?"
- `metadata` answers "what useful context should we display or cache?"

**Alternatives considered**
- **Put plug IDs into metadata**: rejected because it hides the core mapping semantics in an unstructured bucket
- **Add one database column per plug**: rejected because plugs are dynamic and khotan is scaffold-driven, not hard-coded to fixed integrations

### Decision: Resources own mapping configuration

Resource registration will be expanded rather than introducing a new top-level `mappings` config.

Target shape:

```ts
resources: [
  {
    name: "customers",
    connectField: "email",
    plugs: {
      shopify: { uniqueIdentifier: "id" },
      cin7: { uniqueIdentifier: "id" },
    },
  },
]
```

This keeps the concept hierarchy coherent:

- a resource defines what the shared entity is
- the mapping layer explains how specific plugs identify that entity
- flows, relays, and passes can all attach to the same resource contract

**Alternatives considered**
- **Top-level `mappings` config**: rejected because it creates two overlapping sources of truth for resource identity
- **Infer allowed plugs from observed refs**: rejected because UI, CLI validation, and agent usage benefit from an explicit contract

### Decision: Composite connect fields compile into one canonical `connectValue`

At config time, a resource may declare either:

- a single `connectField`
- a composite `connectField` list

The runtime will still persist one canonical `connectValue` string.

This preserves compatibility with the existing table and unique constraint while allowing richer matching semantics in the authoring model. The canonical string must be derived deterministically so upserts and lookups remain stable.

The design intent is:

- single field resources continue to work unchanged
- composite resources become possible without introducing a second mapping table or composite database key
- CLI and UI continue to present one canonical `connectValue`

**Alternatives considered**
- **Add multiple connect columns in the schema**: rejected because it complicates storage and indexing for limited v1 gain
- **Store composite pieces only in metadata**: rejected because the canonical identity must remain first-class and queryable

### Decision: Add both connect-value lookup and plug-ref lookup

The runtime and CLI will support two primary lookup styles:

- by `connectValue`
- by `plugName + ref`

`connectValue` is the main human and agent-facing key for listing, browsing, and direct lookup. Plug-ref lookup remains critical for transform code paths and cross-system resolution.

**Alternatives considered**
- **Connect-value only**: rejected because relays and passes often begin with a source plug identity
- **Plug-ref only**: rejected because users explicitly want agent-friendly lookup using the canonical shared identity

### Decision: Paginated list/search becomes a first-class mapping API

The existing `GET /resources/:id/mappings` route returns all rows for a resource. That is fine for early infrastructure but not for operational tooling. The runtime will add a paginated list/search surface so the CLI and browser component can:

- page through mappings
- search by `connectValue`
- optionally filter by refs or text-bearing metadata
- avoid loading large resources into memory all at once

This should be the canonical browsing route used by the new mappings UI and CLI.

**Alternatives considered**
- **Keep client-side pagination only**: rejected because it does not scale and is poor for agents
- **Expose raw SQL-like filtering**: rejected because khotan should provide a narrow, stable operational API

### Decision: Create a dedicated mappings browser capability instead of folding everything into Hub

Mappings are conceptually adjacent to Hub, but they are a different operational surface:

- Hub focuses on plugs, flows, wires, and toggles
- mappings management is entity-centric, search-heavy, and CRUD-heavy

The best fit is a new scaffoldable component plus a dedicated block, not an overloaded Hub panel.

**Alternatives considered**
- **Add mappings tab into Hub only**: rejected because it makes Hub broader and more coupled while still not giving users a standalone page primitive
- **CLI only**: rejected because mappings are exactly the sort of data users want to inspect and edit visually

### Decision: UI supports create, edit, and delete in v1

The mappings browser will not be read-only. It will support:

- searchable paginated table
- create
- edit
- delete

This is intentionally operational and somewhat dangerous, but it matches the user's expectation that mappings are editable system state, not immutable logs.

**Alternatives considered**
- **Read-only v1**: rejected because it would still force users back to raw API calls for basic maintenance
- **Soft-delete only**: rejected for v1 simplicity; hard delete matches current runtime semantics

## Risks / Trade-offs

- **[Composite connect fields still collapse to one stored string]** → Mitigation: define deterministic canonicalization rules in runtime requirements so writes and lookups stay stable
- **[Search semantics can grow messy if metadata is treated as free-form text]** → Mitigation: keep search scope narrow in v1 and define it explicitly in the specs
- **[Editable mappings UI can let users break cross-system identity state]** → Mitigation: make delete/edit explicit operations and keep server-side validation around resource and plug membership
- **[Explicit plug membership may feel strict for some users]** → Mitigation: keep the config optional enough for current simple cases while using membership validation when declared
- **[No auto-mapping generation means users still need separate workflow logic]** → Mitigation: this change makes the operational surface solid first so later automation can build on a stable contract

## Migration Plan

1. Add the new mapping browser capability and delta specs
2. Extend runtime resource config parsing and mapping APIs
3. Add the `khotan mappings` CLI
4. Add registry entries and templates for the mappings component and page block
5. Document the richer `resources` shape

Rollback is straightforward because this design is additive at the product surface level:

- existing mapping rows remain valid
- existing `refs` and `metadata` semantics remain compatible
- older resources using a single `connectField` continue to work

If implementation avoids schema changes, no database rollback is required. If implementation introduces any schema additions for search optimization, they must be additive and safe to ignore by older runtimes.

## Open Questions

- Whether the paginated list endpoint should expose search by metadata values in addition to `connectValue` and refs, or keep metadata search out of scope for v1
- Whether resource plug membership should be required whenever mappings are used, or remain optional for backward compatibility
