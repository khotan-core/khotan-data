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
  encrypts credentials at rest, it does not authenticate requests. Conversely,
  `KHOTAN_SECRET` is **not** an HTTP credential: do not send it as a Bearer
  token. Management routes are gated solely by `authorize` (plus the dev-only
  CLI HMAC token). A rejected request returns `401` with `code:
  authorize_rejected` and a `hint` explaining how to authenticate.
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

## Workflow Runtime & Middleware/Proxy

Inflows, outflows, relays, catch, and pass run on **Vercel Workflow**, which
communicates over `/.well-known/workflow/*`. If your app has a `middleware.ts`
(or `proxy.ts`) whose `matcher` captures these paths, durable runs **silently
fail** — steps never get invoked and runs hang.

`npx khotan init` detects a middleware/proxy file and warns when it may
intercept these paths. Exclude them from the matcher:

```typescript
// middleware.ts
export const config = {
  matcher: ["/((?!_next|.well-known/workflow).*)"],
};
```

If you do auth or rewrites manually (not via `matcher`), short-circuit early:

```typescript
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/.well-known/workflow")) {
    return NextResponse.next();
  }
  // ...your logic
}
```

Vercel Workflow also requires AI Gateway OIDC — run `vercel link` and
`vercel env pull` so `VERCEL_OIDC_TOKEN` is available locally.

## Triggering Flows

Start a flow through khotan (never call the workflow function directly) so run
tracking and Workflow IDs are recorded. The API is `khotanData.flow(name).start()`:

```typescript
import khotanData from "@/lib/khotan/khotan";

await khotanData.flow("products-inflow", { plugName: "shopify" }).start({
  runType: "delta", // or "full"
});
```

`plugName` is only needed to disambiguate when the same flow name is registered
under multiple plugs. There is no `khotanData.api.*` or `flow().run()` surface —
`flow(name).start(options)` is the single entry point for manual and scheduled
runs alike. The cron dispatcher (`/api/khotan/cron`) calls this same path.

### Triggering over HTTP (scripts / external services)

There is **no** `POST /flows/:name/run` route. The HTTP trigger is:

```
POST /api/khotan/flows/{flowId}/runs    body: { "runType": "delta" }
```

This is a **management route**, so it goes through your `authorize` hook. Common
gotcha: `KHOTAN_SECRET` is an encryption key, **not** an HTTP credential — sending
`Authorization: Bearer <KHOTAN_SECRET>` returns `401` with `code: authorize_rejected`.
To trigger from outside the app, authenticate with a credential your `authorize`
hook accepts (a session cookie, or your own token you validate inside `authorize`).

Prefer triggering server-side with `khotanData.flow(name).start()` whenever you
can — it needs no HTTP round-trip or auth.

The `npx khotan flows trigger <name>` CLI works in **dev** without any of this: it
signs a short-lived HMAC token from `KHOTAN_SECRET` (the `KhotanCLI` auth scheme,
disabled when `NODE_ENV=production`). The raw secret never leaves your machine.

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
- **Flow/workflow runs hang or never start**: Check your `middleware.ts`/`proxy.ts` matcher excludes `/.well-known/workflow/*` (see "Workflow Runtime & Middleware/Proxy")
- **Step "is not a function" / fails to resolve at runtime**: Declare `"use step"` functions at module top level and pass `ctx` as an argument — never nest them inside the `"use workflow"` function (closures over workflow scope cannot be hoisted)
