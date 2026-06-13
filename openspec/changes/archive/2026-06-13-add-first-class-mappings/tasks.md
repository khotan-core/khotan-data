## 1. Resource and mapping contract

- [x] 1.1 Extend resource registration types to support `connectField` as a string or ordered string array
- [x] 1.2 Add resource plug participation types for one unique identifier definition per plug
- [x] 1.3 Add configuration-time validation for unknown resource participant plugs and malformed mapping resource declarations
- [x] 1.4 Define and implement deterministic canonical `connectValue` derivation rules for single-field and composite resource contracts
- [x] 1.5 Ensure mapping semantics keep external per-plug IDs in `refs` and reserve `metadata` for contextual non-identity fields

## 2. Factory and adapter mapping operations

- [x] 2.1 Extend the adapter contract to support paginated mapping listing and lookup by canonical `connectValue`
- [x] 2.2 Implement adapter queries for paginated resource-scoped mapping browsing with stable ordering
- [x] 2.3 Implement adapter lookup by canonical `connectValue`
- [x] 2.4 Enforce declared resource plug membership during mapping create and update operations
- [x] 2.5 Add programmatic factory helpers for listing, looking up, upserting, updating, and deleting mappings
- [x] 2.6 Extend the Khotan handler with paginated/searchable resource mappings responses
- [x] 2.7 Extend the Khotan handler with direct lookup by canonical `connectValue`
- [x] 2.8 Add or update runtime tests covering resource validation, mapping browse/search, connect-value lookup, plug-ref lookup, and mutation validation

## 3. CLI mappings surface

- [x] 3.1 Create a `mappings` command group wired into the main CLI
- [x] 3.2 Implement `khotan mappings list` with resource resolution, pagination, and search flags
- [x] 3.3 Implement `khotan mappings lookup` with both `--connect-value` mode and `--plug` plus `--ref` mode
- [x] 3.4 Implement `khotan mappings upsert` with JSON parsing for `refs` and optional `metadata`
- [x] 3.5 Implement `khotan mappings update` by row ID
- [x] 3.6 Implement `khotan mappings delete` by row ID
- [x] 3.7 Add CLI tests covering success, validation failures, connectivity errors, and JSON-only output guarantees

## 4. Registry and scaffolding

- [x] 4.1 Add a `mapping-browser` component entry to the registry with required dependencies
- [x] 4.2 Add a `mappings-page-1` block entry to the registry with dependency on `mapping-browser`
- [x] 4.3 Create the mappings browser component template files
- [x] 4.4 Create the mappings page block template file that renders the browser component
- [x] 4.5 Verify add-command behavior for `mapping-browser` and `mappings-page-1`, including overwrite prompts and dependency installation flow

## 5. Mappings browser UI

- [x] 5.1 Build resource loading and selection behavior for the mappings browser
- [x] 5.2 Build the paginated searchable mappings table showing canonical `connectValue`, refs, and metadata context
- [x] 5.3 Build create mapping UI with resource-aware ref inputs
- [x] 5.4 Build edit mapping UI that keeps refs and metadata conceptually separate
- [x] 5.5 Build delete mapping flow with confirmation and error handling
- [x] 5.6 Add loading, empty, no-results, and error states for the browser component
- [x] 5.7 Verify the scaffolded UI uses runtime API endpoints only and does not import `khotan-data` at runtime

## 6. Documentation and verification

- [x] 6.1 Update docs/source content to describe first-class mappings, richer resource declarations, and the new CLI/UI surfaces
- [x] 6.2 Add component catalog entries and block documentation for `mapping-browser` and `mappings-page-1`
- [x] 6.3 Add examples showing customer-style mappings where `connectValue` is shared identity and `refs` stores per-plug unique identifiers
- [x] 6.4 Run focused verification for runtime routes, CLI commands, registry scaffolding, and mappings browser behavior
