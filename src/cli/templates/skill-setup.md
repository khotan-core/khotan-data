---
name: khotan-setup
description: >
  Set up khotan-data in a Next.js + Drizzle + Postgres project. Use when
  initializing khotan in a new project, adding the database schema,
  configuring the factory, or troubleshooting missing setup steps.
---

Set up khotan-data in a Next.js + Drizzle + Postgres project. Use when initializing khotan in a new project, adding the database schema, configuring the factory, or troubleshooting missing setup steps.

## Quick Start

```bash
npm install khotan-data
npx khotan init
npx khotan add schema --yes
npx khotan migrate
npx khotan add plug --yes
```

## What Init Creates

`npx khotan init` scaffolds three files (never overwrites existing):

| File | Purpose |
|------|---------|
| `khotan.config.ts` | CLI config — sets `outputDir` (default: `src/khotan` or `khotan`) |
| `{outputDir}/khotan.ts` | Factory config — register plugs, resources, adapter |
| `src/app/api/khotan/[...all]/route.ts` | Catch-all API route |

Use `npx khotan init --full` for greenfield projects — also installs drizzle-orm, postgres, drizzle-kit, and shadcn.

## Factory Config Pattern

Edit `{outputDir}/khotan.ts` after init:

```typescript
import { khotan, drizzleAdapter } from "khotan-data/factory";
import { db } from "@/db";
import { stripeChargesInflow } from "./flows/stripe-charges";

const khotanData = khotan({
  adapter: drizzleAdapter(db),
  resources: [
    { name: "products", connectField: "sku" },
    { name: "orders", connectField: "order_number" },
  ],
  plugs: [
    {
      name: "stripe",
      plug: stripePlug,
      flows: [
        stripeChargesInflow,
      ],
    },
  ],
});

export default khotanData;
```

The factory auto-upserts plugs, flows, and resources to the database on first API request.

## Route Handler

The catch-all route delegates all HTTP methods to the factory:

```typescript
import { toNextJsHandler } from "khotan-data/factory";
import khotanData from "@/lib/khotan/khotan";

export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(khotanData.handler);
```

## Database Setup

```bash
npx khotan add schema --yes   # Scaffolds Drizzle table definitions
npx khotan migrate             # Generates + applies migrations (needs DATABASE_URL)
npx khotan migrate --push      # Or push directly without migration files
```

Tables created: `khotan_plugs`, `khotan_resources`, `khotan_flows`, `khotan_wires`, `khotan_runs`, `khotan_mappings`.

The schema command auto-detects your Drizzle schema directory, updates `drizzle.config.ts` glob pattern, and adds the barrel re-export.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Postgres connection (used by Drizzle) |
| `KHOTAN_SECRET` | For variables | AES-256-GCM key for encrypting plug vars |
| `KHOTAN_DEBUG` | For debugging | Enables `/debug/*` routes and the `plug` CLI (`probe` alias) |
| `KHOTAN_WEBHOOK_URL` | For webhooks | Public URL for wire callbacks |

## Next.js Config

Add to `next.config.ts` if using local/tarball install:

```typescript
const nextConfig = {
  serverExternalPackages: ["khotan-data"],
};
```

## Verify Setup

```bash
curl http://localhost:3000/api/khotan/plugs     # Should list registered plugs
curl http://localhost:3000/api/khotan/flows      # Should list flows
curl http://localhost:3000/api/khotan/resources   # Should list resources
```

## Troubleshooting

- **Empty plug list**: Factory upserts on first request — hit any endpoint first, then check `/plugs`
- **"Cannot find module khotan-data"**: Add to `serverExternalPackages` in next.config.ts
- **Migration fails**: Ensure `DATABASE_URL` is set and Postgres is reachable
- **Init won't overwrite**: By design — delete the file manually if you need to re-scaffold
