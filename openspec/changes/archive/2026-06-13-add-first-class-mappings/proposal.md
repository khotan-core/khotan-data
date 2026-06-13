## Why

Mappings already exist in khotan as schema and runtime infrastructure, but they are still awkward to use as an actual product surface. Users can store cross-system identities, yet there is no first-class scaffolding, no operational CLI, no dedicated browser UI, and no richer resource registration model for declaring which plugs participate in a mapping and which identifier each plug contributes.

This gap matters most for relays, passes, and cross-system reconciliation flows, where agents and developers need a quick, reliable way to answer questions like "given this Shopify customer, what is the Cin7 customer?" or "show me all customer mappings keyed by email." The package now needs to promote mappings from hidden infrastructure into a first-class khotan capability.

## What Changes

- Expand resource registration so mappings can be declared under `resources` with:
  - allowed participant plugs
  - one unique identifier definition per plug
  - a connect field that may be single-field or composite at config time while still producing one canonical `connectValue`
- Extend runtime mapping operations to support:
  - lookup by `connectValue`
  - lookup by plug ref
  - paginated mapping listing
  - search/filtering for UI and agent use
  - create, update, and delete workflows as first-class operations
- Add a mappings CLI surface for agents and scripts to:
  - look up mappings
  - paginate through mappings
  - upsert mappings
  - update mappings
  - delete mappings
- Add a scaffoldable mappings browser UI component with searchable table, create/edit flows, and delete support
- Add a ready-made mappings page block that renders the browser component in the app router
- Tighten mapping semantics so external per-plug IDs are treated as first-class refs rather than being pushed into free-form metadata

## Capabilities

### New Capabilities
- `mapping-browser`: Searchable, editable mappings UI plus a ready-made page block for browsing, creating, updating, and deleting mappings

### Modified Capabilities
- `resource-mappings`: Expand resource registration and mapping operations to support participant plugs, per-plug unique identifiers, connect-value lookup, paginated listing, and stronger mapping semantics
- `factory`: Extend runtime validation and API behavior for richer resource declarations and first-class mapping operations used by UI, CLI, and agents
- `cli`: Add `khotan mappings` commands for lookup, paginated listing, upsert, update, and delete
- `registry`: Register scaffold targets for the mappings browser component and mappings page block

## Impact

- **Runtime**: `src/factory.ts` resource validation, mapping APIs, and instance helpers
- **CLI**: new operational commands alongside existing `flows`, `wire`, and `plug` commands
- **Scaffolding**: `src/cli/registry.ts` plus new templates for a mappings browser component and block
- **UI**: new component and page-level operational surface for mappings management
- **Docs/specs**: new mapping browser capability plus requirement updates across resource mappings, factory, CLI, and registry
