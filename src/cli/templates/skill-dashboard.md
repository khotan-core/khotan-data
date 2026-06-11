---
name: khotan-dashboard
description: >
  Set up khotan dashboard UI — the Hub for managing plugs, flows,
  variables, and webhooks, plus the Plug Debugger for testing API
  requests. Use when adding a management interface, configuring plug
  variables in the browser, or setting up debug pages.
---

Set up khotan dashboard UI — the Hub for managing plugs, flows, variables, and webhooks, plus the Plug Debugger for testing API requests. Use when adding a management interface, configuring plug variables in the browser, or setting up debug pages.

## Hub (Management Dashboard)

```bash
npx khotan add hub --yes
npx khotan add config-page-1 --yes    # Ready-made /config route
```

The Hub scaffolds three components to `src/components/khotan/`:

| File | Purpose |
|------|---------|
| `hub.tsx` | Main `<KhotanHub />` — plug cards, flow table, enable/disable toggles |
| `var-panel.tsx` | Variables panel for configuring plug vars |
| `wire-panel.tsx` | Webhook subscription management (connect/disconnect) |

### Rendering the Hub

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

Or use `npx khotan add config-page-1` to scaffold a `/config` page automatically.

### Hub Features

- Lists all registered plugs with status badges (connected/error/idle)
- Click a plug to see its flows with enable/disable toggles
- VarPanel: configure plug variables (stored encrypted via `KHOTAN_SECRET`)
- WirePanel: manage webhook subscriptions (requires wires configured on plug)
- Debug button on each plug card (visible when `KHOTAN_DEBUG=1`)

### Hub Props

```tsx
<KhotanHub
  webhookUrl="https://your-domain.com"  // Base URL for wire callbacks
/>
```

### API Endpoints Used by Hub

| Endpoint | Purpose |
|----------|---------|
| `GET /api/khotan/plugs` | List plugs with flow counts |
| `GET /api/khotan/flows` | List all flows |
| `PATCH /api/khotan/flows/:id` | Toggle flow enabled/disabled |
| `POST /api/khotan/flows/:id/runs` | Start a tracked flow run |
| `GET /api/khotan/runs/:id` | Get run detail with live Workflow status |
| `GET /api/khotan/runs/:id/stream` | Stream Workflow progress updates |
| `POST /api/khotan/runs/:id/cancel` | Cancel a running Workflow-backed run |
| `POST /api/khotan/runs/:id/retry` | Retry a flow run with the same run type |
| `PATCH /api/khotan/plugs/:id` | Toggle plug enabled/disabled |
| `GET /api/khotan/variables/:plugName` | Get var fields + masked values |
| `POST /api/khotan/variables/:plugName` | Save encrypted variables |
| `DELETE /api/khotan/variables/:plugName` | Clear variables |
| `GET /api/khotan/wires/:plugName` | Get wire status |
| `POST /api/khotan/wires/:plugName` | Create webhook subscription |
| `DELETE /api/khotan/wires/:plugName` | Remove webhook subscription |

From server code, prefer the Khotan-native starter instead of calling `workflow/api.start()` directly:

```typescript
await khotanData.flow("products-inflow", { plugName: "shopify" }).start({
  runType: "delta",
});
```

### Variables In Code And CLI

- Declare optional `defaultValue` on plug var fields to seed initial DB-backed values.
- Use `npx khotan plug vars <plugName>` to inspect masked values from the terminal.
- Use `npx khotan plug vars <plugName> set --json '{...}'` to update variables without opening the Hub.
- Use `npx khotan plug vars <plugName> clear` to remove all stored overrides for a plug.

## Plug Debugger (Dev Testing UI)

```bash
npx khotan add plug-debugger --yes
npx khotan add debug-page-1 --yes    # Routes at /debug and /debug/[plugName]
```

Requires `KHOTAN_DEBUG=1` in your environment.

### Features

- Postman-like interface for testing plug requests
- Typed endpoint sidebar showing Zod schemas
- Path parameter interpolation
- Response validation (green/amber/red diff)
- Request history
- Auto-format JSON bodies
- Keyboard shortcut: Cmd+Enter to send

### Debug Routes

| Route | Purpose |
|-------|---------|
| `/debug` | Index page listing all plugs |
| `/debug/[plugName]` | Per-plug debugger |

### Debug API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/khotan/debug` | Check if debug mode is active |
| `GET /api/khotan/debug/:plugName` | Plug metadata + endpoint schemas |
| `POST /api/khotan/debug/:plugName` | Fire request through the real plug code path |

## shadcn Dependencies

Both components require shadcn/ui. The CLI will offer to install missing components:

- **Hub**: card, badge, table, switch, button, input, label
- **Plug Debugger**: card, badge, button, input, label

Run `npx shadcn@latest init --defaults --yes` first if shadcn is not set up.

## Skip UI

Use `--without-ui` to scaffold only the backend code without React components:

```bash
npx khotan add hub --without-ui
npx khotan add wire --without-ui
```
