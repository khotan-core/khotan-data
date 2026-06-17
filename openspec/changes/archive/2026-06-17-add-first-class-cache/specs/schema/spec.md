## ADDED Requirements

### Requirement: khotan_caches table
The schema SHALL define a `khotan_caches` Drizzle table for registered cache definitions. The table SHALL include `id` (text, primary key, default UUID), `name` (text, unique, not null), `scope` (jsonb, nullable), `ttl_seconds` (integer, nullable), `created_at` (timestamp with timezone, default now), and `updated_at` (timestamp with timezone, default now).

#### Scenario: Cache definitions have stable identity
- **WHEN** the schema file is loaded by Drizzle
- **THEN** the `khotan_caches` table SHALL expose a unique constraint on `name`
- **AND** it SHALL generate default UUID primary keys

#### Scenario: Cache definitions store scope metadata
- **WHEN** a cache definition includes scope metadata
- **THEN** the schema SHALL persist that scope in the `scope` column

### Requirement: khotan_cache_entries table
The schema SHALL define a `khotan_cache_entries` Drizzle table for durable cache values. The table SHALL include `id` (text, primary key, default UUID), `cache_id` (text, not null, references `khotan_caches.id`), `key` (text, not null), `value` (jsonb, not null), `expires_at` (timestamp with timezone, nullable), `created_at` (timestamp with timezone, default now), and `updated_at` (timestamp with timezone, default now).

#### Scenario: Cache entry uniqueness is per cache and key
- **WHEN** the schema file is loaded by Drizzle
- **THEN** the `khotan_cache_entries` table SHALL enforce a unique constraint on `(cache_id, key)`

#### Scenario: Cache entries support expiry metadata
- **WHEN** a cache entry is written with a computed expiry
- **THEN** the schema SHALL persist that expiry in `expires_at`

### Requirement: Schema exports cache relations and indexes
The schema SHALL export Drizzle relations and indexes for cache definitions and entries so cache lookups and browsing are efficient and typed.

#### Scenario: Cache definition has many entries
- **WHEN** a relational query fetches a cache definition with its entries
- **THEN** the relation SHALL return all cache rows where `cache_id` matches the definition's `id`

#### Scenario: Cache entry belongs to one definition
- **WHEN** a relational query fetches a cache entry with its cache definition
- **THEN** the relation SHALL return the definition where `id` matches the entry's `cache_id`

#### Scenario: Cache lookups are indexed
- **WHEN** the schema file is loaded by Drizzle
- **THEN** it SHALL define indexes supporting lookup by `cache_id`, lookup by `(cache_id, key)`, and expiry-oriented cleanup or inspection by `expires_at`

### Requirement: Schema exports cache type helpers
The schema SHALL export TypeScript type helpers for cache definitions and cache entries using Drizzle `$inferSelect` and `$inferInsert`.

#### Scenario: Cache types are available for application code
- **WHEN** a user imports cache-related types from the schema file
- **THEN** the schema SHALL provide select and insert helper types for both `khotan_caches` and `khotan_cache_entries`
