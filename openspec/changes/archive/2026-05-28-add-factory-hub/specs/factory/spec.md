## ADDED Requirements

### Requirement: khotan factory function
The `khotan-data` package SHALL export a `khotan()` factory function from `khotan-data/factory` that accepts a configuration object with `adapter` (database adapter) and `plugs` (array of plug registrations). It SHALL return an object with a `handler` property and an `init()` method.

#### Scenario: Create a khotan instance
- **WHEN** a user calls `khotan({ adapter: drizzleAdapter(db), plugs: [...] })`
- **THEN** the function SHALL return an object with `handler` and `init` properties
- **AND** the function SHALL NOT perform any database operations until `init()` is called or the first handler request is received

#### Scenario: Khotan with no plugs
- **WHEN** a user calls `khotan({ adapter: drizzleAdapter(db), plugs: [] })`
- **THEN** the factory SHALL return a valid instance with an empty registration set
- **AND** the handler SHALL still respond to API requests (returning empty lists)

### Requirement: Plug registration
Each plug registration SHALL be an object with `name` (string, unique identifier), `baseUrl` (string), `authType` (string — one of 'bearer', 'basic', 'apiKey', 'custom'), and optional `syncs` (array of sync registrations). Each sync registration SHALL have `name` (string), `type` (string — one of 'inflow', 'outflow', 'relay', 'webhook'), and optional `schedule` (string, cron expression).

#### Scenario: Register a plug with syncs
- **WHEN** a user registers a plug `{ name: "stripe", baseUrl: "https://api.stripe.com", authType: "bearer", syncs: [{ name: "products-inflow", type: "inflow", schedule: "0 * * * *" }] }`
- **THEN** the factory SHALL accept this configuration for database upsert

#### Scenario: Plug name uniqueness
- **WHEN** two plugs are registered with the same `name`
- **THEN** the factory SHALL throw an error at configuration time (before any database operation)

### Requirement: Database upsert on initialization
When `init()` is called (or on first handler request), the factory SHALL upsert all registered plugs into `khotan_plugs` and their syncs into `khotan_syncs`. Upsert SHALL use the plug `name` as the conflict key for plugs and `(plug_id, name)` as the conflict key for syncs.

#### Scenario: First initialization upserts rows
- **WHEN** `init()` is called with two registered plugs
- **THEN** the factory SHALL insert or update two rows in `khotan_plugs`
- **AND** the factory SHALL insert or update corresponding rows in `khotan_syncs` for each plug's syncs

#### Scenario: Idempotent upsert on restart
- **WHEN** the server restarts and `init()` runs again with the same plug configuration
- **THEN** the factory SHALL update existing rows (matching on name) rather than creating duplicates
- **AND** the `updated_at` timestamp SHALL be refreshed

#### Scenario: Initialization runs only once per process
- **WHEN** multiple API requests hit the handler concurrently
- **THEN** the upsert SHALL execute at most once (guarded by a module-level initialized flag)

### Requirement: Drizzle adapter
The package SHALL export a `drizzleAdapter(db)` function from `khotan-data/factory` that accepts a Drizzle Postgres instance and returns an adapter object. The adapter SHALL provide methods for the factory to query and upsert plugs, syncs, and runs.

#### Scenario: Create adapter from Drizzle instance
- **WHEN** a user calls `drizzleAdapter(db)` with their Drizzle database instance
- **THEN** the function SHALL return an adapter object that the `khotan()` factory accepts

#### Scenario: Adapter uses khotan schema tables
- **WHEN** the adapter performs database operations
- **THEN** it SHALL operate on `khotan_plugs`, `khotan_syncs`, and `khotan_runs` tables as defined by the schema component

### Requirement: API handler
The factory's `handler` SHALL be a function that accepts a standard `Request` object and returns a `Response`. It SHALL route requests based on the URL path segments after the base path.

#### Scenario: List plugs
- **WHEN** the handler receives `GET /api/khotan/plugs`
- **THEN** it SHALL return a JSON response with all plugs from `khotan_plugs` including their sync counts
- **AND** the response status SHALL be 200

#### Scenario: Get a single plug with syncs
- **WHEN** the handler receives `GET /api/khotan/plugs/:id`
- **THEN** it SHALL return a JSON response with the plug and its associated syncs
- **AND** the response status SHALL be 200
- **AND** if the plug does not exist, the response status SHALL be 404

#### Scenario: List syncs
- **WHEN** the handler receives `GET /api/khotan/syncs`
- **THEN** it SHALL return a JSON response with all syncs from `khotan_syncs` including their plug name
- **AND** the response status SHALL be 200

#### Scenario: List runs for a sync
- **WHEN** the handler receives `GET /api/khotan/syncs/:id/runs`
- **THEN** it SHALL return a JSON response with runs from `khotan_runs` for that sync, ordered by `started_at` descending
- **AND** the response status SHALL be 200

#### Scenario: Unknown route
- **WHEN** the handler receives a request for an unknown path
- **THEN** the response status SHALL be 404 with a JSON error body

### Requirement: Next.js handler adapter
The package SHALL export a `toNextJsHandler(handler)` function from `khotan-data/factory` that converts the factory's handler into an object with `GET`, `POST`, `PUT`, `DELETE` methods compatible with Next.js App Router route exports.

#### Scenario: Export as Next.js route
- **WHEN** a user writes `export const { GET, POST, PUT, DELETE } = toNextJsHandler(khotanData.handler)`
- **THEN** each exported method SHALL accept a `NextRequest` and return a `Response`
- **AND** the handler SHALL strip the base path prefix (e.g., `/api/khotan`) and route based on remaining segments

### Requirement: Subpath export
The `khotan-data` package SHALL expose a `khotan-data/factory` subpath export that provides `khotan`, `drizzleAdapter`, and `toNextJsHandler`.

#### Scenario: Import from subpath
- **WHEN** a user writes `import { khotan, drizzleAdapter, toNextJsHandler } from "khotan-data/factory"`
- **THEN** all three functions SHALL be available and typed correctly
