## 1. Topology Canvas Foundation

- [ ] 1.1 Add graph-rendering dependency and ensure generated standalone graph templates compile in Next.js client components.
- [ ] 1.2 Define a typed topology graph model in standalone graph template code (node categories, edge categories, and mapping helpers).
- [ ] 1.3 Add deterministic initial layout logic that always includes one global database node and positions plug/flow/webhook nodes by type.

## 2. Data Mapping and Graph Rendering

- [ ] 2.1 Implement standalone graph data loading to compose topology nodes/edges from existing `/api/khotan/plugs`, `/api/khotan/flows`, and `/api/khotan/webhook-handlers/:plugName` responses.
- [ ] 2.2 Implement directional edge mapping for inflow/outflow/relay and catch/pass relationships with explicit fallback handling for partial metadata.
- [ ] 2.3 Render the topology canvas with modern shadcn-compatible wrappers (title, legend/labels, graph container, and controls region) in a standalone component.

## 3. Interactions and Visual Design

- [ ] 3.1 Add zoom/pan/fit-view interactions and on-canvas controls for viewport management.
- [ ] 3.2 Implement node dragging with UI-only state updates and verify no coordinate persistence API requests are sent.
- [ ] 3.3 Apply subtle color accents for node and edge types while preserving contrast and visual consistency with existing package UI style.

## 4. Graph Block Scaffolding

- [ ] 4.1 Add a new `graph` block entry to CLI registry metadata and generation mappings.
- [ ] 4.2 Scaffold a dedicated graph page that mounts the standalone topology component.
- [ ] 4.3 Add a topology-specific empty state when no graphable plugs/flows are available, including loading and error states for the standalone page.

## 5. Verification

- [ ] 5.1 Validate generated graph page in a consumer app: graph loads, zoom controls work, and nodes can be repositioned during session.
- [ ] 5.2 Validate directional edges and node categories against representative inflow/outflow/relay and webhook handler data.
- [ ] 5.3 Run project checks (typecheck/tests/lint relevant to touched files) and confirm no regressions in CLI registry/template behavior.
