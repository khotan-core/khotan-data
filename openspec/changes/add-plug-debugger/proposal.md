## Why

Debugging plug interactions requires switching to Postman or reading terminal logs. The plug already knows its auth, vars, base URL, and typed endpoints — a built-in debug panel eliminates context-switching and lets developers test requests through the actual plug code path (with real retry, auth, and headers).

## What Changes

- Add a dev-only debug panel UI component (`PlugDebugger`) scaffolded via CLI
- Add a backend proxy route (`POST /api/khotan/debug/:plugName`) that fires requests through the plug's code path and returns timing, status, headers, and body
- Display typed endpoint definitions alongside actual responses for shape validation
- Gate the feature behind `KHOTAN_DEBUG_LOGS` env var (not available in production)

## Capabilities

### New Capabilities
- `plug-debugger`: Dev-only UI panel and backend route for testing plug requests interactively — select a plug, pick an endpoint or type a path, choose method, provide body/params, fire through the real plug code, and see response status, timing, body, headers.

### Modified Capabilities
- `factory`: Add `POST /api/khotan/debug/:plugName` route to the factory handler (gated behind debug flag)

## Impact

- New template file: `plug-debugger.tsx` (scaffolded component)
- Factory handler: new debug route (dev-only, env-gated)
- CLI registry: new component entry for `plug-debugger`
- No production impact — entirely gated behind `KHOTAN_DEBUG_LOGS`
