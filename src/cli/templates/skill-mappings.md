---
name: khotan-mappings
description: >
  Define resources and manage cross-service record mappings in khotan — a
  canonical connect key plus per-plug refs so the same entity is matched and
  deduped across services. Use when the user asks about mappings, connect
  fields, matching records, external IDs, or idempotent upserts across systems.
---

Resources and mappings let khotan recognize "the same record" across services.
A resource declares a canonical `connectField`; a mapping stores that canonical
value plus the per-plug `refs` (each service's own ID for the record).

## When to use

- The user asked for record matching, dedupe, or "link the X in service A to the
  X in service B".
- A flow needs idempotent upserts keyed by a stable external identifier.

## Defining resources

Resources are declared in the factory config, `{outputDir}/khotan.ts`:

```typescript
const khotanData = khotan({
  adapter: drizzleAdapter(db),
  resources: [
    { name: "products", mapping: { connectField: "sku" } },
    { name: "orders", mapping: { connectField: ["store_id", "order_number"] } },
  ],
  plugs: [/* ... */],
});
```

`connectField` is the canonical key — a single field or a composite array. This
is the value mappings are keyed on.

## Mappings CLI

Inspect and mutate mappings against the running dev server:

```bash
npx khotan-data mappings list <resource> --search <term> --limit 20 --offset 0
npx khotan-data mappings lookup <resource> --connect-value <value>
npx khotan-data mappings lookup <resource> --plug <plugName> --ref <ref>
npx khotan-data mappings upsert <resource> --connect-value <value> --refs '{"shopify":"123","hubspot":"abc"}'
npx khotan-data mappings update <mappingId> --resource <resource> --connect-value <value> --refs '{...}'
npx khotan-data mappings delete <mappingId>
```

- `upsert` creates/updates by canonical connect value (the idempotent path).
- `lookup` resolves either by canonical value or by a specific plug's ref.
- `--metadata '{...}'` attaches optional contextual data on upsert/update.

These are management routes, so they pass through your `authorize` hook (the dev
CLI signs an HMAC token from `KHOTAN_SECRET`).

## Using mappings in a flow

Inside a flow step, resolve or record the cross-service link as you upsert:

```typescript
const products = ctx.mapping("products");

const existing = await products.lookupByRef("shopify", shopifyProduct.id);

const mapping =
  existing ??
  (await products.upsert({
    connectValue: shopifyProduct.sku,
    refs: { shopify: shopifyProduct.id },
  }));

// Later, attach another system's id without replacing the Shopify ref.
await products.upsert({
  connectValue: shopifyProduct.sku,
  refs: { cin7: cin7Product.id },
});
```

`ctx.mapping("<resource>")` resolves the resource id internally, so flows should
not query `khotan_resources` or handwrite `refs->>'plug' = id` JSONB filters.
Use `lookup(connectValue)` for canonical keys and `lookupByRef(plug, ref)` for
service ids.

`upsert` merges partial `refs` by default. Pass `mergeRefs: false` to replace the
refs object for that connect value:

```typescript
await ctx.mapping("products").upsert({
  connectValue: "SKU-123",
  refs: { cin7: "P-456" },
  mergeRefs: false,
});
```

This keeps upserts idempotent across full/delta/backfill runs.

## UI (optional, only if requested)

A searchable browser is available — but do not add UI/routes without user
consent (see `khotan-frontend`):

- Component: `npx khotan-data add mapping-browser --yes`
- Page block at `/mappings`: `npx khotan-data add mappings-page-1 --yes`

## Related

- Build the flow that reads/writes mappings → `khotan-flow`.
