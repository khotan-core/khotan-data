---
name: khotan-flow
description: >
  Build and run khotan Flows — durable inflows (pull data in), outflows (push
  data out), and relays (move data plug-to-plug) on Vercel Workflow. Use when
  the user wants to sync, pull, push, schedule, or migrate data between their
  app and an external service, or trigger a flow run from the CLI.
---

Build and run khotan Flows: durable data movement on Vercel Workflow. This is
Phase 5 of `khotan-build` (the pull/push/sync path; for event-driven webhooks
use `khotan-webhook`).

## When to use

- Pulling data from a service into your app (inflow).
- Pushing app data out to a service (outflow).
- Moving data directly between two services (relay).
- Scheduling or manually triggering any of the above.

## Order of operations

1. **Only build flows after the plug's endpoints are verified** with
   `khotan-probe`. Flows should sit on shapes you have confirmed.
2. Pick the flow type, scaffold it, author the workflow.
3. Register it on the plug in `{outputDir}/khotan.ts`.
4. Trigger once via CLI and confirm the run.

## STOP and ask when

- **Which flows are wanted.** Don't assume — ask the user which syncs they want
  unless they already told you.
- **Pagination depth.** Default to **one page** so the loop is fast, and tell
  the user explicitly: "this pulls a single page; full pagination needs X."

## Flow types

| Type | Direction | Scaffold |
|---|---|---|
| `inflow` | service → your app/DB | `npx khotan add inflow --yes` |
| `outflow` | your app/DB → service | `npx khotan add outflow --yes` |
| `relay` | service → service | `npx khotan add relay --yes` |

All three require `plug` + `schema` and the `workflow` package, and integrate
with Vercel Workflow.

## Authoring pattern (MUST)

Declare `"use step"` functions at **module top level** and pass only the
serializable `ctx` as an argument. The `"use workflow"` function does
orchestration only. **Never nest a step inside the workflow function** — the
Workflow compiler cannot hoist closures that capture workflow scope, and they
fail at runtime.

```typescript
import { inflow, type InflowContext } from "./inflow";
import { sendUpdate } from "khotan-data/factory";

// Step: top level, full Node.js access, retried independently.
async function extractAndLoad(ctx: InflowContext) {
  "use step";
  await sendUpdate({ message: "Starting product inflow", progress: 10 });

  // Quick-fire: ONE page by default. Disclose this to the user.
  const res = await fetch("https://api.example.com/products?page=1", {
    headers: { Authorization: `Bearer ${ctx.vars["apiToken"] ?? ""}` },
  });
  const payload = (await res.json()) as { data?: Array<Record<string, unknown>> };
  const records = payload.data ?? [];

  // Replace with your app-specific transform + DB upsert.
  return { extracted: records.length, transformed: records.length, created: records.length };
}

// Workflow: orchestration only.
async function productsWorkflow(ctx: InflowContext) {
  "use workflow";
  return extractAndLoad(ctx);
}

export const productsInflow = inflow({
  name: "products-inflow",
  resource: "products",
  schedule: "0 * * * *",
  workflow: productsWorkflow,
});
```

Outflows query your DB and push out; relays read a source plug and write a
destination plug. The step/workflow rules are identical for all three.

## Registering

In `{outputDir}/khotan.ts`, register flows under their source plug:

```typescript
import { productsInflow } from "./flows/products-inflow";

plugs: [
  {
    name: "shopify",
    plug: shopifyPlug,
    flows: [productsInflow],
  },
],
```

## Triggering

Always start a flow through khotan so run tracking and Workflow IDs are
recorded. Never call the workflow function directly.

```typescript
import khotanData from "@/lib/khotan/khotan";

await khotanData.flow("products-inflow", { plugName: "shopify" }).start({
  runType: "delta", // full | delta | backfill | reconcile | dry-run
});
```

`plugName` only disambiguates when the same flow name is registered under
multiple plugs. `flow(name).start(options)` is the single entry point for manual
and scheduled runs alike.

### From the CLI (dev)

```bash
npx khotan flows list
npx khotan flows trigger <flowName> --run-type full
npx khotan flows runs <flowName>
npx khotan flows cancel <runId>
```

The CLI signs a short-lived HMAC token from `KHOTAN_SECRET` (the `KhotanCLI`
auth scheme, disabled when `NODE_ENV=production`). The raw secret never leaves
your machine.

### Over HTTP (scripts / external services)

There is **no** `POST /flows/:name/run` route. The HTTP trigger is:

```
POST /api/khotan/flows/{flowId}/runs    body: { "runType": "delta" }
```

This is a **management route**, so it goes through your `authorize` hook.
Gotcha: `KHOTAN_SECRET` is an encryption key, **not** an HTTP credential —
sending `Authorization: Bearer <KHOTAN_SECRET>` returns `401` with
`code: authorize_rejected`. Authenticate with a credential your `authorize` hook
accepts (a session cookie, or your own token you validate inside `authorize`).
Prefer server-side `khotanData.flow(name).start()` whenever you can.

## Run types

`full` (everything), `delta` (changes since last run), `backfill` (historical
catch-up), `reconcile` (verify/repair), `dry-run` (no writes).

## Scheduling on Vercel

Flow `schedule` values are runtime source-of-truth metadata. On Vercel, prefer a
single dispatcher cron instead of one platform cron per flow.

```json
// vercel.json
{ "crons": [{ "path": "/api/khotan/cron", "schedule": "* * * * *" }] }
```

Then set `schedule` only on each flow. The dispatcher evaluates which flows are
due on each tick and starts them through the normal run-tracking path. If
`CRON_SECRET` is set, Vercel calls the route with
`Authorization: Bearer <CRON_SECRET>`.

## Related

- Reuse expensive upstream snapshots between runs → `khotan-cache`.
- Match/dedupe records across services by canonical key → `khotan-mappings`.
