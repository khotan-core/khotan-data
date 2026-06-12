## Why

Users need a dedicated visual surface to understand how database resources, plugs, flows, and webhook handlers connect. A standalone topology canvas component and page-level block will provide that clarity without coupling the graph to existing Hub views.

## What Changes

- Add a standalone topology canvas component that visualizes connections between a single global database node, plug nodes, flow nodes, and webhook handler nodes.
- Add a new `graph` block that scaffolds a page mounting the topology canvas component.
- Render directional edges for inflow/outflow/relay and webhook catch/pass paths, with subtle type-based color accents.
- Add viewport controls (zoom in/out, fit view) and draggable node repositioning in UI state only (no persistence, no database writes).
- Derive graph nodes/edges from existing API routes (`/api/khotan/plugs`, `/api/khotan/flows`, `/api/khotan/webhook-handlers/:plugName`) without adding backend endpoints for MVP.
- Add an explicit empty state for graph view when no plugs/flows are available.

## Capabilities

### New Capabilities
- `graph`: Standalone topology canvas block and page for visualizing plug/data/webhook relationships.

### Modified Capabilities
- `cli`: Add `graph` as a scaffoldable block/component target.
- `registry`: Register the new `graph` block in component metadata and generation mappings.

## Impact

- Affected code: CLI registry entries and templates under `src/cli/templates/` for standalone graph component/page scaffolding.
- Affected APIs: No new endpoints required for MVP; graph derives from existing Hub API routes.
- Dependencies/systems: Add a graph rendering dependency for generated UI (likely React Flow) and ensure generated component styling remains compatible with shadcn-based layouts.
