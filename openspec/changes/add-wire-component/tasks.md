## 1. Schema Changes

- [x] 1.1 Add `khotan_wires` table definition to `src/cli/templates/schema.ts` with columns: id, plug_id (FK), remote_id, callback_url, event_types (jsonb), status, metadata, created_at, updated_at
- [x] 1.2 Add indexes on `khotan_wires`: plug_id, status
- [x] 1.3 Modify `khotan_runs` table: make `sync_id` nullable, add nullable `wire_id` column referencing `khotan_wires.id`
- [x] 1.4 Add index on `khotan_runs.wire_id`
- [x] 1.5 Add Drizzle relations for wires: plug has many wires, wire has many runs, wire belongs to plug
- [x] 1.6 Export `KhotanWire` and `NewKhotanWire` type helpers
- [x] 1.7 Update the internal schema mirror in `src/factory.ts` to match the template changes (nullable sync_id, new wire_id, new khotan_wires table)

## 2. Wire Template

- [x] 2.1 Create `src/cli/templates/wire.ts` with the `wire()` factory function accepting `{ plug, db, subscribe, unsubscribe }` config
- [x] 2.2 Implement `create(callbackUrl)` method: calls plug.post with buildBody result, extracts remoteId via parseId, inserts khotan_wires row, returns record
- [x] 2.3 Implement `delete(wireId)` method: reads wire row, calls plug with unsubscribe.path(remoteId), updates row status to "disabled"
- [x] 2.4 Implement `get()` method: queries khotan_wires for active row matching the plug, returns record or null
- [x] 2.5 Add commented usage example at the bottom of the template showing full wire configuration with a plug instance

## 3. CLI Registry & Integration

- [x] 3.1 Register `wire` in the COMPONENTS record in `src/cli/registry.ts` with name, description, templatePath, outputFile, and `requires: ["plug", "schema"]`
- [x] 3.2 Add post-install CLI output in `src/cli/commands/add.ts` for the wire component showing import and usage example

## 4. Tests

- [x] 4.1 Add wire to the registry test in `src/cli/cli.test.ts` verifying it appears in component listing and has correct metadata
- [x] 4.2 Add template content test for wire.ts verifying it contains the wire factory function and commented example
- [x] 4.3 Test that wire requires plug and schema (requires field is set correctly)
