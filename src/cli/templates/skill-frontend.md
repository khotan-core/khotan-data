---
name: khotan-frontend
description: >
  Suggest and (only on confirmation) scaffold khotan frontend — drop-in React
  components (Hub, plug debugger, logs, mappings browser) and ready-made page
  blocks with fixed routes. Use when the user wants a browser UI to manage,
  debug, or observe khotan. This skill suggests options and waits for the user;
  it never injects UI or adds routes on its own.
---

Suggest khotan frontend and scaffold only what the user picks. This is Phase 6
of `khotan-build`. Treat it as a **catalog you present**, not an install script.

## Hard rules (MUST)

1. **Never scaffold UI or add a route without explicit user confirmation** of
   *what* component/page and *where* it goes.
2. **Never invent routes or paths.** The page blocks have fixed, known routes
   (`/config`, `/debug`, `/logs`, `/mappings`, `/graph`). Offer those; do not
   improvise new ones.
3. **Prefer components over blocks** (components are drop-in and the user mounts
   them; blocks create routes) unless the user explicitly wants a ready-made
   page.
4. **Announce before acting** — state the install command, the files it creates,
   and any route it exposes, then wait for confirmation.

## Decision gate (ask first)

- Do you want any frontend at all?
- Drop-in **components** you place yourself, or ready-made **pages** (blocks)?
- Which surfaces: management (Hub), debug, logs, mappings, topology graph?

## Catalog — Components (no routes; you mount them)

| Component | Add command | Renders |
|---|---|---|
| `hub` | `npx khotan-data add hub --yes` | `<KhotanHub />` — plug cards, flow table, enable/disable, per-flow "Run now", VarPanel, WirePanel |
| `plug-debugger` | `npx khotan-data add plug-debugger --yes` | Postman-like tester for plug requests (needs `KHOTAN_DEBUG=1`) |
| `logs` | `npx khotan-data add logs --yes` | Runs + webhook-event tables |
| `mapping-browser` | `npx khotan-data add mapping-browser --yes` | Searchable mappings list/create/edit/delete |

Mounting a component (you choose the location):

```tsx
import { KhotanHub } from "@/components/khotan/hub";

export default function ConfigPage() {
  return (
    <main className="container mx-auto max-w-5xl px-4 py-10">
      <KhotanHub />
    </main>
  );
}
```

### Hub props

`<KhotanHub />` is zero-config. Optional props:

| Prop | Purpose |
|---|---|
| `webhookUrl` | Base URL for wire (webhook) callbacks. WirePanel uses it to build the subscription callback URL, e.g. `<KhotanHub webhookUrl="https://your-domain.com" />`. Defaults to the current origin. |

## Catalog — Blocks (create routes; confirm before adding)

| Block | Add command | Fixed route | Requires |
|---|---|---|---|
| `config-page-1` | `npx khotan-data add config-page-1 --yes` | `/config` | `hub` |
| `debug-page-1` | `npx khotan-data add debug-page-1 --yes` | `/debug`, `/debug/[plugName]` | `plug-debugger`, `KHOTAN_DEBUG=1` |
| `logs-page-1` | `npx khotan-data add logs-page-1 --yes` | `/logs` | `logs` |
| `mappings-page-1` | `npx khotan-data add mappings-page-1 --yes` | `/mappings` | `mapping-browser` |
| `graph` | `npx khotan-data add graph --yes` | `/graph` | `@xyflow/react` |

## shadcn prerequisites

Components require shadcn/ui. The CLI offers to install missing primitives; run
`npx shadcn@latest init --defaults --yes` first if shadcn isn't set up. Use
`--without-ui` to scaffold only backend code without React components.

## Securing pages

`authorize` only guards the API, **not** your React pages. Protect management
pages (e.g. `/config`) with your app's own middleware. See `khotan-setup` →
"Securing the Management API".

## Hub API surface (reference)

The Hub talks to these routes:

| Endpoint | Purpose |
|---|---|
| `GET /api/khotan/plugs` | List plugs with flow counts |
| `GET /api/khotan/flows` | List flows |
| `PATCH /api/khotan/flows/:id` | Toggle flow enabled |
| `POST /api/khotan/flows/:id/runs` | Start a tracked run (uses browser session → passes `authorize`) |
| `GET /api/khotan/runs/:id` | Run detail with live Workflow status |
| `GET /api/khotan/runs/:id/stream` | Stream Workflow progress |
| `POST /api/khotan/runs/:id/cancel` | Cancel a run |
| `POST /api/khotan/runs/:id/retry` | Retry a run |
| `PATCH /api/khotan/plugs/:id` | Toggle plug enabled |
| `GET /api/khotan/variables/:plugName` | Var fields + masked values |
| `POST /api/khotan/variables/:plugName` | Save encrypted variables |
| `DELETE /api/khotan/variables/:plugName` | Clear variables |
| `GET /api/khotan/wires/:plugName` | Wire status |
| `POST /api/khotan/wires/:plugName` | Create subscription |
| `DELETE /api/khotan/wires/:plugName` | Remove subscription |

## Plug Debugger API surface (reference)

The plug debugger (and the `/debug` page blocks) talk to these routes. Requires
`KHOTAN_DEBUG=1` (force-disabled when `NODE_ENV=production`):

| Endpoint | Purpose |
|---|---|
| `GET /api/khotan/debug` | Check if debug mode is active |
| `GET /api/khotan/debug/:plugName` | Plug metadata + endpoint schemas |
| `POST /api/khotan/debug/:plugName` | Fire request through the real plug code path |
