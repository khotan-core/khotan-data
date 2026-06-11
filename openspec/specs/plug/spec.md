## Purpose

Plug is a self-contained fetch wrapper component for external APIs. It provides pluggable auth strategies, retry with exponential backoff, pagination helpers, rate limit handling, timeout support, and typed HTTP methods — all in a single editable file with zero runtime dependencies on khotan-data.

## Requirements

### Requirement: Plug factory function
The scaffolded `plug.ts` SHALL export a `plug()` factory function that accepts a configuration object and returns a Plug instance. The configuration SHALL accept: `baseUrl` (string), `auth` (AuthStrategy, optional), `retry` (retry config or false, optional), `timeout` (number in ms, optional), `defaultHeaders` (Record<string, string>, optional), `pagination` (PaginationStrategy, optional), `hooks` (PlugHooks, optional), and `parsers` (Record<string, (text: string) => unknown>, optional). Rate limit handling is built into the retry logic via 429/Retry-After support rather than a separate config field.

#### Scenario: Create a basic plug
- **WHEN** a user calls `plug({ baseUrl: 'https://api.example.com' })`
- **THEN** the function SHALL return a Plug instance configured with the given base URL
- **AND** the instance SHALL have `get`, `post`, `put`, `patch`, `delete`, `request`, `paginate`, `with`, and `withAuth` methods

#### Scenario: Create a plug with all options
- **WHEN** a user calls `plug({ baseUrl, auth: bearer('token'), retry: { attempts: 3 }, timeout: 30000, defaultHeaders: { 'X-Custom': 'value' }, parsers: { 'application/xml': parseXml } })`
- **THEN** the Plug instance SHALL apply all configured options to every request

### Requirement: HTTP methods
The Plug instance SHALL provide typed HTTP methods: `get<T>()`, `post<T>()`, `put<T>()`, `patch<T>()`, `delete<T>()`. Each method SHALL accept a path (string) and an optional options object with `params` (query parameters), `body` (request body for POST/PUT/PATCH), `headers` (per-request headers), and `signal` (AbortSignal).

#### Scenario: GET request
- **WHEN** a user calls `plug.get<{ id: string }>('/users/123')`
- **THEN** the Plug SHALL make a GET request to `{baseUrl}/users/123`
- **AND** the response SHALL be typed as `{ id: string }`

#### Scenario: POST request with body
- **WHEN** a user calls `plug.post('/users', { body: { name: 'Alice' } })`
- **THEN** the Plug SHALL make a POST request with JSON body `{"name":"Alice"}`
- **AND** the request SHALL include `Content-Type: application/json` header

#### Scenario: Request with query parameters
- **WHEN** a user calls `plug.get('/users', { params: { page: 1, limit: 10 } })`
- **THEN** the Plug SHALL append `?page=1&limit=10` to the request URL

#### Scenario: Request with per-request headers
- **WHEN** a user calls `plug.get('/users', { headers: { 'X-Request-Id': 'abc' } })`
- **THEN** the per-request headers SHALL be merged with default headers, with per-request headers taking precedence

### Requirement: Auth strategy — bearer
The scaffolded file SHALL export a `bearer()` function that accepts a token (string) or a token function (() => string | Promise<string>). It SHALL set the `Authorization: Bearer <token>` header on every request.

#### Scenario: Static bearer token
- **WHEN** a plug is created with `auth: bearer('sk_live_123')`
- **THEN** every request SHALL include the header `Authorization: Bearer sk_live_123`

#### Scenario: Dynamic bearer token
- **WHEN** a plug is created with `auth: bearer(() => getTokenFromVault())`
- **THEN** the function SHALL be called before each request to get a fresh token

### Requirement: Auth strategy — basic
The scaffolded file SHALL export a `basic()` function that accepts username and password strings. It SHALL set the `Authorization: Basic <base64(user:pass)>` header.

#### Scenario: Basic auth
- **WHEN** a plug is created with `auth: basic('user', 'pass')`
- **THEN** every request SHALL include the header `Authorization: Basic dXNlcjpwYXNz`

### Requirement: Auth strategy — apiKey
The scaffolded file SHALL export an `apiKey()` function that accepts a header name and value. By default it sets a custom header. With `{ in: 'query' }`, it appends the key as a query parameter instead.

#### Scenario: API key in header
- **WHEN** a plug is created with `auth: apiKey('X-API-Key', 'key_123')`
- **THEN** every request SHALL include the header `X-API-Key: key_123`

#### Scenario: API key in query string
- **WHEN** a plug is created with `auth: apiKey('api_key', 'key_123', { in: 'query' })`
- **THEN** every request URL SHALL include the query parameter `api_key=key_123`

### Requirement: Auth strategy — custom
The scaffolded file SHALL export a `custom()` auth function that accepts a function `(headers: Headers) => void | Promise<void>`. This allows users to implement any auth scheme.

#### Scenario: Custom auth
- **WHEN** a plug is created with `auth: custom((headers) => { headers.set('X-Signature', sign(payload)) })`
- **THEN** the custom function SHALL be called before each request with the request headers

### Requirement: Runtime auth switching
The Plug instance SHALL provide a `withAuth(strategy)` method that returns a new Plug instance with the given auth strategy, preserving all other configuration.

#### Scenario: Switch auth for multi-tenant
- **WHEN** a user calls `const tenantPlug = plug.withAuth(bearer(tenantToken))`
- **THEN** `tenantPlug` SHALL use the new auth strategy
- **AND** the original plug SHALL be unchanged

### Requirement: Retry with exponential backoff
The Plug SHALL retry failed requests using exponential backoff with jitter. The default retry config SHALL be: 3 attempts, exponential backoff starting at 1 second, with jitter. Retryable conditions: network errors, 408, 429, 500, 502, 503, 504 status codes.

#### Scenario: Retry on 500
- **WHEN** a request returns HTTP 500 and retry is configured with 3 attempts
- **THEN** the Plug SHALL retry up to 2 more times with exponential backoff
- **AND** if all retries fail, the Plug SHALL throw the last error

#### Scenario: Retry on 429 with Retry-After header
- **WHEN** a request returns HTTP 429 with a `Retry-After: 2` header
- **THEN** the Plug SHALL wait at least 2 seconds before retrying
- **AND** the Retry-After value SHALL take precedence over calculated backoff

#### Scenario: Retry disabled
- **WHEN** a plug is created with `retry: false`
- **THEN** the Plug SHALL NOT retry any failed request

### Requirement: Timeout
The Plug SHALL support request timeouts. When `timeout` is configured, each request (including each retry attempt) SHALL be aborted if it exceeds the timeout duration.

#### Scenario: Request times out
- **WHEN** a request exceeds the configured timeout
- **THEN** the Plug SHALL abort the request and throw a timeout error

### Requirement: Pagination — cursor
The scaffolded file SHALL export a `cursorPagination()` function that accepts configuration: `cursorParam` (query param name for the cursor), `cursorPath` (dot-path to next cursor in response), `dataPath` (dot-path to data array in response).

#### Scenario: Paginate with cursor
- **WHEN** a user calls `for await (const page of plug.paginate<Item>('/items'))` with cursor pagination configured
- **THEN** the Plug SHALL fetch the first page, extract the next cursor from the response, and continue fetching until the cursor is null/undefined/empty

### Requirement: Pagination — offset
The scaffolded file SHALL export an `offsetPagination()` function that accepts configuration: `limitParam` (default `'limit'`), `offsetParam` (default `'offset'`), `dataPath` (dot-path to data array), `pageSize` (number).

#### Scenario: Paginate with offset
- **WHEN** a user calls `plug.paginate<Item>('/items')` with offset pagination configured
- **THEN** the Plug SHALL increment the offset by pageSize on each request until a page returns fewer items than pageSize

### Requirement: Pagination — keyset
The scaffolded file SHALL export a `keysetPagination()` function that accepts configuration: `param` (query param name, e.g., `'starting_after'`), `idField` (field name to use as cursor from last item), `dataPath` (dot-path to data array).

#### Scenario: Paginate with keyset (Stripe-style)
- **WHEN** a user calls `plug.paginate<Item>('/items')` with keyset pagination configured with `param: 'starting_after'` and `idField: 'id'`
- **THEN** the Plug SHALL use the `id` of the last item in each page as the `starting_after` parameter for the next request

### Requirement: Paginate method returns async iterable
The `plug.paginate<T>(path, options?)` method SHALL return an `AsyncIterable<T[]>` where each yielded value is one page of results (an array of items).

#### Scenario: Consume pages with for-await
- **WHEN** a user writes `for await (const page of plug.paginate<Item>('/items'))`
- **THEN** each `page` SHALL be an array of items from one API response

### Requirement: Rate limit handling
The Plug SHALL handle rate limiting by respecting `Retry-After` headers on 429 responses. When a 429 is received, the Plug SHALL wait for the specified duration before retrying (this integrates with the retry logic).

#### Scenario: Rate limited with Retry-After
- **WHEN** a request returns 429 with `Retry-After: 5`
- **THEN** the Plug SHALL wait at least 5 seconds before the next retry attempt

### Requirement: Error handling
The Plug SHALL throw a `PlugError` (or similar) that includes the HTTP status code, status text, response body (when available), and the original request URL and method. This error SHALL extend `Error`.

#### Scenario: Non-retryable error
- **WHEN** a request returns HTTP 404
- **THEN** the Plug SHALL throw an error with `status: 404`, `statusText: 'Not Found'`, the response body, and the request URL

#### Scenario: Network error
- **WHEN** a request fails due to a network error (DNS failure, connection refused)
- **THEN** the Plug SHALL retry per the retry config and eventually throw with the original error cause

### Requirement: baseUrl and authType getters
The Plug class SHALL expose `baseUrl` and `authType` as public getters so that the khotan factory can extract configuration metadata from the instance.

#### Scenario: Read baseUrl from Plug instance
- **WHEN** a Plug is created with `plug({ baseUrl: "https://api.example.com" })`
- **THEN** `instance.baseUrl` SHALL return `"https://api.example.com"`

#### Scenario: Read authType from Plug instance with auth
- **WHEN** a Plug is created with `plug({ baseUrl: "...", auth: bearer("token") })`
- **THEN** `instance.authType` SHALL return `"bearer"`

#### Scenario: Read authType from Plug instance without auth
- **WHEN** a Plug is created with `plug({ baseUrl: "..." })` (no auth configured)
- **THEN** `instance.authType` SHALL return `"none"`

### Requirement: Content-type parsers
The scaffolded `plug.ts` SHALL support an optional `parsers` field in `PlugConfig` — a record mapping MIME type substrings to parser functions. When a response's Content-Type matches a registered parser, the Plug SHALL use that parser instead of the default text fallback.

#### Scenario: XML response with registered parser
- **WHEN** a Plug is configured with `parsers: { "application/xml": parseXml }` and the API returns a response with `Content-Type: application/xml`
- **THEN** the Plug SHALL call `parseXml(responseText)` and return the result

#### Scenario: Multiple parsers registered
- **WHEN** a Plug is configured with parsers for `application/xml` and `text/csv`
- **THEN** each response SHALL be parsed by the first matching parser based on Content-Type

#### Scenario: No matching parser falls back to text
- **WHEN** a response has a Content-Type that does not match `application/json` or any registered parser
- **THEN** the Plug SHALL return the raw response text (existing behavior)

#### Scenario: JSON still handled by default
- **WHEN** a response has `Content-Type: application/json` and parsers are configured
- **THEN** the Plug SHALL use `response.json()` as before (JSON parsing is built-in, not affected by custom parsers)

### Requirement: Factory PlugRegistration accepts Plug instance
The `PlugRegistration` interface SHALL require a `plug` field containing an object with `baseUrl: string` and `authType: string` (satisfied by any Plug instance). The factory SHALL extract these values for database upserts.

#### Scenario: Register plug with instance
- **WHEN** a user registers `{ name: "cin7", plug: cin7Plug, flows: [...] }`
- **THEN** the factory SHALL call `adapter.upsertPlug({ name: "cin7", baseUrl: cin7Plug.baseUrl, authType: cin7Plug.authType })`

#### Scenario: No metadata-only registration
- **WHEN** a user attempts to register a plug without a `plug` instance
- **THEN** TypeScript SHALL report a compile error (the field is required)
