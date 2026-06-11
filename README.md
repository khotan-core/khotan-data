# khotan-data

Data primitives for TypeScript — ETL pipelines, transforms, and Drizzle Postgres integration.

Built for **Next.js + Drizzle + Postgres** projects. Think better-auth for data management.

## CLI

Scaffold components into your Next.js + Drizzle project:

```bash
# Initialize khotan config
npx khotan init

# Full setup (drizzle + shadcn + config in one go)
npx khotan init --full

# Add components (reusable building blocks — never create pages)
npx khotan add schema    # Drizzle table definitions (plugs, flows, runs, resources, mappings)
npx khotan add plug      # Fetch wrapper with auth, retry, pagination
npx khotan add inflow    # Workflow-backed flow for pulling data in
npx khotan add outflow   # Workflow-backed flow for pushing data out
npx khotan add relay     # Workflow-backed flow for moving data between plugs
npx khotan add hub       # Dashboard UI + API route + config (requires shadcn)

# Add blocks (sample pages composed from components)
npx khotan add config-page-1   # /config page that renders the KhotanHub dashboard

# Options
npx khotan add schema --force   # Overwrite existing files
npx khotan add hub --yes        # Auto-accept dependency install prompts
```

## Factory (Runtime Engine)

Register plugs, flows, and resources — the factory upserts them on boot and serves a REST API:

```typescript
import { khotan, drizzleAdapter, toNextJsHandler } from "khotan-data/factory";
import { db } from "@/db";
import { shopifyPlug } from "@/lib/khotan/plugs/shopify";
import { shopifyProductsInflow } from "@/lib/khotan/flows/shopify-products";

const khotanData = khotan({
  adapter: drizzleAdapter(db),
  resources: [
    { name: "products", connectField: "sku" },
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
  runType: "delta",
});
```

## Install

```bash
npm install khotan-data
```

Requires `drizzle-orm` as a peer dependency (you almost certainly already have it).

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
await pipeline.run({
  batchSize: 500,          // records per load batch (default: 1000)
  continueOnError: true,   // don't throw on errors, collect them
  signal: controller.signal, // AbortSignal for cancellation
});
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

## License

MIT
