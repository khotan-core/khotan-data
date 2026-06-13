## Purpose

The mapping browser is a scaffoldable client-side UI component for browsing, searching, creating, editing, and deleting resource mappings through the Khotan runtime API.

### Requirement: Mapping browser CLI component
The CLI SHALL provide a `mapping-browser` component that scaffolds a reusable client-side mappings management UI.

#### Scenario: Scaffold mapping browser component
- **WHEN** a user runs `npx khotan add mapping-browser` in a project with a valid `khotan.config.ts`
- **THEN** the CLI SHALL create the files required for a reusable mappings management component
- **AND** the CLI SHALL print a success message listing the created files

#### Scenario: Mapping browser files already exist
- **WHEN** a user runs `npx khotan add mapping-browser` and one or more target files already exist
- **THEN** the CLI SHALL prompt for overwrite confirmation for each existing file unless `--force` is used

### Requirement: Mappings page block
The CLI SHALL provide a `mappings-page-1` block that scaffolds a ready-made app-router page rendering the mappings browser component.

#### Scenario: Scaffold mappings page block
- **WHEN** a user runs `npx khotan add mappings-page-1`
- **THEN** the CLI SHALL create an app-router page file that renders the mappings browser component
- **AND** the CLI SHALL print a success message listing the created files

#### Scenario: Mappings page block composes component
- **WHEN** the mappings page block is scaffolded
- **THEN** the page SHALL import the scaffolded mappings browser component rather than duplicating its logic inline

### Requirement: Mapping browser resource selection
The mappings browser SHALL operate on one registered resource at a time and SHALL allow users to choose which resource they are browsing when multiple resources are available.

#### Scenario: Load resources for selection
- **WHEN** the mappings browser mounts
- **THEN** it SHALL request the registered resources from the Khotan API
- **AND** it SHALL present those resources as selectable browser targets

#### Scenario: Single resource is auto-selected
- **WHEN** the runtime reports exactly one available resource
- **THEN** the mappings browser SHALL select that resource by default

#### Scenario: Changing resource reloads mappings
- **WHEN** a user selects a different resource
- **THEN** the browser SHALL fetch mappings for that resource
- **AND** it SHALL reset list state that is resource-specific

### Requirement: Mapping browser paginated searchable table
The mappings browser SHALL render mappings in a searchable paginated table scoped to the selected resource.

#### Scenario: Display mapping rows
- **WHEN** the browser loads mappings for a resource
- **THEN** it SHALL display one row per mapping
- **AND** each row SHALL include the canonical `connectValue`
- **AND** each row SHALL display the available per-plug refs

#### Scenario: Display mapping metadata context
- **WHEN** a mapping row has metadata fields
- **THEN** the browser SHALL display contextual metadata in the row or row detail surface
- **AND** it SHALL keep identity refs visually distinct from metadata

#### Scenario: Search mappings
- **WHEN** a user enters a search term
- **THEN** the browser SHALL request a filtered mapping list for the selected resource
- **AND** the visible rows SHALL update to the filtered result set

#### Scenario: Paginate mappings
- **WHEN** a user moves to the next or previous page
- **THEN** the browser SHALL request the corresponding page from the API
- **AND** it SHALL update the visible rows without requiring a full-page reload

#### Scenario: Empty filtered result set
- **WHEN** a resource exists but the active search returns no mappings
- **THEN** the browser SHALL display a no-results state rather than an error state

### Requirement: Mapping browser create flow
The mappings browser SHALL allow users to create a mapping for the selected resource.

#### Scenario: Open create form
- **WHEN** a user chooses to create a mapping
- **THEN** the browser SHALL present a form for `connectValue`, refs, and optional metadata

#### Scenario: Create mapping with connect value and refs
- **WHEN** a user submits a valid create form
- **THEN** the browser SHALL issue a mapping upsert request to the Khotan API
- **AND** the new mapping SHALL appear in the browser after a successful response

#### Scenario: Create form reflects resource plug declarations
- **WHEN** the selected resource declares participating plugs
- **THEN** the create form SHALL make those plugs available as explicit ref inputs
- **AND** it SHALL not encourage arbitrary undeclared plug keys

#### Scenario: Create validation failure is shown in UI
- **WHEN** the API rejects a create request
- **THEN** the browser SHALL display an actionable error state to the user

### Requirement: Mapping browser edit flow
The mappings browser SHALL allow users to edit an existing mapping.

#### Scenario: Open edit form from row
- **WHEN** a user chooses to edit an existing mapping row
- **THEN** the browser SHALL load that row's current `connectValue`, refs, and metadata into an edit form

#### Scenario: Save edited mapping
- **WHEN** a user submits a valid edit form
- **THEN** the browser SHALL issue an update request for that mapping row
- **AND** the visible mapping data SHALL refresh after a successful response

#### Scenario: Edit preserves mapping identity distinction
- **WHEN** a user edits an existing mapping
- **THEN** the UI SHALL present per-plug refs separately from metadata fields
- **AND** it SHALL not collapse the two concepts into one undifferentiated JSON editor

### Requirement: Mapping browser delete flow
The mappings browser SHALL allow users to delete an existing mapping.

#### Scenario: Delete mapping from row action
- **WHEN** a user triggers delete for a mapping row and confirms the action
- **THEN** the browser SHALL issue a delete request for that mapping row
- **AND** the deleted row SHALL be removed from the visible table after success

#### Scenario: Delete failure is surfaced
- **WHEN** the delete request fails
- **THEN** the browser SHALL display an error state
- **AND** it SHALL keep the row visible because the deletion did not complete

### Requirement: Mapping browser states
The mappings browser SHALL provide clear loading, empty, and error states.

#### Scenario: Loading resources or mappings
- **WHEN** the browser is waiting on resource or mapping data
- **THEN** it SHALL display a loading state

#### Scenario: No resources available
- **WHEN** the runtime reports zero registered resources
- **THEN** the browser SHALL display an empty state explaining that mappings require registered resources

#### Scenario: Resource has no mappings yet
- **WHEN** the selected resource exists but has no mappings
- **THEN** the browser SHALL display an empty state encouraging the user to create the first mapping

#### Scenario: Resource or mappings request fails
- **WHEN** a resource or mappings request fails
- **THEN** the browser SHALL display an error state with a retry path

### Requirement: Mapping browser ownership model
The scaffolded mappings browser component SHALL be user-owned UI code that depends on the Khotan runtime API rather than importing runtime logic from `khotan-data`.

#### Scenario: Browser component has no khotan-data runtime dependency
- **WHEN** the scaffolded mappings browser source is inspected
- **THEN** it SHALL contain zero runtime imports from `khotan-data`
- **AND** it SHALL talk to the runtime through `/api/khotan/*` endpoints
