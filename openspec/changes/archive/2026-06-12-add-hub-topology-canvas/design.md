## Context

The package currently lacks a dedicated graph surface for topology visualization. Users want a standalone, modern topology canvas they can add as its own block/page, instead of embedding this directly into existing Hub screens.

Constraints:
- Keep MVP data-loading on existing API routes (`/plugs`, `/flows`, `/webhook-handlers/:plugName`).
- Use shadcn-compatible styling patterns for panels, controls, badges, and empty states.
- Node drag behavior is presentation-only and MUST NOT persist to database.
- Visual styling should be modern and subtle, including restrained node/edge color accents by type.

## Goals / Non-Goals

**Goals:**
- Add an interactive standalone topology canvas component with pan/zoom controls and fit-to-view behavior.
- Add a `graph` scaffold target that generates a page mounting the standalone canvas component.
- Represent one global database node, plug nodes, flow nodes, and webhook handler nodes with directional edges.
- Support in-session node repositioning to let users improve readability without mutating runtime data.
- Keep graph derivation deterministic from existing API responses.
- Provide a clear empty state when no topology can be rendered.

**Non-Goals:**
- Persisting layout coordinates to API/database.
- Introducing new backend topology endpoints for MVP.
- Refactoring Hub table/card workflows in this change.
- Adding advanced graph engines (auto-routing, grouped subflows, saved views) beyond baseline MVP.

## Decisions

### Decision 1: Use React Flow for graph rendering
- **Choice:** Render topology using React Flow (controls, minimap optional, drag/pan/zoom built in).
- **Rationale:** It provides stable graph interactions and polished UX quickly while preserving custom shadcn-styled wrappers around the canvas.
- **Alternatives considered:**
  - **Custom SVG/Canvas renderer:** More control but much slower to deliver and higher maintenance burden.
  - **Cytoscape:** Powerful but heavier and less aligned with simple React-node composition for MVP.

### Decision 2: Build graph from existing Hub API responses
- **Choice:** Compose graph client-side from existing plugs, flows, and webhook handler API responses.
- **Rationale:** Avoids backend churn and allows graph rollout as a UI-first enhancement.
- **Alternatives considered:**
  - **New topology endpoint:** Cleaner payload contract but adds backend work not required for MVP.

### Decision 3: Ship as standalone graph block/page
- **Choice:** Introduce a dedicated `graph` block that scaffolds a page and mounts the standalone topology component.
- **Rationale:** Keeps topology concerns isolated and allows users to adopt the graph without changing Hub workflows.
- **Alternatives considered:**
  - **Embed only in Hub:** Faster coupling but conflicts with requirement for standalone component usage.

### Decision 4: Canonical node/edge model with single database node
- **Choice:** Always create one global database node and connect flow/webhook nodes directionally to plugs and database depending on flow type and handler behavior.
- **Rationale:** Matches product mental model and keeps graph readable for early adopters.
- **Alternatives considered:**
  - **Per-resource/per-table DB nodes:** Richer but increases visual noise and complexity.

### Decision 5: Keep node drag in ephemeral UI state only
- **Choice:** Apply drag updates to local React state only, reset on reload.
- **Rationale:** Satisfies user-driven readability adjustments with zero persistence surface.
- **Alternatives considered:**
  - **Persist coordinates server-side:** Useful long term, but out of MVP scope and adds migration/API design burden.

### Decision 6: Subtle semantic theming per node type
- **Choice:** Assign restrained background/border/edge hues by node category (database/plug/flow/webhook), while preserving accessible contrast and shadcn conventions.
- **Rationale:** Supports quick scanning without visual overload.
- **Alternatives considered:**
  - **Monochrome graph:** Cleaner but loses category affordance.
  - **High-saturation palette:** More expressive but conflicts with desired subtle modern aesthetic.

## Risks / Trade-offs

- **[Graph can become dense with many plugs/handlers]** -> Mitigation: use fit-view defaults, spacing heuristics, and optional minimap.
- **[Webhook edge direction can be ambiguous for some custom pass/catch logic]** -> Mitigation: codify deterministic mapping rules and add badges/tooltips on node cards.
- **[Additional frontend dependency increases generated template surface]** -> Mitigation: pin a widely adopted graph library and keep wrapper API minimal.
- **[Client-side layout computation might feel unstable between refreshes]** -> Mitigation: deterministic initial placement order by type/name and local drag refinements during session.

## Migration Plan

1. Add/modify graph, CLI, and registry specs to define standalone topology scaffolding and behavior.
2. Add graph templates for the standalone component and the page-level block entrypoint.
3. Add graph dependency to generated project template dependencies.
4. Validate behavior manually in scaffolded consumer app: load graph page, drag nodes, zoom controls, and empty states.
5. Rollback strategy: revert graph template/dependency changes; existing blocks continue to function.

## Open Questions

- Should minimap be included by default in MVP or hidden behind a lightweight toggle?
- Should webhook handler nodes always be visible, or optionally collapsed in dense environments?
- What default route/path should the generated graph page use in scaffolded apps?
