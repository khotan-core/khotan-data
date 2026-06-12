## MODIFIED Requirements

### Requirement: Hub React component
The scaffolded `hub.tsx` SHALL display configured plugs and their flows, and SHALL use flow/variable terminology throughout UI labels and interactions.

#### Scenario: Display flows for a plug
- **WHEN** a user views a plug in the Hub
- **THEN** the Hub SHALL show the plug's associated flows with their name, type, schedule, last run status, and enabled state

#### Scenario: Flow toggle uses flow API route
- **WHEN** a user toggles a flow in the Hub
- **THEN** the Hub SHALL send a PATCH request to `/api/khotan/flows/:id`

#### Scenario: Hub reads flows collection
- **WHEN** the Hub fetches runtime data
- **THEN** it SHALL request `GET /api/khotan/flows`

### Requirement: Hub API route template
The scaffolded route template SHALL expose flow and variable route handlers via the factory adapter exports.

#### Scenario: Route export includes PATCH for flow toggles
- **WHEN** the route file is scaffolded
- **THEN** it SHALL export the Next.js handlers required for Hub flow operations

## REMOVED Requirements

### Requirement: Sync wording in Hub
**Reason**: Hard rename to flow terminology in product and API.
**Migration**: Replace `/api/khotan/syncs` calls, labels, and local model names with flow-based equivalents.

#### Scenario: Legacy sync labels removed
- **WHEN** the Hub renders flow configuration sections
- **THEN** it SHALL NOT label those sections as syncs
