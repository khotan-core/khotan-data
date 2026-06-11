## Purpose

The plug debugger provides a dev-only interactive panel and backend route for testing plug requests. It fires requests through the real plug code path (auth, retry, headers) and displays response data including status, timing, and typed endpoint metadata.

## Requirements

### Requirement: Debug proxy route
The factory handler SHALL expose a `POST /api/khotan/debug/:plugName` route that proxies requests through the named plug's code path (auth, retry, headers) and returns structured response data.

#### Scenario: Successful debug request
- **WHEN** a POST is made to `/api/khotan/debug/pollinate` with `{ method: "GET", path: "/products" }`
- **THEN** the factory fires `pollinatePlug.get("/products")` and returns `{ status, statusText, headers, body, timing }`

#### Scenario: Debug route gated by env var
- **WHEN** `KHOTAN_DEBUG` is not set or falsy
- **THEN** the debug route SHALL return 404

#### Scenario: Plug not found
- **WHEN** a POST is made to `/api/khotan/debug/nonexistent`
- **THEN** the route SHALL return 404 with `{ error: "Plug not found" }`

#### Scenario: Request with body and params
- **WHEN** a POST is made with `{ method: "POST", path: "/subscriptions", body: { url: "..." }, params: { limit: "10" } }`
- **THEN** the factory fires the request with the provided body and query params through the plug

#### Scenario: Request failure returns error details
- **WHEN** the proxied request fails (e.g. 401, 500, timeout)
- **THEN** the route SHALL return `{ status, statusText, body, timing, error: "..." }` with HTTP 200 (the outer response always succeeds; the inner status reflects the plug call)

### Requirement: Response includes timing
The debug route SHALL measure and return request duration in milliseconds as `timing`.

#### Scenario: Timing measurement
- **WHEN** a debug request completes
- **THEN** `timing` reflects the wall-clock time from request start to response received (excluding JSON parsing on our side)

### Requirement: Typed endpoint matching
If the plug has registered typed endpoints, the debug response SHALL include endpoint metadata when the request path matches a registered endpoint.

#### Scenario: Path matches typed endpoint
- **WHEN** the requested path+method matches a registered endpoint on the plug
- **THEN** the response includes `endpoint: { name, method, path }` metadata

#### Scenario: No typed endpoints registered
- **WHEN** the plug has no registered endpoints
- **THEN** the `endpoint` field is omitted from the response
