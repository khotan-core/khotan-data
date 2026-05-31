## Context

khotan/data has a working CLI (`npx khotan init`, `npx khotan add plug`, `npx khotan add schema`) and two scaffoldable components: the Plug (fetch wrapper) and the Schema (Drizzle table definitions for `khotan_plugs`, `khotan_syncs`, `khotan_runs`). The schema tables exist but nothing populates them, no API exposes them, and no UI reads from them.

The target stack is Next.js App Router + Drizzle ORM + Postgres. The project follows two DX models: shadcn (scaffolded, user-owned code) for components and better-auth (factory function + catch-all route) for the runtime core.

A secondary pain point: `npx khotan add schema` currently drops `schema.ts` into the generic `<outputDir>` (e.g. `lib/khotan/`), but Drizzle schemas belong in the Drizzle schema directory (e.g. `db/schema/`). This needs to be fixed.

## Goals / Non-Goals

**Goals:**
- `khotan()` factory function in the npm package that registers plugs/syncs into the database via upsert
- `drizzleAdapter(db)` wrapper that the factory uses to interact with the database
- `toNextJsHandler(handler)` that converts the factory's handler into Next.js route exports
- Scaffoldable Hub component (`npx khotan add hub`) — React UI using shadcn components showing plugs and syncs
- Scaffoldable API route and config file as part of `add hub`
- Fix `add schema` to detect the user's Drizzle schema directory

**Non-Goals:**
- No sync execution engine — the factory registers config, it doesn't run flows yet
- No credential encryption — the `encrypted_credentials` column stays nullable/unused
- No real-time updates or websockets in the Hub
- No shadcn CLI integration — we scaffold our own components using shadcn primitives (user must have shadcn installed)
- No multi-framework support — Next.js App Router only for v0

## Decisions

### 1. Factory lives in the npm package, not scaffolded

**Decision:** `khotan()`, `drizzleAdapter()`, and `toNextJsHandler()` are exported from `khotan-data/factory`. They are NOT scaffolded into the user's project.

**Rationale:** These are runtime functions that should stay in sync with the package version. Unlike Plug and Schema (which users edit), the factory is a thin runtime layer that users configure but don't modify. This mirrors how better-auth works — `auth()` is imported from the package, not scaffolded.

**Alternative considered:** Scaffolding the factory. Rejected because it would make upgrades painful and the factory needs to know about the schema structure intimately.

### 2. Upsert on handler initialization, not a separate migration step

**Decision:** When `khotan()` is called, it performs `INSERT ... ON CONFLICT DO UPDATE` for each registered plug and sync. This happens lazily on the first API request (or eagerly on server start if the user calls an init method).

**Rationale:** Avoids adding a `khotan:migrate` CLI step. The user already runs `drizzle-kit push` to create the tables; the factory just populates rows. Upsert is idempotent — safe to run on every server restart. Matches better-auth's approach where `auth()` handles its own data.

**Alternative considered:** Separate `npx khotan migrate` command. Rejected because it adds friction and the upsert is simple enough to do at runtime.

### 3. Catch-all API route pattern (better-auth style)

**Decision:** A single catch-all route at `app/api/khotan/[...all]/route.ts` handles all API requests. The route file imports the user's khotan config and calls `toNextJsHandler()`.

**Rationale:** One route file, one import. The factory's handler does internal routing based on the path segments. This is identical to better-auth's `app/api/auth/[...all]/route.ts` pattern that the user is already familiar with.

**API structure:**
- `GET /api/khotan/plugs` — list all plugs
- `GET /api/khotan/plugs/:id` — get a single plug with its syncs
- `GET /api/khotan/syncs` — list all syncs
- `GET /api/khotan/syncs/:id/runs` — list runs for a sync
- `POST /api/khotan/syncs/:id/trigger` — manually trigger a sync (future)

### 4. Hub is a single scaffolded React component using shadcn primitives

**Decision:** `npx khotan add hub` scaffolds `components/khotan/hub.tsx` — a client component that fetches from `/api/khotan` and renders using shadcn's Card, Badge, Table, and Switch components.

**Rationale:** Following the shadcn model — the user owns the UI and can restyle it. Using shadcn primitives means it inherits the user's theme. The component is self-contained: one file, fetches its own data, no provider wrapping needed.

**Alternative considered:** Server component with client islands. Rejected for v0 simplicity — a single client component that fetches via the API route is easier to scaffold and reason about. Server component optimization can come later.

### 5. `add hub` scaffolds three files

**Decision:** The `hub` component in the registry scaffolds multiple files:
1. `components/khotan/hub.tsx` — the React dashboard component
2. `app/api/khotan/[...all]/route.ts` — the catch-all API route
3. `<outputDir>/khotan.ts` — the config file where the user registers their plugs

**Rationale:** All three files are needed for the Hub to work. Scaffolding them together ensures the user gets a working setup in one command. The config file goes in `outputDir` (alongside plug.ts), the route goes in the App Router directory, and the component goes in the components directory.

### 6. Schema output path detection

**Decision:** `npx khotan add schema` reads `drizzle.config.ts` to find the schema directory. If the config has `schema: "./src/db/schema/*"` or `schema: "./db/schema.ts"`, the CLI extracts the directory and places `schema.ts` there. If detection fails, it prompts the user for the path (defaulting to the standard `outputDir`).

**Rationale:** The schema file is consumed by Drizzle, not by application code, so it should live where Drizzle expects it. Reading `drizzle.config.ts` is a reliable heuristic since every Drizzle user has one. Falling back to a prompt ensures it works even with unconventional setups.

**Alternative considered:** Always prompt for the path. Rejected because auto-detection covers 90% of cases and reduces friction.

### 7. API URL is hardcoded to `/api/khotan`

**Decision:** The Hub component fetches from `/api/khotan/*` (hardcoded). The catch-all route is scaffolded at `app/api/khotan/[...all]/route.ts`.

**Rationale:** Keeps v0 simple. The user can change both the route location and the Hub's fetch URL if they need a different path. A configurable base URL adds complexity with minimal benefit at this stage.

### 8. New subpath export `khotan-data/factory`

**Decision:** The factory, adapter, and handler are exported from `khotan-data/factory`, not from the main `khotan-data` entry point.

**Rationale:** The main entry point is for the ETL pipeline primitives. The factory is a distinct concern (database registration + API handling) that has a Drizzle dependency. Keeping it separate avoids pulling in factory code when users only want ETL utilities. Matches the existing subpath pattern (`khotan-data/drizzle`, `khotan-data/pipeline`).

## Risks / Trade-offs

**[shadcn must be installed]** → The Hub component imports from shadcn paths (`@/components/ui/card`, etc.). If the user hasn't run `npx shadcn-ui init`, imports will fail. Mitigation: CLI checks for shadcn config before scaffolding and prints a helpful error if missing. Future: bundle minimal inline styles as a fallback.

**[Upsert on every request could be slow]** → If the user has many plugs/syncs, upsert on every API call adds latency. Mitigation: Use a module-level `initialized` flag so upsert runs once per server cold start, not per request. Drizzle upserts are fast for small row counts.

**[Multi-file scaffold is unusual]** → `npx khotan add hub` creates files in three different directories, which is more complex than the single-file Plug/Schema pattern. Mitigation: Clear CLI output showing every file created and its purpose. The user can re-run with `--force` if needed.

**[Hub component couples to API shape]** → If the API response format changes between khotan-data versions, scaffolded Hub components may break. Mitigation: The Hub is owned by the user, so they control the UI. The API shape will be versioned. For v0, this is acceptable.

**[Drizzle config detection is heuristic]** → `drizzle.config.ts` formats vary — `schema` can be a string, array, or glob. Mitigation: Handle common patterns (string path, glob with `*`). Fall back to prompting the user if parsing fails. This covers the vast majority of Drizzle setups.
