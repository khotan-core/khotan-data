## Why

The Plug component handles HTTP communication and the Schema component defines the database tables, but nothing connects them. There's no way to register code-level plug configurations into the database, expose an API for the Hub to query, or give users a dashboard to see what's configured. Without these three pieces — factory, API route, and Hub UI — the schema sits empty and the plugs are invisible.

## What Changes

- Add a `khotan()` factory function to the `khotan-data` npm package — accepts a Drizzle adapter and plug/sync registrations, upserts them into `khotan_plugs`/`khotan_syncs` tables on first use, and returns an API handler
- Add `drizzleAdapter(db)` helper to the package — wraps the user's Drizzle instance for use with the factory
- Add `toNextJsHandler(handler)` helper — converts the factory's handler into Next.js App Router GET/POST/PUT/DELETE exports
- Add a new CLI component `hub` — `npx khotan add hub` scaffolds:
  - `components/khotan/hub.tsx` — a React dashboard using shadcn components that shows configured plugs and syncs
  - `app/api/khotan/[...all]/route.ts` — a catch-all API route that wires the factory handler into Next.js
  - `lib/khotan/khotan.ts` (or `src/lib/khotan/khotan.ts`) — the user's config file where they register plugs and syncs with the factory
- Fix `npx khotan add schema` output path — CLI now detects the user's Drizzle schema directory (by reading `drizzle.config.ts`) or prompts for it, instead of dumping schema.ts into `lib/khotan`
- New subpath export `khotan-data/factory` for the factory, adapter, and handler utilities

## Capabilities

### New Capabilities

- `factory`: The `khotan()` factory function, `drizzleAdapter()`, and `toNextJsHandler()` — core runtime that registers plugs/syncs into the database and exposes an API handler
- `hub`: The React dashboard component and associated scaffolded files (API route, config) that let users visualize and manage their configured plugs and syncs

### Modified Capabilities

- `cli`: Add `hub` to the component registry, update `add schema` to detect Drizzle schema directory for output path

## Impact

- **New source files in package**: `src/factory.ts` (khotan factory, drizzle adapter, handler utilities)
- **New subpath export**: `khotan-data/factory` in `package.json`
- **New CLI templates**: `src/cli/templates/hub.tsx`, `src/cli/templates/khotan-route.ts`, `src/cli/templates/khotan-config.ts`
- **CLI registry**: Add `hub` entry that scaffolds multiple files
- **CLI add command**: Update `add schema` to detect Drizzle config and place schema.ts in the correct directory; update `add hub` to scaffold multiple files into different locations
- **tsup config**: Copy new templates to dist, add factory entry point
- **package.json**: Add `khotan-data/factory` export, add `drizzle-orm` peer dep usage in factory
- **User's project**: After `npx khotan add hub`, user gets a working dashboard at `/api/khotan` with a React component they can embed
