## 1. Schema Template

- [x] 1.1 Add `khotan_resources` table definition to `src/cli/templates/schema.ts` with columns: id, name (unique), connect_field, description, created_at, updated_at
- [x] 1.2 Add `khotan_mappings` table definition to `src/cli/templates/schema.ts` with columns: id, resource_id (FK), connect_value, refs (jsonb), metadata (jsonb), created_at, updated_at — with unique constraint on (resource_id, connect_value) and GIN index on refs
- [x] 1.3 Add nullable `resource_id` column (FK to khotan_resources) to `khotan_syncs` table in `src/cli/templates/schema.ts`, plus index on resource_id
- [x] 1.4 Add Drizzle relations for resources (has many syncs, has many mappings) and mappings (belongs to resource), update syncs relations to include optional resource
- [x] 1.5 Export type helpers: `KhotanResource`, `NewKhotanResource`, `KhotanMapping`, `NewKhotanMapping`

## 2. Factory Internal Schema

- [x] 2.1 Add `khotanResources` internal table definition to `src/factory.ts` mirroring the scaffolded template (without FK .references())
- [x] 2.2 Add `khotanMappings` internal table definition to `src/factory.ts` mirroring the scaffolded template (without FK .references())
- [x] 2.3 Add nullable `resourceId` column to internal `khotanSyncs` table in `src/factory.ts`

## 3. Config Types & Validation

- [x] 3.1 Add `ResourceRegistration` interface: `{ name: string; connectField: string; description?: string }`
- [x] 3.2 Add optional `resource` field to `SyncRegistration` interface
- [x] 3.3 Add optional `resources` field to `KhotanConfig` interface
- [x] 3.4 Add validation in `khotan()`: no duplicate resource names, sync `resource` references must match a registered resource name

## 4. Adapter Interface & Drizzle Implementation

- [x] 4.1 Add `upsertResource`, `listResources`, `getResource` methods to `KhotanAdapter` interface
- [x] 4.2 Add `upsertMapping`, `getMapping`, `listMappings`, `deleteMapping`, `lookupMapping` methods to `KhotanAdapter` interface
- [x] 4.3 Add `updateSyncResourceId` method to `KhotanAdapter` interface (sets resource_id on a sync row)
- [x] 4.4 Implement `upsertResource` in `drizzleAdapter` — insert/update on name conflict, return id
- [x] 4.5 Implement `listResources` in `drizzleAdapter` — return all resources with sync count and mapping count
- [x] 4.6 Implement `getResource` in `drizzleAdapter` — return resource by id or null
- [x] 4.7 Implement `upsertMapping` in `drizzleAdapter` — insert/update on (resource_id, connect_value) conflict, merge refs with `jsonb_concat` or equivalent, return id
- [x] 4.8 Implement `getMapping` in `drizzleAdapter` — return mapping by id or null
- [x] 4.9 Implement `listMappings` in `drizzleAdapter` — return all mappings for a resource_id
- [x] 4.10 Implement `deleteMapping` in `drizzleAdapter` — delete by id
- [x] 4.11 Implement `lookupMapping` in `drizzleAdapter` — query by resource_id and `refs->>plugName = ref`, return mapping or null
- [x] 4.12 Implement `updateSyncResourceId` in `drizzleAdapter` — update resource_id on a sync row

## 5. Factory Init Logic

- [x] 5.1 Update `doInit()` to upsert resources before plugs/syncs, collecting a name→id map
- [x] 5.2 After upserting each sync, if the sync registration has a `resource` field, call `updateSyncResourceId` with the resolved resource id

## 6. API Handler Routes

- [x] 6.1 Add `GET .../resources` route — call `adapter.listResources()`, return JSON
- [x] 6.2 Add `GET .../resources/:id` route — call `adapter.getResource(id)`, return with syncs or 404
- [x] 6.3 Add `GET .../resources/:id/mappings` route — call `adapter.listMappings(resourceId)`, return JSON
- [x] 6.4 Add `POST .../mappings` route — parse JSON body, call `adapter.upsertMapping()`, return result
- [x] 6.5 Add `GET .../mappings/:id` route — call `adapter.getMapping(id)`, return or 404
- [x] 6.6 Add `PUT .../mappings/:id` route — parse JSON body, call `adapter.upsertMapping()` with id, return result
- [x] 6.7 Add `DELETE .../mappings/:id` route — call `adapter.deleteMapping(id)`, return 204
- [x] 6.8 Add `POST .../mappings/lookup` route — parse JSON body, call `adapter.lookupMapping()`, return or 404

## 7. Tests

- [x] 7.1 Add unit tests for resource/mapping config validation (duplicate names, unknown resource references)
- [x] 7.2 Add unit tests for resource and mapping API routes (list, get, create, update, delete, lookup) using the existing factory test pattern
- [x] 7.3 Add unit tests for init upserting resources and linking syncs to resource_id

## 8. Config Template Update

- [x] 8.1 Update `src/cli/templates/khotan-config.ts` to include example `resources` array and sync `resource` field in the scaffolded config
