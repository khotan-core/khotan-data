---
name: khotan-webhook
description: >
  Set up webhook subscriptions and event processing with khotan Wires,
  Catch, and Pass. Use when receiving webhooks from external services,
  registering callback URLs, processing incoming events durably, or
  forwarding events between services.
---

Set up webhook subscriptions and event processing with khotan Wires, Catch, and Pass. Use when receiving webhooks from external services, registering callback URLs, processing incoming events durably, or forwarding events between services.

## Wire (Webhook Subscriptions)

```bash
npx khotan add wire --yes
```

Scaffolds `{outputDir}/wires/wire.ts` (the builder) and `src/components/khotan/wire.tsx` (UI panel).

### Creating a Wire

```typescript
import { wire } from "./wire";

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
    // Verify HMAC using ctx.wireVars.webhookSecret and ctx.body (raw text)
    return isValidSignature(signature, ctx.body, ctx.wireVars.webhookSecret);
  },
});
```

### Hook Contexts

**onSubscribe** receives:
- `ctx.plug` — Plug with vars/auth auto-injected (BoundPlug)
- `ctx.callbackUrl` — The URL to register with the external service
- `ctx.events` — Event types to subscribe to
- `ctx.wireVars` / `ctx.setWireVars()` — Persist wire-specific data (secrets, tokens)
- Must return `{ remoteId: string }`

**onUnsubscribe** receives:
- `ctx.plug` — BoundPlug
- `ctx.remoteId` — The ID returned from onSubscribe
- `ctx.wireVars` / `ctx.setWireVars()`

**onVerify** receives:
- `ctx.headers` — Incoming request headers
- `ctx.body` — Raw request body (for signature verification)
- `ctx.wireVars` — Wire-specific vars
- Must return `boolean`

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
await w.delete(wireId);  // Disconnect
```

### Webhook Callback URL

Wires register callbacks at: `{webhookUrl}/api/khotan/webhook/{plugName}`

For local dev, use ngrok or similar tunnel and set `KHOTAN_WEBHOOK_URL`.

## Catch (Durable Event Processing)

```bash
npx khotan add catch --yes
```

Process webhook events durably via Vercel Workflow:

```typescript
import { catchEvent } from "./webhooks/catch";

const processInvoice = catchEvent(async (ctx) => {
  "use workflow";

  async function persist() {
    "use step";
    // Write to database — retried on failure
    await db.insert(invoices).values(ctx.event);
  }

  await persist();
});
```

Register on the source plug:

```typescript
{ name: "stripe", plug: stripePlug, wires: [stripeWire], catches: [processInvoice] }
```

## Pass (Event Forwarding)

```bash
npx khotan add pass --yes
```

Forward webhook events to another service:

```typescript
import { pass } from "./webhooks/pass";

const forwardToSlack = pass({
  to: "slack",  // Destination plug name (must be registered)
  workflow: async (ctx) => {
    "use workflow";
    // ctx.event — the incoming webhook payload
    // ctx.destVars — destination plug variables
    async function forward() {
      "use step";
      await ctx.destPlug.post("/messages", {
        body: { text: `New event: ${ctx.event.type}` },
      });
    }
    await forward();
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
