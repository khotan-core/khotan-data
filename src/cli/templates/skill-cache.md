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
npx khotan add cache --yes
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

  await snapshot.set("latest", current, { ttl: "6h" });
  // diff previous vs current for delta handling...
}
```

API: `.get<T>(key)`, `.set(key, value, { ttl })`, `.delete(key)`. Available in
flow, relay, catch, and pass workflows.

## Related

- Build the flow that uses the cache → `khotan-flow`.
