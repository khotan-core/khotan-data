## Context

khotan already has several places where state can live, but none of them cleanly solve durable caching for expensive sync workloads:

- `khotan_mappings.metadata` is entity-centric contextual data, not general sync-state storage
- plug vars are encrypted configuration and hidden operational state, not queryable cache entries
- wire metadata is tied to webhook subscription lifecycle
- run metadata is execution output, not reusable state for later runs

This becomes a real product gap when upstream APIs do not support delta-sync primitives such as `updatedAt` filters or incremental cursors. In those cases, relays, passes, and reconciliation-style flows need a durable place to store expensive fetch results, dedupe markers, or last-known sync checkpoints so later executions can avoid unnecessary work.

The change should feel native to khotan's existing model:

- scaffold owned code with `khotan add ...`
- register it in `khotan.ts`
- upsert definitions into standard khotan tables
- access it from runtime helpers and workflow contexts

## Goals / Non-Goals

**Goals:**
- Introduce a first-class cache component that can be scaffolded and registered in `khotan.ts`
- Persist cache definitions in the khotan runtime model rather than leaving cache entirely ad hoc
- Provide durable cache entry storage for sync-state, expensive fetch results, and dedupe markers
- Support optional TTL and manual bust/refresh semantics
- Make cache available to flows, relays, catches, and passes through workflow-safe helpers
- Keep cache queryable and inspectable through the factory runtime rather than hiding it in encrypted vars

**Non-Goals:**
- Building a general-purpose external cache backend such as Redis in v1
- Adding a cache browser UI or dedicated `khotan cache ...` CLI surface in v1
- Versioned or historical snapshot retention beyond the latest stored value per key
- Automatic invalidation based on downstream writes or mapping mutations
- Replacing mappings as the canonical store for cross-system identity
- Inferring cache definitions automatically from flows, relays, or passes

## Decisions

### Decision: Cache is a standalone top-level registration surface

Cache will be registered as a top-level `caches` array on `khotan()` rather than as a sub-field on `plugs`, `resources`, or `flows`.

Target shape:

```ts
const khotanData = khotan({
  adapter: drizzleAdapter(db),
  resources: [...],
  plugs: [...],
  caches: [
    cache({
      name: "shopify-products-snapshot",
      scope: {
        plug: "shopify",
        resource: "products",
        flow: "shopify-to-cin7-products",
      },
      ttl: "6h",
    }),
  ],
});
```

This keeps cache aligned with the current source-of-truth model in `khotan.ts` while avoiding the false assumption that cache belongs to only one execution primitive.

**Alternatives considered**
- **Plug-nested caches**: rejected because some cache state is shared across multiple flows or webhook handlers for the same plug
- **Resource-only caches**: rejected because not all cache state is entity-centric
- **Implicit cache with no registration**: rejected because the user explicitly wants a component that is installed and then defined in `khotan.ts`

### Decision: Use separate cache definitions and cache entries tables

The runtime will persist:

- one table for cache definitions registered in `khotan.ts`
- one table for cache entries keyed under those definitions

This mirrors khotan's pattern of separating registered configuration from operational state. Definitions capture intent and scope; entries capture mutable cached values.

**Alternatives considered**
- **Single table for everything**: rejected because it mixes registration metadata with entry lifecycle and weakens init-time validation
- **Store entries inside plug vars or mappings metadata**: rejected because those stores have different semantics and poor observability for cache use cases

### Decision: Cache entries use latest-value semantics keyed by `cache + key`

Each cache definition will store at most one latest value for a given logical key. Entries are overwritten on upsert rather than versioned.

Intended fit:

- full-resource snapshots such as `"all-products"`
- checkpoints such as `"last-successful-run"`
- dedupe markers such as `"event:{id}"`
- reconciliation state for expensive transforms

This keeps the API simple and supports the core problem without introducing retention policy complexity.

**Alternatives considered**
- **Historical snapshots**: rejected for v1 because storage growth, browsing, and rollback semantics become more complex
- **Append-only event log**: rejected because khotan already has runs and webhook events for history

### Decision: Cache payloads are JSON values with optional definition-level TTL

Cache entries will store JSON payloads. Definitions may declare an optional default TTL; when present, writes compute an `expiresAt` for each entry. Reads treat expired entries as misses unless an internal helper explicitly requests stale data in the future.

Definition-level TTL is enough for v1 because the user goal is easy, reliable caching rather than a large policy surface.

**Alternatives considered**
- **String-only payloads**: rejected because sync caches often need structured arrays or objects
- **Per-write TTL overrides in v1**: rejected to keep the contract narrow and predictable
- **No TTL at all**: rejected because stale data is one of the main risks with durable cache

### Decision: Scope is declarative metadata, not part of the entry key

Each cache definition may declare scope metadata such as:

- `plug`
- `resource`
- `flow`

The runtime validates referenced names against registered plugs, resources, and flows during initialization. Scope helps humans and tooling understand intended ownership, but entry uniqueness remains `cache_id + key`.

This provides useful structure without forcing every caller to embed plug/resource identifiers in every read and write API call.

**Alternatives considered**
- **Encode scope into every entry key**: rejected because it produces noisy keys and repeats information already known by the definition
- **No scope metadata**: rejected because it weakens validation and makes cache harder to reason about operationally

### Decision: Factory and workflow helpers expose cache access directly

The runtime should not require workflow code to call raw HTTP routes to use cache. The implementation should expose cache helpers through:

- the `KhotanInstance` programmatic API
- workflow contexts used by flows, relays, catches, and passes

A suitable v1 shape is:

- `khotanData.cache("shopify-products-snapshot").get("all-products")`
- `khotanData.cache("shopify-products-snapshot").set("all-products", payload)`
- `khotanData.cache("shopify-products-snapshot").delete("all-products")`

with equivalent workflow-safe access from execution contexts.

**Alternatives considered**
- **HTTP-only cache access**: rejected because internal workflows should not need to round-trip through handler routes
- **Global unscoped helper without cache definitions**: rejected because it undermines the registration model and validation story

### Decision: Handler routes exist for parity and future tooling, but CLI/UI stay out of scope for v1

The factory handler will expose cache operations so future tooling can inspect and operate on cache entries using the standard runtime route. However, this change does not include a dedicated cache browser or command group.

This preserves a future path for operational tooling without expanding the first implementation beyond the core runtime and scaffold problem.

**Alternatives considered**
- **Ship CLI and UI immediately**: rejected because the initial user need is the data/runtime primitive itself
- **No handler routes at all**: rejected because khotan's operational surfaces rely on the standard runtime API

## Risks / Trade-offs

- **[Cache becomes a dumping ground for unrelated state]** → Mitigation: validate registration scope, document intended use cases, and keep mappings/vars/wire metadata semantics clearly separate
- **[TTL semantics may surprise users if expired rows still exist in the database]** → Mitigation: specify that expiry affects reads first, with cleanup as a separate concern
- **[Top-level cache registration adds more surface area to `khotan.ts`]** → Mitigation: keep the config shape small and align it with existing first-class registration patterns
- **[No CLI/UI in v1 reduces observability]** → Mitigation: preserve handler routes and programmatic APIs so tooling can be added later without changing the data model
- **[Large JSON cache payloads may grow quickly]** → Mitigation: frame cache as sync-state and expensive-fetch storage, not a long-term archival store

## Migration Plan

1. Add the new cache capability and delta specs
2. Extend runtime types, adapter contract, and init flow in `src/factory.ts`
3. Add internal/runtime schema definitions and generated Drizzle schema support
4. Add registry entries and templates for the `cache` component
5. Add workflow context helpers and focused tests for cache read/write/expiry behavior
6. Document registration and usage patterns for expensive sync workloads

Rollback is additive and straightforward:

- removing cache registrations should stop new definition upserts
- cache tables can remain unused by older runtimes if additive schema changes are safe
- no existing flow, pass, relay, mapping, or wire behavior should need migration to continue working

## Open Questions

- Whether the scaffolded cache component should generate files under `caches/` or a singular `cache/` builder folder
- Whether cache reads in v1 need an explicit `allowExpired` or `peek` mode for debugging, or whether treating expired entries as plain misses is sufficient
- Whether later iterations should add a cache CLI surface once the runtime contract is proven in real relay/pass workloads
