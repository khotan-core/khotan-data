---
name: khotan-cache
description: >
  Add first-class durable caching to khotan flows and webhooks — named cache
  definitions with scope and TTL for expensive upstream snapshots,
  checkpoints, and dedupe markers. Use when the user asks for caching,
  snapshots, avoiding repeated fetches, or persisting sync state between runs.
---

Durable, named caches for khotan sync workloads. Use this when a flow, relay,
catch, or pass needs to remember something across runs — an upstream snapshot, a
checkpoint cursor, or a dedupe marker.

## When to use

- The user explicitly asked for caching/snapshots, or a flow re-fetches the same
  expensive upstream data every run.
- You need to compare "current vs previous" between runs (delta detection).

## Scaffold

```bash
npx khotan-data add cache --yes
```

Requires the `schema` component. Creates `{outputDir}/caches/cache.ts` (the
`cache()` builder) and `cache.example.ts`.

## Defining a cache

```typescript
import { cache } from "./cache";

export const productsSnapshotCache = cache({
  name: "shopify-products-snapshot",
  scope: {
    plug: "shopify",
    resource: "products",
    flow: "shopify-products-inflow",
  },
  ttl: "6h", // "30m", "6h", or a number of seconds
});
```

`scope` is ownership metadata for humans and runtime validation. `ttl` is the
default expiry (string like `"6h"` or seconds).

## Registering

In `{outputDir}/khotan.ts`:

```typescript
import { productsSnapshotCache } from "./caches/products-snapshot";

const khotanData = khotan({
  adapter: drizzleAdapter(db),
  caches: [productsSnapshotCache],
  plugs: [/* ... */],
});
```

## Using a cache inside a flow

Use `khotanCache(ctx, name)` from inside a `"use step"` function (it needs the
workflow `ctx`):

```typescript
import { khotanCache } from "khotan-data/factory";

async function syncProducts(ctx: RelayContext) {
  "use step";
  const snapshot = khotanCache(ctx, "shopify-products-snapshot");

  const previous = (await snapshot.get<Record<string, unknown>[]>("latest")) ?? [];
  const current = await fetchCurrentProducts(ctx);

  await snapshot.set("latest", current);
  // diff previous vs current for delta handling...
}
```

API: `.get<T>(key)`, `.set(key, value)`, `.delete(key)`. Available in flow,
relay, catch, and pass workflows. TTL is not a per-`set()` argument — it is
configured once on the cache definition (`ttl` in `cache({ ... })`).

## Cursor helpers and delta skips

For cursors, prefer `createCursorHelper(name)` instead of hand-rolled Drizzle
queries. The helper uses `khotanCache(ctx, name)`, so it works inside top-level
`"use step"` functions:

```typescript
import { createCursorHelper, deltaSkip } from "khotan-data/factory";

const productsCursor = createCursorHelper<string>("shopify-products-cursor");

async function syncProducts(ctx: RelayContext) {
  "use step";
  const cursor = await productsCursor.get(ctx);
  const response = await shopify.get<{ data: Product[]; nextCursor?: string }>(
    "/products",
    { params: cursor ? { cursor } : undefined },
  );

  const delta = await deltaSkip(
    ctx,
    "shopify-products-delta",
    response.data,
    (record) => record.code,
    { updateCache: false },
  );

  await destination.batchPost("/products", delta.changed, { batchSize: 200 });
  await delta.commit();

  if (response.nextCursor) await productsCursor.set(ctx, response.nextCursor);
}
```

When `updateCache` is omitted, `deltaSkip` returns the changed records and writes
the hash cache before returning for compatibility. For write-back flows, use
`{ updateCache: false }` and call `commit()` only after the destination write
succeeds.

For soft-delete/disappeared-record handling, store a successful run's keyset in
a cache entry and diff it against the current run after extraction. Update the
cached keyset only after the delete/update write-back succeeds; do not rely on a
workflow context prior-key API.

## Related

- Build the flow that uses the cache → `khotan-flow`.
