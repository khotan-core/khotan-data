---
name: khotan-webhook
description: >
  Set up webhook subscriptions and event processing with khotan Wires,
  Catch, and Pass. Use when receiving webhooks from external services,
  registering callback URLs, processing incoming events durably, or
  forwarding events between services.
---

Set up webhook subscriptions and event processing with khotan Wires, Catch, and Pass. Use when receiving webhooks from external services, registering callback URLs, processing incoming events durably, or forwarding events between services.

This is the event-driven half of Phase 5 of `khotan-build` (for pull/push/sync
on a schedule, use `khotan-flow` instead).

## When to use

- A service should call *you* on events (Wire registers the subscription).
- You need to durably process incoming events (Catch) or forward them to another
  service (Pass).

## Order of operations

1. Verify the source plug's endpoints first (`khotan-probe`).
2. Build the Wire, then Catch/Pass handlers as requested.
3. Register on the source plug, then test the receive path.

## STOP and ask when

- **Which events/handlers are wanted.** Ask before building — don't subscribe to
  events the user didn't request.
- **Creating a remote subscription.** `onSubscribe` issues a live `POST` to the
  service; treat it like any mutation and get consent before running it.

## Workflow step rule

Catch and Pass run on Vercel Workflow. The `"use step"` (top level) /
`"use workflow"` (orchestration only) rule is identical to flows — see
`khotan-flow` for the full explanation. Never nest steps inside the workflow
function.

## Wire (Webhook Subscriptions)

```bash
npx khotan-data add wire --yes
```

Scaffolds `{outputDir}/wires/wire.ts` (the builder) and `src/components/khotan/wire.tsx` (UI panel).

### Creating a Wire

```typescript
import { verifyHmacSha256, wire } from "./wire";

export const stripeWire = wire({
  events: ["invoice.paid", "charge.succeeded"],

  async onSubscribe(ctx) {
    const res = await ctx.plug.post<{ id: string; secret: string }>(
      "/webhook_endpoints",
      {
        body: {
          url: ctx.callbackUrl,
          enabled_events: ctx.events,
        },
      },
    );
    await ctx.setWireVars({ webhookSecret: res.secret });
    return { remoteId: res.id };
  },

  async onUnsubscribe(ctx) {
    await ctx.plug.delete(`/webhook_endpoints/${ctx.remoteId}`);
  },

  async onVerify(ctx) {
    const signature = ctx.headers["stripe-signature"];
    return verifyHmacSha256(ctx.body, signature, ctx.wireVars.webhookSecret, {
      digest: "hex",
      prefix: "sha256=",
    });
  },
});
```

Providers that cannot be registered by API can declare manual mode:

```typescript
export const cin7Wire = wire({
  mode: "manual",
  events: ["order.created"],
  async onVerify(ctx) {
    return verifyHmacSha256(ctx.body, ctx.headers["x-cin7-signature"], ctx.wireVars.secret, {
      digest: "hex",
      prefix: "sha256=",
    });
  },
});
```

### Hook Contexts

**onSubscribe** receives:
- `ctx.plug` — Plug with vars/auth auto-injected (BoundPlug)
- `ctx.callbackUrl` — The URL to register with the external service
- `ctx.events` — Event types to subscribe to
- `ctx.wireVars` / `ctx.setWireVars()` — Persist wire-specific data (secrets, tokens)
- Must return `{ remoteId: string, expiresAt?: string | Date }`

**onUnsubscribe** receives:
- `ctx.plug` — BoundPlug
- `ctx.remoteId` — The ID returned from onSubscribe
- `ctx.wireVars` / `ctx.setWireVars()`

**onVerify** receives:
- `ctx.headers` — Incoming request headers
- `ctx.body` — Raw request body (for signature verification)
- `ctx.wireVars` — Wire-specific vars
- Must return `boolean`

**onRenew** is optional and receives the subscribe context plus:
- `ctx.remoteId` — Current provider subscription ID
- `ctx.expiresAt` — Last expiry returned by subscribe or renew, if any
- Return `{ remoteId?: string, expiresAt?: string | Date }`

Khotan exposes renewal through `khotanData.wire("plug").renew()` and
`POST /api/khotan/wires/:plugName/renew`. Automatic background renewal is not
scheduled by the current toolkit; run renewal from your app scheduler or cron.

### Registering Wires

In `{outputDir}/khotan.ts`:

```typescript
import { stripeWire } from "./wires/stripe-wire";

plugs: [
  {
    name: "stripe",
    plug: stripePlug,
    wires: [stripeWire],
  },
],
```

### Programmatic Wire API

```typescript
const w = khotanData.wire("stripe");
await w.create("https://your-domain.com/api/khotan/webhook/stripe");
await w.get();           // Get wire status
await w.renew(wireId);   // Renew expiring provider subscriptions
await w.delete(wireId);  // Disconnect
```

### Webhook Callback URL

Wires register callbacks at: `{webhookUrl}/api/khotan/webhook/{plugName}`

For local dev, use ngrok or similar tunnel and set `KHOTAN_WEBHOOK_URL`.

## Catch (Durable Event Processing)

```bash
npx khotan-data add catch --yes
```

Process webhook events durably via Vercel Workflow:

Declare `"use step"` functions at module top level and pass `ctx` (serializable
data) as an argument. Nesting steps inside the `"use workflow"` function fails at
runtime — closures over workflow scope cannot be hoisted.

```typescript
import { z } from "zod";
import { catchEvent, type CatchContext } from "./webhooks/catch";
import { db } from "@/db";
import { invoices } from "@/db/schema";

const invoiceEventSchema = z.object({
  type: z.literal("invoice.paid"),
  data: z.object({ invoiceId: z.string() }),
});

// Step: top-level, full Node.js access, retried on failure.
async function persistInvoice(ctx: CatchContext<z.infer<typeof invoiceEventSchema>>) {
  "use step";
  await db.insert(invoices).values({ externalId: ctx.event.data.invoiceId });
}

const processInvoice = catchEvent({
  name: "stripe-invoices",
  events: ["invoice.paid"],
  schema: invoiceEventSchema,
  workflow: async (ctx) => {
    "use workflow";
    await persistInvoice(ctx);
  },
});
```

Register on the source plug:

```typescript
{ name: "stripe", plug: stripePlug, wires: [stripeWire], catches: [processInvoice] }
```

## Pass (Event Forwarding)

```bash
npx khotan-data add pass --yes
```

Forward webhook events to another service:

The context exposes `ctx.event`, `ctx.eventType`, and `ctx.destVars` (the
decrypted credentials for the destination plug). There is no `ctx.destPlug` —
construct the destination plug from `destVars` inside a top-level step.

```typescript
import { pass, type PassContext } from "./webhooks/pass";
import { plug } from "@/lib/khotan/plugs/plug";

// Step: top-level. Build the destination plug from ctx.destVars.
async function forwardToSlackStep(ctx: PassContext) {
  "use step";
  const slack = plug({
    name: "slack",
    baseUrl: "https://slack.com/api",
    authType: "bearer",
    auth: { bearer: { token: ctx.destVars["botToken"] ?? "" } },
  });
  await slack.post("/chat.postMessage", {
    body: { channel: ctx.destVars["channelId"], text: `New event: ${ctx.eventType}` },
  });
}

const forwardToSlack = pass({
  name: "stripe-to-slack",
  to: "slack", // Destination plug name (must be registered)
  events: ["invoice.paid"],
  workflow: async (ctx) => {
    "use workflow";
    await forwardToSlackStep(ctx);
  },
});
```

Register on the source plug:

```typescript
{ name: "stripe", plug: stripePlug, wires: [stripeWire], passes: [forwardToSlack] }
```

## Webhook Flow

```
External Service → POST /api/khotan/webhook/:plugName
  → onVerify (signature check)
  → Parse event type
  → Start catch workflows (durable processing)
  → Start pass workflows (event forwarding)
  → Return { received: true }
```

## Dependencies

- **Wire**: Requires `plug` and `schema` components
- **Catch**: Requires `wire`; needs `workflow` package for Vercel Workflow
- **Pass**: Requires `wire` and `plug`; needs `workflow` package

## Hub Integration

The WirePanel in the Hub UI lets users connect/disconnect webhooks from the browser. It calls `POST /api/khotan/wires/:plugName` with the callback URL.

## Debugging Webhooks

1. Check wire status: `GET /api/khotan/wires/:plugName`
2. Verify `onVerify` logic: check wire vars contain the signing secret
3. Check factory logs: `KHOTAN_DEBUG=1` enables `[khotan:wire]` log lines
4. 401 on webhook receive = `onVerify` returning false
5. 500 on webhook = missing `workflow` package or catch/pass misconfigured
