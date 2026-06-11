## Context

The plug debugger UI (`plug-debugger.tsx`) and its backend routes (`POST/GET /api/khotan/debug/:plugName`) are fully implemented. They provide a browser-based interface for firing requests through the real plug code path (auth, retry, hooks, token exchange). The factory already serializes Zod endpoint schemas via `serializeEndpoints()` for the UI sidebar.

AI agents operate in terminals and cannot interact with browser UIs. They need a CLI interface to the same debug infrastructure. The existing debug routes return structured JSON that is already agent-friendly — the missing piece is a CLI command that calls them and adds type comparison logic.

## Goals / Non-Goals

**Goals:**
- CLI command (`khotan probe`) that proxies requests through the running dev server's debug route
- Sub-modes: list plugs, show plug info/endpoints, fire requests, compare response against schema
- Deep type comparison engine that infers JSON shape and diffs against declared Zod endpoint schemas
- Structured JSON output on stdout for easy agent consumption
- Scaffoldable agent skill that teaches AI agents when and how to use the command
- Response metadata: timing (from debug route), payload size (computed client-side)

**Non-Goals:**
- Direct plug execution without a running server (future enhancement)
- Human-readable/pretty output mode (JSON only)
- MCP server integration (future consideration)
- Batch/bulk probing of all endpoints at once
- Modifying endpoint definitions based on comparison results (agent decides what to do)

## Decisions

### Decision 1: Hit the running dev server, don't execute directly

The probe command makes HTTP calls to the existing debug route (`POST /api/khotan/debug/:plugName`) rather than importing and executing plug files directly.

**Why**: The debug route already handles the hard parts — resolving encrypted vars from the DB, token exchange, hooks, retry logic. Reimplementing that in a standalone CLI context would require DB access, encryption key handling, and duplicating the factory's var resolution. The server is typically already running during development.

**Alternative considered**: Direct plug import + execution. Rejected because var resolution depends on the full factory stack (encrypted DB storage, `KHOTAN_SECRET`). Would require either a separate credential store or connecting directly to Postgres from the CLI.

### Decision 2: Port detection via flag → env → default

Resolution order:
1. `--port` flag (explicit)
2. `PORT` in `.env.local` (project-specific)
3. `PORT` in `.env` (fallback)
4. Default to `3000`

The CLI reads `.env.local` and `.env` files using simple line parsing (no `dotenv` dependency). Only the `PORT` variable is extracted.

**Why**: Most Next.js projects run on 3000. Environment files are the standard place to override. The flag provides escape hatch.

### Decision 3: Connectivity check before firing

Before any probe operation, the CLI hits `GET /api/khotan/debug` to verify:
- The server is reachable
- `KHOTAN_DEBUG` is enabled

If either fails, the CLI exits with a structured error JSON (`ok: false` with `error` code and `hint`).

**Why**: Fail fast with actionable messages. An agent seeing "server not running" or "debug not enabled" can take corrective action immediately.

### Decision 4: JSON-only output to stdout

All output is valid JSON written to stdout. No colors, no spinners, no human formatting. Errors are also JSON (`{ "ok": false, "error": "...", "hint": "..." }`).

**Why**: AI agents parse stdout. JSON is unambiguous. Human developers can pipe through `jq` if they want readability.

### Decision 5: Deep comparison via shape inference + recursive diff

The comparison engine has two stages:

1. **Infer shape** (`inferShape`): Walks the actual JSON response recursively, producing a schema tree:
   - Primitives → `{ type: "string" | "number" | "boolean" | "null" }`
   - Objects → `{ type: "object", properties: { key: SchemaNode } }`
   - Arrays → `{ type: "array", items: SchemaNode }` (merged from all array items)
   - Empty arrays → `{ type: "array", items: null }`

2. **Diff schemas** (`diffSchemas`): Compares the inferred shape against the serialized Zod schema from the endpoint metadata. Produces mismatches:
   - `missing`: key in schema but not in response
   - `extra`: key in response but not in schema
   - `type_mismatch`: same key, different type
   - Paths use JSONPath-like notation: `$.items[].sku`

The serialized Zod schema comes from the `GET /debug/:plugName` response (`endpoints[name].responses[200]`). The factory's `serializeZodSchema` already produces a flat `{ key: type_string }` format. For deep comparison, the diff engine handles nested objects and arrays by recursing into the structure.

**Why**: The user's core use case is "the API returns `token` but my type says `access_token`." Deep comparison catches nested mismatches that flat key comparison would miss.

**Alternative considered**: Only top-level key comparison. Rejected — real APIs have nested response shapes (e.g., `data.items[].attributes.name`) where mismatches commonly occur.

### Decision 6: Agent skill as a scaffoldable component

The skill file is a markdown template in `src/cli/templates/agent-skill.md`. It's registered in the CLI registry as a component called `agent-skill`. During `khotan init`, a prompt asks whether to install it (respecting `--yes` flag). The skill outputs to `.cursor/skills/khotan-probe/SKILL.md`.

**Why**: Follows the existing pattern — everything scaffoldable goes through the registry. The init integration ensures new projects get it by default while remaining opt-in.

### Decision 7: `--endpoint` resolves method + path from metadata

When the user passes `--endpoint listProducts`, the CLI:
1. Fetches plug metadata via `GET /debug/:plugName`
2. Finds the endpoint by name in the `endpoints` map
3. Uses its `method` and `path` to fire the request

This avoids the agent needing to know both the endpoint name AND its method/path.

**Why**: Endpoints are the abstraction the user defined. Letting the agent reference them by name is more natural than repeating the raw HTTP details.

## Risks / Trade-offs

- **Server must be running** → Clear error message with hint. Future enhancement could add direct execution mode. Most dev workflows already have the server running.
- **`KHOTAN_DEBUG` must be set** → Error message tells the agent exactly what to do. Could be documented in the skill file.
- **Comparison depends on Zod schemas being defined** → If an endpoint has no `responses` schema, `--compare` returns `comparison: null` with a note. The probe still works for raw exploration without types.
- **Port detection may fail** → Multiple fallback strategies. Worst case, agent passes `--port` explicitly.
- **Array shape inference merges all items** → If array items are polymorphic (different shapes), the inferred type is a union. This might produce spurious "extra" mismatches. Acceptable for MVP — the agent can interpret.
- **No offline mode** → This only works against a live API. If the external service is down, the probe returns the error response. The comparison still works on error responses (just comparing against success schemas, which won't match — the agent should interpret status codes).
