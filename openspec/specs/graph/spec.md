## Purpose

Define requirements for the standalone graph topology block and page that visualize khotan plugs, flows, webhook handlers, and directional data movement.

## Requirements

### Requirement: Standalone topology graph node model
The graph component SHALL render a standalone topology canvas containing one global database node, plug nodes, flow nodes, and webhook handler nodes derived from runtime API data.

#### Scenario: Render single global database node
- **WHEN** topology data is loaded
- **THEN** the canvas SHALL render exactly one database node representing the app database
- **AND** all data-direction edges touching storage SHALL connect to this database node

#### Scenario: Render plug and flow nodes from API
- **WHEN** the graph component receives `GET /api/khotan/plugs` and `GET /api/khotan/flows` responses
- **THEN** the canvas SHALL render one plug node per plug record and one flow node per flow record
- **AND** each flow node SHALL connect directionally to its related plug/database path by flow type

#### Scenario: Render webhook handler nodes and edges
- **WHEN** the graph component resolves webhook handlers for configured plugs
- **THEN** the canvas SHALL render webhook handler nodes for catch/pass handlers
- **AND** the canvas SHALL render directional edges from webhook handlers to destination plugs when destination metadata exists

### Requirement: Standalone topology interactions
The standalone graph component SHALL provide modern graph interactions with viewport controls and non-persistent node repositioning.

#### Scenario: Zoom and pan controls
- **WHEN** a user views the graph canvas
- **THEN** the canvas SHALL support zoom in, zoom out, and fit-view interactions
- **AND** users SHALL be able to pan the viewport

#### Scenario: Node drag does not persist
- **WHEN** a user drags a node to a different position
- **THEN** the node SHALL update position in UI state for the current session
- **AND** the graph component SHALL NOT send any API request to persist node coordinates
- **AND** the graph component SHALL NOT write node coordinates to the database

### Requirement: Standalone topology visual styling
The graph component SHALL use subtle visual differentiation so users can quickly identify node categories without high-saturation styling.

#### Scenario: Subtle color accents per node type
- **WHEN** topology nodes and edges are rendered
- **THEN** database, plug, flow, and webhook categories SHALL use distinct but subtle color accents
- **AND** the styling SHALL remain visually compatible with shadcn-based layout and typography

### Requirement: Graph empty state
The standalone graph component SHALL provide a clear empty state when graphable entities are unavailable.

#### Scenario: No plugs or flows available
- **WHEN** no plugs and/or no flows can be rendered into a topology
- **THEN** the graph page SHALL display an empty state explaining that plugs/flows must be configured
- **AND** the empty state SHALL avoid rendering a disconnected placeholder graph
