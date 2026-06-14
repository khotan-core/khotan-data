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
    { name: "products", mapping: { connectField: "sku" } },
    { name: "orders", mapping: { connectField: "order_number" } },
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
| `KHOTAN_DEBUG` | For debugging | Enables `/debug/*` routes and the `plug` CLI (`probe` alias). Automatically disabled when `NODE_ENV=production` |
| `KHOTAN_WEBHOOK_URL` | For webhooks | Public URL for wire callbacks |
| `CRON_SECRET` | For production cron | Protects the built-in `/api/khotan/cron` dispatcher route. The route fails closed in production when this is unset |

## Securing the Management API

The management API (`/api/khotan/*`) and the Hub dashboard expose plug
credentials and operational controls. **They are public unless you gate them.**

Pass an `authorize` hook to `khotan({ ... })`. It receives the raw `Request` and
returns `true` to allow the request or `false` to reject it with `401`. It
composes directly with session libraries like better-auth:

```typescript
import { khotan, drizzleAdapter } from "khotan-data/factory";
import { auth } from "@/lib/auth";
import { db } from "@/db";

const khotanData = khotan({
  adapter: drizzleAdapter(db),
  authorize: async (request) => {
    const session = await auth.api.getSession({ headers: request.headers });
    return Boolean(session?.user); // or: session?.user?.role === "admin"
  },
  plugs: [/* ... */],
});
```

Notes:
- `authorize` is **not** a replacement for `KHOTAN_SECRET` — that key only
  encrypts credentials at rest, it does not authenticate requests.
- Inbound webhooks (`POST /webhook/:plug`, verified per-plug via `onVerify`),
  the cron dispatcher (`CRON_SECRET`), and debug routes (`KHOTAN_DEBUG`,
  non-production only) are exempt from `authorize` automatically.
- Also protect the Hub dashboard page (e.g. `/config`) with your app's
  middleware — `authorize` only guards the API, not your React pages.
- Without `authorize`, khotan logs a startup warning. Always configure it
  before deploying.

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

## Scheduled Flows On Vercel

Khotan flow `schedule` values are runtime source-of-truth metadata. On Vercel, prefer a single dispatcher CRON instead of defining one platform CRON per flow.

Add one entry to `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/khotan/cron", "schedule": "* * * * *" }
  ]
}
```

Then define schedules only on your flows in `{outputDir}/khotan.ts`:

```typescript
{
  name: "products-inflow",
  type: "inflow",
  schedule: "0 * * * *",
  resource: "products",
}
```

The dispatcher route evaluates which flows are due on each tick and starts them through the normal run-tracking path. If `CRON_SECRET` is set, Vercel should call the route with `Authorization: Bearer <CRON_SECRET>`.

## Typical Build Order

After init and schema setup, the usual path to a working sync is:

1. Add or author a plug file for the external service.
2. Define a few typed endpoints directly on the plug with Zod response schemas.
3. Start the app with `KHOTAN_DEBUG=1`.
4. Verify the plug is visible with `npx khotan plug --list` and `npx khotan plug myPlug --info`.
5. Hit live endpoints with `npx khotan plug myPlug --endpoint listProducts --compare` until the schemas match the real API shape you intend to use.
6. Register the plug in `{outputDir}/khotan.ts` with resources and flows.
7. Only after endpoint verification, build inflows, relays, outflows, or webhook handlers on top of those live-checked endpoints.

This keeps sync logic grounded in real API payloads before you write pagination, mapping, or transformation code.

## Troubleshooting

- **Empty plug list**: Factory upserts on first request — hit any endpoint first, then check `/plugs`
- **"Cannot find module khotan-data"**: Add to `serverExternalPackages` in next.config.ts
- **Migration fails**: Ensure `DATABASE_URL` is set and Postgres is reachable
- **Init won't overwrite**: By design — delete the file manually if you need to re-scaffold
