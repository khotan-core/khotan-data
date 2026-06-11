## Purpose

The probe CLI command allows developers and AI agents to fire requests through configured plugs via the running dev server's debug route, inspect responses, and compare response shapes against declared Zod endpoint schemas. All output is structured JSON for programmatic consumption.

## Requirements

### Requirement: Probe command entry point
The CLI SHALL provide a `probe` command invokable as `npx khotan probe [plugName] [METHOD] [path] [flags]`. The command SHALL output valid JSON to stdout for all operations including errors.

#### Scenario: Probe with no arguments shows help
- **WHEN** a user runs `npx khotan probe` with no arguments
- **THEN** the CLI SHALL output a JSON error with `ok: false` and a `hint` explaining usage

#### Scenario: Probe outputs only JSON to stdout
- **WHEN** any probe sub-mode executes
- **THEN** the output to stdout SHALL be a single valid JSON object
- **AND** no non-JSON text (spinners, colors, progress) SHALL be written to stdout

### Requirement: Port detection
The probe command SHALL resolve the dev server port using the following priority order: `--port` flag, `PORT` in `.env.local`, `PORT` in `.env`, default `3000`.

#### Scenario: Explicit port flag
- **WHEN** a user runs `npx khotan probe pollinate GET /products --port 4000`
- **THEN** the CLI SHALL connect to `http://localhost:4000`

#### Scenario: Port from .env.local
- **WHEN** no `--port` flag is provided and `.env.local` contains `PORT=3001`
- **THEN** the CLI SHALL connect to `http://localhost:3001`

#### Scenario: Default port
- **WHEN** no `--port` flag is provided and no `PORT` variable exists in env files
- **THEN** the CLI SHALL connect to `http://localhost:3000`

### Requirement: Connectivity check
Before any probe operation, the CLI SHALL verify the dev server is reachable and debug mode is enabled by hitting `GET <base>/debug`.

#### Scenario: Server not reachable
- **WHEN** the dev server is not running at the resolved port
- **THEN** the CLI SHALL output `{ "ok": false, "error": "connect_failed", "hint": "Could not connect to dev server at localhost:<port>. Is it running?" }`

#### Scenario: Debug mode disabled
- **WHEN** the server is reachable but `GET <base>/debug` returns 404
- **THEN** the CLI SHALL output `{ "ok": false, "error": "debug_disabled", "hint": "Debug mode is not enabled. Set KHOTAN_DEBUG=1 in your environment and restart." }`

### Requirement: Base path configuration
The probe command SHALL accept a `--base-path` flag to configure the API base path. The default SHALL be `/api/khotan`.

#### Scenario: Custom base path
- **WHEN** a user runs `npx khotan probe pollinate GET /products --base-path /api/v2/khotan`
- **THEN** the CLI SHALL use `http://localhost:<port>/api/v2/khotan/debug/pollinate` as the debug endpoint

### Requirement: List plugs mode
The probe command SHALL support a `--list` flag that returns all registered plugs from the running server.

#### Scenario: List available plugs
- **WHEN** a user runs `npx khotan probe --list`
- **THEN** the CLI SHALL output a JSON object with `ok: true` and a `plugs` array containing each plug's `name`, `baseUrl`, `authType`, and `varsConfigured` status

### Requirement: Plug info mode
The probe command SHALL support an `--info` flag that returns detailed metadata for a specific plug including its endpoints and var configuration.

#### Scenario: Show plug info with endpoints
- **WHEN** a user runs `npx khotan probe pollinate --info` and the plug has typed endpoints
- **THEN** the CLI SHALL output a JSON object with `ok: true` and a `plug` object containing `name`, `baseUrl`, `authType`, `vars` (with `configured` boolean and `fields` array of non-hidden fields), and `endpoints` map

#### Scenario: Show plug info without endpoints
- **WHEN** a user runs `npx khotan probe pollinate --info` and the plug has no typed endpoints
- **THEN** the CLI SHALL output the plug info with `endpoints: null`

#### Scenario: Info for unknown plug
- **WHEN** a user runs `npx khotan probe nonexistent --info`
- **THEN** the CLI SHALL output `{ "ok": false, "error": "plug_not_found", "hint": "Plug \"nonexistent\" not found. Use --list to see available plugs." }`

### Requirement: Fire request mode
The probe command SHALL fire a request through a plug when given a plug name, HTTP method, and path. The request SHALL be proxied through the dev server's debug route.

#### Scenario: Fire a GET request
- **WHEN** a user runs `npx khotan probe pollinate GET /products`
- **THEN** the CLI SHALL POST to the debug route with `{ "method": "GET", "path": "/products" }`
- **AND** the output SHALL include `request` (method, path, params, body), `response` (status, statusText, timing, size, headers, body), and `matchedEndpoint` (name or null)

#### Scenario: Fire a POST request with body
- **WHEN** a user runs `npx khotan probe pollinate POST /subscriptions --body '{"url":"https://example.com"}'`
- **THEN** the CLI SHALL include the parsed body in the debug route request
- **AND** the response SHALL include the API's response

#### Scenario: Fire a request with query params
- **WHEN** a user runs `npx khotan probe pollinate GET /products --params '{"limit":"10","cursor":"abc"}'`
- **THEN** the CLI SHALL include the params in the debug route request

#### Scenario: Fire a request with extra headers
- **WHEN** a user runs `npx khotan probe pollinate GET /products --headers '{"X-Custom":"value"}'`
- **THEN** the CLI SHALL include the extra headers in the debug route request

#### Scenario: Response includes payload size
- **WHEN** any request is fired and a response is received
- **THEN** the output SHALL include a `size` field in the response object representing the JSON-serialized body size in a human-readable format (e.g., `"1.4kb"`, `"234b"`)

### Requirement: Endpoint selection mode
The probe command SHALL support an `--endpoint` flag that resolves a named endpoint's method and path from the plug's metadata.

#### Scenario: Fire request via endpoint name
- **WHEN** a user runs `npx khotan probe pollinate --endpoint listProducts`
- **THEN** the CLI SHALL fetch the plug metadata, find `listProducts` in the endpoints map, and fire a request using its declared method and path

#### Scenario: Unknown endpoint name
- **WHEN** a user runs `npx khotan probe pollinate --endpoint unknownEndpoint`
- **THEN** the CLI SHALL output `{ "ok": false, "error": "endpoint_not_found", "hint": "Endpoint \"unknownEndpoint\" not found on plug \"pollinate\". Use --info to see available endpoints." }`

### Requirement: Type comparison mode
The probe command SHALL support a `--compare` flag that compares the actual response body against the declared Zod response schema for the matched endpoint.

#### Scenario: Comparison with matching types
- **WHEN** a user runs `npx khotan probe pollinate --endpoint listProducts --compare` and the response matches the declared schema
- **THEN** the output SHALL include `"comparison": { "match": true, "mismatches": [] }`

#### Scenario: Comparison with mismatched types
- **WHEN** a user runs with `--compare` and the response has fields not in the schema or missing fields
- **THEN** the output SHALL include `"comparison": { "match": false, "expected": {...}, "actual": {...}, "mismatches": [...] }`
- **AND** each mismatch SHALL have `path` (JSONPath notation), `issue` (one of `"missing"`, `"extra"`, `"type_mismatch"`), and optional `note`

#### Scenario: Comparison with nested mismatches
- **WHEN** the response contains nested objects or arrays whose shape differs from the schema
- **THEN** the mismatches SHALL include entries with nested paths (e.g., `$.data.items[].attributes.name`)

#### Scenario: Comparison without response schema
- **WHEN** a user runs with `--compare` but the matched endpoint has no `responses` schema defined
- **THEN** the output SHALL include `"comparison": null` with a `"comparisonNote": "No response schema defined for this endpoint"`

#### Scenario: Comparison when no endpoint matches
- **WHEN** a user runs with `--compare` on a path/method that does not match any typed endpoint
- **THEN** the output SHALL include `"comparison": null` with a `"comparisonNote": "No typed endpoint matched this request. Define endpoints on your plug to enable comparison."`

### Requirement: Deep shape inference
The comparison engine SHALL recursively infer the schema of an actual JSON value, handling primitives, objects, arrays, and null values.

#### Scenario: Infer primitive types
- **WHEN** the response body contains string, number, boolean, or null values
- **THEN** the inferred schema SHALL correctly identify each as `"string"`, `"number"`, `"boolean"`, or `"null"`

#### Scenario: Infer nested object shape
- **WHEN** the response body contains nested objects (e.g., `{ "data": { "id": "x", "meta": { "count": 1 } } }`)
- **THEN** the inferred schema SHALL recursively describe the full nested structure

#### Scenario: Infer array item shape
- **WHEN** the response body contains an array with multiple items
- **THEN** the inferred schema SHALL merge the shapes of all items (union of all keys present across items)

#### Scenario: Infer empty array
- **WHEN** the response body contains an empty array
- **THEN** the inferred schema SHALL represent it as `{ "type": "array", "items": null }`
