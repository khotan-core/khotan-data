---
name: khotan-plug
description: >
  Create and configure khotan Plugs — HTTP clients for external APIs with
  auth, retry, pagination, and typed endpoints. Use when connecting to a
  new API, defining endpoint contracts, configuring authentication, or
  creating a typed API client.
---

Create and configure khotan Plugs — HTTP clients for external APIs with auth, retry, pagination, and typed endpoints. Use when connecting to a new API, defining endpoint contracts, configuring authentication, or creating a typed API client.

This is Phase 2 of `khotan-build`. Build the plug, then verify its endpoints
with `khotan-probe` before building flows.

## When to use

- Authoring or editing a plug: auth strategy, vars, typed endpoints, hooks.

## Order of operations

1. Confirm scope — which endpoints does the prompt actually need?
2. Create the plug with auth + a **small** set of typed `GET` endpoints.
3. Hand off to `khotan-probe` to verify shapes before anything downstream.

## STOP and ask when

- **Scope is unclear.** Do not guess which endpoints/resources to model — ask.
- **A mutation is involved.** Define `POST`/`PATCH`/`PUT`/`DELETE` endpoints if
  the contract needs them, but do not *fire* them against the live API without
  explicit user consent (see `khotan-probe`).

## Scaffold

```bash
npx khotan add plug --yes
```

Creates `{outputDir}/plugs/plug.ts` (the Plug runtime) and `plug.example.ts` (typed contract example).

## Creating a Plug

```typescript
import { plug, bearer, apiKey, basic, custom } from "./plug";

export const stripePlug = plug({
  name: "stripe",
  baseUrl: "https://api.stripe.com/v1",
  auth: bearer(process.env.STRIPE_KEY!),
  retry: { attempts: 3, backoff: 1000 },
  timeout: 30000,
});
```

## Auth Strategies

| Function | Usage |
|----------|-------|
| `bearer(token)` | `Authorization: Bearer <token>` — static string or async function |
| `basic(user, pass)` | `Authorization: Basic <base64>` |
| `apiKey(name, value)` | Custom header (default) or query param with `{ in: "query" }` |
| `custom(fn)` | Full control: `(headers) => { headers.set(...) }` |
| `tokenExchange(config)` | OAuth-style: exchanges variables for bearer token, caches, auto-refreshes on 401 |

### Token Exchange Example

```typescript
const auth = tokenExchange({
  tokenUrl: "/oauth/token",
  buildBody: (vars) => ({ grant_type: "client_credentials", client_id: vars.clientId, client_secret: vars.clientSecret }),
  parseToken: (res) => ({ token: res.access_token, expiresIn: res.expires_in }),
});
```

## Vars (Runtime Variables)

For variables managed via the Hub UI instead of env vars:

```typescript
export const myPlug = plug({
  baseUrl: "https://api.example.com",
  auth: bearer(() => ""), // overridden by vars
  vars: [
    { key: "apiKey", label: "API Key", type: "text", secret: true },
    { key: "orgId", label: "Org ID", type: "text", defaultValue: "org_demo" },
    { key: "_token", label: "", type: "text", hidden: true },
  ] as const,
});
```

Vars are encrypted in the database via `KHOTAN_SECRET` and injected per-request. Hidden vars (prefixed `_`) are internal storage (cached tokens, etc). `defaultValue` seeds the database the first time the plug is initialized, and later Hub/CLI edits override that stored value.

## Typed Endpoints

Define Zod schemas inline on the plug:

```typescript
import { z } from "zod";

export const myPlug = plug({
  baseUrl: "https://api.example.com",
  auth: bearer(process.env.API_KEY!),
  endpoints: {
    listProducts: {
      method: "GET",
      path: "/products",
      query: z.object({ page: z.number().optional(), limit: z.number().optional() }),
      responses: { 200: z.object({ data: z.array(z.object({ id: z.string(), name: z.string() })), total: z.number() }) },
    },
    createProduct: {
      method: "POST",
      path: "/products",
      body: z.object({ name: z.string(), price: z.number() }),
      responses: { 201: z.object({ id: z.string() }) },
    },
  },
});
```

Endpoints power the plug debugger UI, `khotan plug --compare`, and typed clients.

## Preferred Pattern

Keep each integration in a single app-owned plug file when possible:

```typescript
import { z } from "zod";
import { plug, basic } from "./plug";

const ProductSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
});

export type Product = z.infer<typeof ProductSchema>;

export const myPlug = plug({
  name: "my-service",
  baseUrl: "https://api.example.com",
  auth: basic(process.env.API_USER!, process.env.API_KEY!),
  endpoints: {
    listProducts: {
      method: "GET",
      path: "/products",
      query: z.object({ page: z.number().optional(), limit: z.number().optional() }),
      responses: { 200: z.array(ProductSchema) },
    },
  },
});
```

This keeps the runtime plug, debugger metadata, `khotan plug --compare`, and any exported types in one place.

## Hooks

```typescript
const myPlug = plug({
  // ...
  hooks: {
    beforeRequest: async (ctx) => {
      // ctx.vars, ctx.setVars, ctx.headers, ctx.url
    },
    afterResponse: async (response, ctx) => {
      // inspect/transform response
    },
    onUnauthorized: async (ctx) => {
      // refresh token, update vars
    },
  },
});
```

## Registering in Factory

In `{outputDir}/khotan.ts`:

```typescript
plugs: [
  {
    name: "stripe",
    plug: stripePlug,
    flows: [
      { name: "charges-inflow", type: "inflow", schedule: "0 * * * *", resource: "orders" },
    ],
    // Optional: wires, catches, passes
  },
],
```

## Making Requests

```typescript
// Direct
const products = await myPlug.get("/products", { params: { limit: "10" } });
const created = await myPlug.post("/products", { body: { name: "Widget" } });

// With vars (factory injects these automatically in wire/debug contexts)
const data = await myPlug.get("/items", { vars: { apiKey: "..." } });
```

## Debugging

Use `khotan plug` to test plugs against the running dev server. `khotan probe` remains as a legacy alias:

```bash
npx khotan plug myPlug --info                    # See endpoints
npx khotan plug myPlug GET /products             # Fire request
npx khotan plug myPlug --endpoint listProducts --compare  # Check schema
```

Set `KHOTAN_DEBUG=1` for verbose `[khotan:auth]` and `[khotan:request]` console logs.

### Recommended Plug Workflow

1. Create the plug file and auth/hook setup.
2. Add a small set of typed endpoints directly on the plug (`listProducts`, `getProduct`, etc).
3. Run the app with `KHOTAN_DEBUG=1`.
4. Use `npx khotan plug myPlug --info` to confirm the endpoints are visible to the debugger.
5. Use `npx khotan plug myPlug --endpoint listProducts --compare` against the live API.
6. Tighten schemas until the compare output matches the real payload shape you care about.
7. Only then build inflows, relays, outflows, or webhook handlers on top of those endpoints.

The package does not paginate or delta-sync for you automatically inside user flows. Your app code decides which typed endpoints to call, what page size to use, when to stop, and how to implement full, test, partial, backfill, reconcile, or delta runs.

## Managing Vars

Use the CLI to inspect and update stored plug variables:

```bash
npx khotan plug vars --list
npx khotan plug vars myPlug
npx khotan plug vars myPlug set --json '{"apiKey":"secret","orgId":"org_live"}'
npx khotan plug vars myPlug clear
```

Variable reads mask `secret` fields automatically. Hub and CLI both talk to the same `/api/khotan/variables/*` routes.
