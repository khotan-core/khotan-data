# Example Repo + Sandbox API (planning notes)

Scratchpad for building example/demo projects that show `khotan-data` in action.
Not started yet — capturing decisions so we can pick this up later.

## Goal

Make it trivial to demo `khotan-data` end-to-end without standing up a real
backend: a hardcoded fake API that exercises every auth strategy + pagination
style, plus a set of small Next.js apps that each consume it in a different way.

## Decisions made

- **Mock API location**: bake mock endpoints into the `data.khotan.com` docs
  site (the `ai-native-etl` repo, `~/Projects/ai-native-etl`) so they're
  publicly hosted and demos can hit a real URL.
- **Repo structure**: one new repo with each demo app in its own top-level
  subdirectory (no workspace tooling — each app is independently clone-and-run).
- **Database**: a Neon Postgres branch/database per app (`DATABASE_URL`).
- **Package source**: demos install the published `khotan-data` from npm
  (currently `0.1.1`), mirroring the real user experience.

## Part 1 — Sandbox API in `ai-native-etl` (data.khotan.com)

Hardcoded, deterministic fake API under `src/app/api/sandbox/`. Route handlers
are `export const dynamic = "force-dynamic"` (docs pages stay `force-static`).
Mirror the plain Web `Request`/`Response` style used by the existing
`src/app/api/trpc/[trpc]/route.ts`.

- **Seeded dataset** (`src/lib/sandbox/data.ts`): stable IDs + `updated_at`
  timestamps for ~250 products, ~500 orders, ~100 customers. Deterministic so
  delta syncs and dedupe demos are reproducible.
- **Auth guard** (`src/lib/sandbox/auth.ts`): returns 401 with a JSON error body
  matching the `ErrorSchema` shape plugs expect.
- **Auth prefixes** — one per plug auth strategy in `src/cli/templates/plug.ts`:
  - `/api/sandbox/bearer/*` — `Authorization: Bearer sk_test_khotan`
  - `/api/sandbox/apikey/*` — `x-api-key` header OR `?api_key=` (header + query variants)
  - `/api/sandbox/basic/*` — HTTP Basic
  - `/api/sandbox/oauth/token` + `/api/sandbox/oauth/*` — client-credentials token exchange (`tokenExchange`)
  - `/api/sandbox/webhooks/subscribe` + `/unsubscribe` + `/emit` — register a callback, fire HMAC-signed events
- **Resources** under every auth prefix, each a different pagination style so
  demos can showcase all three:
  - `products` — offset (`?limit=&offset=`) → `offsetPagination`
  - `orders` — cursor (`?cursor=`, returns `next_cursor`) → `cursorPagination`
  - `customers` — keyset (`?since_id=`) → `keysetPagination`
  - all support `?updated_since=` for delta runs
- **Docs**: add a `Sandbox API` page under `src/content/docs/` +
  `src/app/docs/sandbox/` (and an `.md` route) listing base URLs, fake
  credentials, and example curls — match the existing docs pattern in
  `src/app/docs/cli.md/route.ts`.

## Part 2 — New repo: `khotan-examples`

Created at `~/Projects/khotan-examples`, git-initialized. Each app is a
top-level subdirectory with its own `package.json` and `npm i khotan-data`.

- Root `README.md` indexing the apps + one-time setup (create a Neon DB, set
  `DATABASE_URL`, set `KHOTAN_SANDBOX_URL` defaulting to
  `https://data.khotan.com/api/sandbox`, run `npx khotan migrate`).
- Per app: standard `npx khotan init --full` layout, plug `baseUrl` from env
  (sandbox URL), committed `.env.example`.

### The five apps

| Dir | Auth | Pagination | Shows |
|-----|------|-----------|-------|
| `01-basic-inflow` | bearer | offset | single `products` inflow → Postgres + `hub` dashboard (reference template, built first) |
| `02-multi-resource-mappings` | apikey | cursor | `products`/`orders`/`customers` resources with `connectField` mappings + `cache` dedupe |
| `03-relay` | oauth `tokenExchange` | — | `relay` moving records between two plugs |
| `04-webhooks` | — | — | `wire` + `catch` + `pass`; subscribe, verify HMAC, ingest events |
| `05-full-hub` | mixed | mixed | everything: dashboard, mapping browser, scheduled flows via cron dispatcher (`vercel.json`) |

## Suggested sequencing

1. Vertical slice: Sandbox API `products` endpoints + `01-basic-inflow` against a Neon DB to validate the full loop.
2. Add remaining auth prefixes / resources / pagination styles.
3. Replicate the pattern across apps 02–05.

## Notes / assumptions

- Work spans `ai-native-etl` (mock API) and the new `khotan-examples` repo. The
  `khotan-data` package itself is untouched.
- Demos default plug `baseUrl` to the hosted sandbox but can point at
  `localhost:3000` when running the docs site locally.
