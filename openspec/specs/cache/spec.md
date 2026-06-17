## Purpose

The khotan cache capability provides durable, named cache namespaces for khotan sync workloads. Caches are registered as first-class definitions in `khotan.ts`, stored in the runtime data model, and accessed through programmatic helpers or the standard handler API.

## Requirements

### Requirement: Cache definitions declare durable cache namespaces
The system SHALL support named cache definitions that represent durable cache namespaces for khotan sync workloads. A cache definition MAY declare descriptive scope metadata and an optional default TTL.

#### Scenario: Register a cache definition for expensive sync state
- **WHEN** a user defines a cache such as `"shopify-products-snapshot"` in `khotan.ts`
- **THEN** the system SHALL treat that cache as a first-class registered namespace for later reads and writes

#### Scenario: Cache definition carries scope metadata
- **WHEN** a cache definition declares scope metadata such as `plug`, `resource`, or `flow`
- **THEN** the system SHALL preserve that scope as part of the cache definition contract

#### Scenario: Cache definition declares default TTL
- **WHEN** a cache definition includes a TTL
- **THEN** the system SHALL apply that TTL as the default expiry policy for entries written under that cache

### Requirement: Cache entries store the latest value per logical key
Each cache definition SHALL support durable entries addressed by a logical key. For a given cache definition and key, the system SHALL keep one latest stored value rather than multiple historical versions.

#### Scenario: Create a new cache entry
- **WHEN** a caller writes a previously unseen key under a cache definition
- **THEN** the system SHALL create a new cache entry for that key

#### Scenario: Update an existing cache entry
- **WHEN** a caller writes a key that already exists under the same cache definition
- **THEN** the system SHALL replace the previously stored value for that key rather than creating a duplicate entry

#### Scenario: Cache entries support structured payloads
- **WHEN** a caller stores an object or array as the cached value
- **THEN** the system SHALL preserve that JSON payload for later reads

### Requirement: Cache expiry behaves as a read-time miss
When a cache definition uses TTL, expired entries SHALL be treated as misses by normal reads.

#### Scenario: Unexpired entry returns value
- **WHEN** a caller reads a cache entry whose expiry has not passed
- **THEN** the system SHALL return the stored value

#### Scenario: Expired entry is treated as missing
- **WHEN** a caller reads a cache entry whose expiry has passed
- **THEN** the system SHALL behave as though the entry is missing for normal cache reads

### Requirement: Cache supports manual busting
The system SHALL allow callers to delete or bust a cache entry explicitly without waiting for TTL expiry.

#### Scenario: Delete one cache key
- **WHEN** a caller deletes a specific cache key under a registered cache definition
- **THEN** the system SHALL remove that entry from normal cache reads

#### Scenario: Delete unknown cache key is safe
- **WHEN** a caller deletes a cache key that does not exist
- **THEN** the system SHALL complete without corrupting other cache entries
