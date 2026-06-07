## Context

Developers currently debug plug interactions by reading terminal logs or switching to external tools (Postman, curl). The plug already encapsulates auth, retry, headers, and base URL — the debugger surfaces this interactively. The `KHOTAN_DEBUG_LOGS` env var already exists for gating debug output.

## Goals / Non-Goals

**Goals:**
- Fire requests through the real plug code path (auth, retry, headers all applied)
- Show response status, timing, body, and headers in a UI panel
- Show typed endpoint definitions (if registered) alongside actual responses
- Dev-only, zero production footprint

**Non-Goals:**
- Not a full API client (no collections, history, environments, saved requests)
- Not a test runner or assertion framework
- Not accessible without `KHOTAN_DEBUG_LOGS` enabled
- No request chaining or scripting

## Decisions

### Backend: proxy route in the factory handler
**Choice**: `POST /api/khotan/debug/:plugName` route within the existing factory handler, gated by `KHOTAN_DEBUG_LOGS`.

**Rationale**: Keeps the request flowing through `plug.request()` so auth, retry, and hooks are exercised. No new server or separate process needed. The env gate means the route 404s in production.

**Alternative considered**: Client-side fetch directly to the external API — rejected because it bypasses the plug's auth/retry logic and exposes credentials to the browser.

### Request payload shape
```typescript
{
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;          // e.g. "/subscriptions" or "/products/123"
  body?: unknown;        // JSON body for POST/PUT/PATCH
  params?: Record<string, string>;  // query params
  headers?: Record<string, string>; // extra headers
}
```

### Response shape
```typescript
{
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  timing: number;        // ms
  endpoint?: {           // if typed endpoint matched
    name: string;
    expectedShape: string; // TypeScript type as string
    matched: boolean;
  };
}
```

### UI: single panel component (`PlugDebugger`)
**Choice**: One self-contained client component, scaffolded via `npx khotan add plug-debugger`. Renders inside the hub or standalone.

**Rationale**: Same pattern as `VarPanel` and `WirePanel` — composable, droppable anywhere.

### Typed endpoint integration
**Choice**: If the plug has registered `endpoints` in the factory, show them as a dropdown for quick selection (auto-fills method + path). Response body is displayed with visual diff against expected shape if available.

**Alternative considered**: Full Zod schema validation at runtime — rejected as over-engineered for a debug tool. String-level shape display is sufficient.

## Risks / Trade-offs

- **Security**: Debug route could leak data if accidentally enabled in production → Mitigation: hard gate on env var, route returns 404 when disabled, add console warning on startup if enabled
- **Scope creep**: Temptation to add request history, auth override, etc. → Mitigation: keep the component stateless (no persistence), add features only when pain is felt
- **Typed endpoints dependency**: If no typed endpoints registered, the shape validation section is empty → Acceptable degradation, the tool still works for ad-hoc path testing
