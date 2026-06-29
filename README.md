# khotan-data

Data sync, ETL, and webhook primitives for Next.js + Drizzle + Postgres. shadcn for data plumbing.

Built for **Next.js + Drizzle + Postgres** projects. Think shadcn × better-auth, but for data.

## Install

```bash
npm i khotan-data
```

Requires `drizzle-orm` as a peer dependency (you almost certainly already have it).

## CLI

Scaffold components into your Next.js + Drizzle project:

```bash
# Initialize khotan config
npx khotan init

# Full setup (drizzle + shadcn + config in one go)
npx khotan init --full

# Skills only (install agent skills; skip config + core files + package install)
npx khotan init --skills-only

# Add components (reusable building blocks — never create pages)
npx khotan add schema    # Drizzle table definitions (plugs, flows, runs, resources, mappings)
npx khotan add cache     # Durable key/value caches for workflows and relays
npx khotan add plug      # Fetch wrapper with auth, retry, pagination
npx khotan add inflow    # Workflow-backed flow for pulling data in
npx khotan add outflow   # Workflow-backed flow for pushing data out
npx khotan add relay     # Workflow-backed flow for moving data between plugs
npx khotan add hub       # Dashboard UI + API route + config (requires shadcn)

# Add blocks (sample pages composed from components)
npx khotan add config-page-1   # /config page that renders the KhotanHub dashboard

# Options
npx khotan add schema --force   # Overwrite existing files without prompting
npx khotan add hub --yes        # Non-interactive mode: auto-accept all prompts
npx khotan generate --force     # Regenerate schema (prompts before overwriting by default)
```

## Factory (Runtime Engine)

Register plugs, caches, flows, and resources — the factory upserts them on boot and serves a REST API:

```typescript
import { khotan, drizzleAdapter, toNextJsHandler } from "khotan-data/factory";
import { db } from "@/db";
import { shopifyPlug } from "@/lib/khotan/plugs/shopify";
import { shopifyProductsInflow } from "@/lib/khotan/flows/shopify-products";
import { shopifyProductsSnapshotCache } from "@/lib/khotan/caches/shopify-products-snapshot";

const khotanData = khotan({
  adapter: drizzleAdapter(db),
  // Gate the management API behind your auth layer (see "Security" below).
  authorize: async (request) => {
    const session = await auth.api.getSession({ headers: request.headers });
    return Boolean(session?.user);
  },
  resources: [
    { name: "products", mapping: { connectField: "sku" } },
  ],
  caches: [
    shopifyProductsSnapshotCache,
  ],
  plugs: [
    {
      name: "shopify",
      plug: shopifyPlug,
      flows: [
        shopifyProductsInflow,
      ],
    },
  ],
});

// Next.js App Router: app/api/khotan/[...all]/route.ts
export const { GET, POST, PUT, DELETE } = toNextJsHandler(khotanData.handler);

// Start a flow through Khotan so run tracking + Workflow IDs are recorded
await khotanData.flow("products-inflow", { plugName: "shopify" }).start({
  variant: "delta",
});
```

## Security

The management API (`/api/khotan/*`) exposes plug credentials and operational
controls. It is **public unless you gate it**. Pass an `authorize` hook — it
receives the raw `Request` and returns `true`/`false`, so it composes directly
with session libraries like better-auth:

```typescript
authorize: async (request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.role === "admin";
},
```

- `KHOTAN_SECRET` encrypts plug credentials **at rest** (AES-256-GCM). It is not
  an auth credential — it never gates requests, and **must not** be sent as a
  `Bearer` token. Management routes are gated only by `authorize` (plus a
  dev-only CLI HMAC token derived from the secret). A rejected request returns
  `401` with `code: "authorize_rejected"` and a `hint`. To trigger a flow over
  HTTP (`POST /api/khotan/flows/{flowId}/runs`), send a credential your
  `authorize` hook accepts — or just call `khotanData.flow(name).start()` from
  server code, which needs no auth. Set the secret to a high-entropy value.
- Inbound webhooks (verified via per-plug `onVerify`), the cron dispatcher
  (`CRON_SECRET`), and debug routes (`KHOTAN_DEBUG`, non-production only) are
  exempt from `authorize` automatically.
- `KHOTAN_DEBUG` is force-disabled when `NODE_ENV=production`. The cron route
  fails closed in production when `CRON_SECRET` is unset.
- Protect the Hub dashboard page (e.g. `/config`) with your app's middleware —
  `authorize` only guards the API.

## Caches

Use first-class caches when a flow, relay, catch, or pass needs durable state between runs.

```typescript
import { cache } from "@/lib/khotan/caches/cache";

export const shopifyProductsSnapshotCache = cache({
  name: "shopify-products-snapshot",
  scope: {
    plug: "shopify",
    resource: "products",
    flow: "shopify-products-inflow",
  },
  ttl: "6h",
});
```

Inside workflows, use `khotanCache(ctx, "name")` for snapshots, cursors, and dedupe markers:

Declare `"use step"` functions at module top level and pass them serializable
values only (`ctx` is plain data). Nesting steps inside the `"use workflow"`
function fails at runtime — the Workflow compiler cannot hoist closures that
capture workflow scope.

```typescript
import { khotanCache } from "khotan-data/factory";

// Step: top-level, retried independently, full Node.js access.
async function syncProducts(ctx: InflowContext) {
  "use step";
  const snapshotCache = khotanCache(ctx, "shopify-products-snapshot");
  const previous =
    (await snapshotCache.get<Array<Record<string, unknown>>>("latest")) ?? [];

  const response = await shopifyPlug.get<{ data?: Array<Record<string, unknown>> }>("/products");
  const records = Array.isArray(response.data) ? response.data : [];

  await snapshotCache.set("latest", records);

  return {
    extracted: records.length,
    transformed: records.length,
    created: records.length,
    metadata: { previousCount: previous.length },
  };
}

// Workflow: orchestration only.
async function shopifyProductsWorkflow(ctx: InflowContext) {
  "use workflow";
  return syncProducts(ctx);
}
```

Return a `FlowRunResult` from the workflow or from the final `"use step"` call.
Khotan observes the workflow return value and finalizes `khotan_runs` and
`khotan_flows` automatically, including counters, duration, `partial` status
when failures are non-zero, error text, and metadata. This returned
`FlowRunResult` is the production-safe contract for durable workflows because
hosted workflow contexts may be serialized and rehydrated. Inline `run(ctx)`
handlers also expose `ctx.finalize(result)` as an explicit escape hatch when
returning a final result is not practical.

## Quick Start

```typescript
import { Pipeline, fromQuery, map, filter, toDrizzle } from "khotan-data";
import { db } from "@/db";
import { users, analytics } from "@/db/schema";
import { eq } from "drizzle-orm";

const result = await Pipeline.create("user-analytics")
  .extract(
    fromQuery("active-users", () =>
      db.select().from(users).where(eq(users.active, true))
    ),
  )
  .transform(filter("adults", (r) => r.age >= 18))
  .transform(
    map("enrich", (r) => ({
      userId: r.id,
      email: r.email.toLowerCase(),
      segment: r.age >= 65 ? "senior" : "standard",
      processedAt: new Date(),
    })),
  )
  .load(
    toDrizzle("write-analytics", (rows) =>
      db.insert(analytics).values(rows)
    ),
  )
  .run();
```

## Extractors

Pull data from Drizzle queries:

```typescript
import { fromQuery, fromQueryPaginated, fromQueryCursor } from "khotan-data/drizzle";

// One-shot query
const source = fromQuery("users", () =>
  db.select().from(users).where(eq(users.active, true))
);

// Auto-paginated for large tables
const source = fromQueryPaginated("all-orders", {
  pageSize: 5000,
  query: (limit, offset) =>
    db.select().from(orders).limit(limit).offset(offset),
});

// Full control with async generator
const source = fromQueryCursor("stream", async function* () {
  // your custom cursor/streaming logic
});
```

Generic extractors for testing and non-DB sources:

```typescript
import { fromArray, createExtractor } from "khotan-data";

const testSource = fromArray("mock", [{ id: 1 }, { id: 2 }]);
```

## Transforms

Composable, type-safe record transformations:

```typescript
import { map, filter, pick, omit, rename, flatMap, compose } from "khotan-data/transform";

// Map fields
.transform(map("normalize", (r) => ({ ...r, email: r.email.toLowerCase() })))

// Filter records (non-matching records are dropped)
.transform(filter("active-only", (r) => r.active))

// Pick/omit fields
.transform(pick("slim", ["id", "name", "email"]))
.transform(omit("strip-pii", ["ssn", "dob"]))

// Rename fields
.transform(rename("api-names", { firstName: "first_name" }))

// One-to-many expansion
.transform(flatMap("explode-tags", (r) =>
  r.tags.map((tag) => ({ ...r, tag }))
))

// Compose multiple transforms into one step
.transform(compose("pipeline", [filterStep, mapStep, renameStep]))
```

## Loaders

Write data into Drizzle tables:

```typescript
import { toDrizzle, toDrizzleTx } from "khotan-data/drizzle";

// Simple insert (auto-batches to stay under Postgres parameter limits)
const loader = toDrizzle("insert", (rows) =>
  db.insert(analytics).values(rows)
);

// Upsert
const loader = toDrizzle("upsert", (rows) =>
  db
    .insert(analytics)
    .values(rows)
    .onConflictDoUpdate({
      target: analytics.userId,
      set: { segment: sql`excluded.segment`, updatedAt: new Date() },
    })
);

// Transactional — all-or-nothing per batch
const loader = toDrizzleTx("tx-insert", db, (tx, rows) =>
  tx.insert(analytics).values(rows)
);

// Control batching for wide tables
const loader = toDrizzle("wide-table", writeFn, {
  columnsPerRow: 25, // auto-calculates safe batch size
});
```

## Pipeline

The `Pipeline` builder is immutable — each method returns a new instance:

```typescript
const base = Pipeline.create("etl")
  .extract(source)
  .transform(filterStep);

// Branch into different outputs
const toDb = base.load(toDrizzle("db", writeFn)).run();
const toFile = base.load(toFileSink).run();
```

### Options

```typescript
const result = await pipeline.run({
  batchSize: 500,          // records per load batch (default: 1000)
  continueOnError: true,   // collect errors in result.errors instead of throwing
  signal: controller.signal, // AbortSignal for cancellation
});
// result.cancelled is true when stopped via AbortSignal
// With continueOnError: false (default), errors reject the promise
```

### Events

```typescript
pipeline.on((event) => {
  if (event.type === "error") console.error(event.stepName, event.data);
  if (event.type === "pipeline:end") console.log("Done:", event.data);
});
```

## Subpath Imports

```typescript
import { Pipeline } from "khotan-data/pipeline";
import { map, filter } from "khotan-data/transform";
import { fromQuery, toDrizzle } from "khotan-data/drizzle";
```

## Development

```bash
npm install
npm run dev          # watch mode build
npm run test         # run tests
npm run test:watch   # watch mode tests
npm run check        # typecheck + lint + format + test
npm run build        # production build
```

## Contributing

1. Fork the repo and create a branch from `main` (`feat/`, `fix/`, `chore/`, etc.)
2. Make your changes with conventional commit messages (`type: short description`)
3. Run `npx changeset` and describe what changed — pick patch, minor, or major
4. Run `npm run check` to verify typecheck, lint, format, and tests all pass
5. Open a PR against `main`

Every PR that changes user-facing behavior should include a changeset file (the `.changeset/*.md` file created in step 3). Internal-only changes like refactors or test updates can skip this.

## License

MIT
