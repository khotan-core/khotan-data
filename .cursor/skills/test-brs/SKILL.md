---
name: test-brs
description: Test khotan-data changes in the brs-khotan-connector test app. Use when the user wants to test, verify, or debug khotan-data in the test repo, or mentions brs-khotan-connector.
disable-model-invocation: true
---

# Test in brs-khotan-connector

Test khotan-data changes in the Next.js test app at `/Users/coreyberther/Projects/brs-khotan-connector`.

## Stack

- Next.js 16 (App Router, Turbopack)
- Drizzle + Neon Postgres
- shadcn/ui
- khotan-data installed via packed tgz

## Deploy Changes to Test App

`npm link` and `file:` links do NOT work reliably with Turbopack. Use `npm pack` + tgz install instead:

```bash
cd /Users/coreyberther/Projects/Personal/khotan-data && npm run build && npm pack
cd /Users/coreyberther/Projects/brs-khotan-connector && rm -rf node_modules/khotan-data .next && npm install /Users/coreyberther/Projects/Personal/khotan-data/khotan-data-0.1.0.tgz
```

Then restart: `npm run dev`

This creates a real copy in node_modules — no symlinks, no Turbopack resolution issues. Must redo this every time khotan-data changes.

**Do NOT use:**
- `npm link` — Turbopack can't resolve symlinked package exports
- `npm install ../path` — npm creates a `file:` symlink, same problem
- **Relative paths to tgz** — npm resolves relative paths from the lockfile root, not cwd. Always use the absolute path: `npm install /Users/coreyberther/Projects/Personal/khotan-data/khotan-data-0.1.0.tgz`

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/khotan/khotan.ts` | Plug/resource/sync registrations — **never overwrite** |
| `src/components/khotan/hub.tsx` | Dashboard UI (scaffolded by CLI) |
| `src/app/api/khotan/[...all]/route.ts` | Catch-all API route |
| `src/app/config/page.tsx` | Config page rendering `<KhotanHub />` |
| `src/db/khotan.ts` | Drizzle schema for khotan tables |
| `src/db/index.ts` | DB client + khotan re-export |
| `drizzle.config.ts` | Points to `./src/db/*` (glob) |
| `next.config.ts` | Has `serverExternalPackages: ["khotan-data"]` for symlink compat |

## Current Plugs Registered

- **cin7** — `https://api.cin7.com/api/v1`, apiKey, products-inflow + orders-inflow
- **pollinate** — `https://api.pollinate.tech`, bearer, products-outflow + orders-inflow
- **shopify** — `https://mystore.myshopify.com/admin/api/2024-01`, bearer, products-inflow + orders-inflow

Resources: products (sku), orders (order_number)

## Verify Endpoints

```
curl http://localhost:3001/api/khotan/plugs
curl http://localhost:3001/api/khotan/syncs
curl http://localhost:3001/api/khotan/resources
```

Hub dashboard at `http://localhost:3001/config`

Note: port 3001 if 3000 is in use.

## Testing CLI Commands

Run from `/Users/coreyberther/Projects/brs-khotan-connector`:

- `npx khotan generate` — scaffold schema + wire drizzle config
- `npx khotan migrate` — generate migration + apply (or `--push` for direct push)
- `npx khotan add hub` — scaffold hub (skips config if it exists)
- `npx khotan add hub --force` — overwrite hub UI + route (still skips config)
- `npx khotan add config-page-1` — scaffold /config page

## Gotchas

- `add hub --force` must NOT overwrite `src/lib/khotan/khotan.ts` — that's the user's config with plug registrations
- Factory auto-upserts plugs on first API request — no explicit init needed
- API responses are config-filtered: only plugs/syncs/resources in the config are returned, DB orphans are hidden
- `npm run dev` uses Turbopack by default — `serverExternalPackages` in next.config.ts needed for the file link

## User Perspective Rule

**Always test as a real user would.** Do NOT directly edit files in the test app that are scaffolded or installed by the khotan CLI or package. Instead:

- **Scaffolded files** (e.g. `plug.ts`, `hub.tsx`, schema) — re-scaffold via CLI commands (`npx khotan add plug --force`)
- **User-owned config** (e.g. `khotan.ts`, custom contracts, client files) — can be edited directly, since a real user writes these themselves
- **node_modules** — never edit; redeploy via `npm pack` + install

If a template change in khotan-data adds new functionality (like new getters on Plug), test it by re-scaffolding the component, not by hand-patching the test app's copy.
