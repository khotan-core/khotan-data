## Context

khotan/data has a working CLI (`npx khotan init`, `npx khotan add plug`) and a Plug component (self-contained fetch wrapper). The next layer is the database schema that the Hub UI and future flow components will read from. 

The target stack is Next.js + Drizzle ORM + Postgres. The schema component follows the same shadcn model as Plug: `npx khotan add schema` scaffolds a file into the user's project that they own and can edit.

## Goals / Non-Goals

**Goals:**
- Drizzle schema file with `khotan_plugs`, `khotan_syncs`, `khotan_runs` table definitions
- Self-contained — imports only from `drizzle-orm/pg-core` (already a peer dep)
- CLI `add schema` command works the same as `add plug`
- Schema is designed for the three-level hierarchy: Plug → Sync → Run
- Tables use text IDs (ULID-style), timestamps, and JSONB metadata where appropriate
- `khotan_plugs` includes nullable `encrypted_credentials` column for future credential storage
- Schema includes proper indexes for common query patterns (list syncs by plug, list runs by sync, recent runs)

**Non-Goals:**
- No migration generation — user runs `drizzle-kit push` or `drizzle-kit generate` themselves
- No registration/sync logic — the `khotan()` factory that upserts code config into DB is a separate change
- No encryption implementation — the `encrypted_credentials` column exists but is nullable and unused for now
- No Hub UI — this change is schema only

## Decisions

### 1. Text IDs, not serial integers

**Decision:** All primary keys are `text` columns holding ULIDs (or UUIDs — user's choice since they own the file).

**Rationale:** ULIDs are sortable by time, globally unique, and don't leak information about row counts. They work across distributed systems. The user can swap to `uuid` or `serial` by editing the schema file — they own it.

### 2. All tables prefixed with `khotan_`

**Decision:** Table names are `khotan_plugs`, `khotan_syncs`, `khotan_runs`.

**Rationale:** Avoids name collisions with the user's existing tables. Same pattern as better-auth (`ba_` prefix) and NextAuth (`accounts`, `sessions` etc. but in a dedicated schema). The prefix is clear and short.

### 3. Schema is one file

**Decision:** All three tables live in a single `schema.ts` file, not split across files.

**Rationale:** The tables are tightly related (foreign keys between them). One file is easier to scan and understand. The user can split it later if they prefer. Matches the Plug pattern of one component = one file.

### 4. `encrypted_credentials` column is nullable, unused for v0

**Decision:** `khotan_plugs` includes an `encrypted_credentials` text column that defaults to null. No encryption logic ships with this change.

**Rationale:** Adding the column now avoids a migration later when credential storage is implemented. It's nullable so it has zero impact on current usage. The encryption layer (AES-256-GCM with `KHOTAN_SECRET`) will be a separate change.

### 5. Runs table has denormalized counters

**Decision:** `khotan_runs` has individual integer columns for `extracted`, `transformed`, `created`, `updated`, `deleted`, `failed` rather than a single JSON stats column.

**Rationale:** Individual columns are queryable (`SELECT SUM(created) FROM khotan_runs WHERE ...`), indexable, and type-safe in Drizzle. The `metadata` JSONB column exists for component-specific stats that don't fit the standard counters.

### 6. Output location matches Drizzle convention

**Decision:** The schema file is scaffolded to `<outputDir>/schema.ts` (same directory as plug.ts). The user re-exports from their root Drizzle schema file.

**Rationale:** Drizzle projects typically have a barrel schema file (`src/db/schema.ts`) that re-exports from sub-modules. The khotan schema file is designed to be re-exported: `export * from '@/lib/khotan/schema'`. The CLI prints this hint after scaffolding.

## Risks / Trade-offs

**[User must re-export]** → After `npx khotan add schema`, the user needs to add `export * from '@/lib/khotan/schema'` to their Drizzle schema barrel file. Mitigation: CLI prints clear instructions. Future: CLI could auto-patch the barrel file.

**[JSONB metadata not fully typed]** → The `metadata` column on `khotan_runs` is `jsonb` which loses type safety. Mitigation: The standard counters cover 90% of use cases. `metadata` is for escape-hatch component-specific data. Users can type it with Drizzle's `.$type<T>()` if they want.

**[ULID generation not included]** → The schema template doesn't include a ULID generator. Mitigation: the `$defaultFn` uses `crypto.randomUUID()` which is built-in. Users can swap to ULID by editing the file and adding a ULID library.
