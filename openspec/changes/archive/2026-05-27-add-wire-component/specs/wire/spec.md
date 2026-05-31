## ADDED Requirements

### Requirement: Wire factory function
The scaffolded `wire.ts` SHALL export a `wire()` factory function that accepts a configuration object and returns a Wire instance. The configuration SHALL accept: `baseUrl` (string), `auth` (AuthStrategy, optional), `retry` (retry config or false, optional), `timeout` (number in ms, optional), `defaultHeaders` (Record<string, string>, optional), and `pagination` (PaginationStrategy, optional). Rate limit handling is built into the retry logic via 429/Retry-After support rather than a separate config field.

#### Scenario: Create a basic wire
- **WHEN** a user calls `wire({ baseUrl: 'https://api.example.com' })`
- **THEN** the function SHALL return a Wire instance configured with the given base URL
- **AND** the instance SHALL have `get`, `post`, `put`, `patch`, `delete`, `request`, `paginate`, and `withAuth` methods

#### Scenario: Create a wire with all options
- **WHEN** a user calls `wire({ baseUrl, auth: bearer('token'), retry: { attempts: 3 }, timeout: 30000, defaultHeaders: { 'X-Custom': 'value' } })`
- **THEN** the Wire instance SHALL apply all configured options to every request

### Requirement: HTTP methods
The Wire instance SHALL provide typed HTTP methods: `get<T>()`, `post<T>()`, `put<T>()`, `patch<T>()`, `delete<T>()`. Each method SHALL accept a path (string) and an optional options object with `params` (query parameters), `body` (request body for POST/PUT/PATCH), `headers` (per-request headers), and `signal` (AbortSignal).

#### Scenario: GET request
- **WHEN** a user calls `wire.get<{ id: string }>('/users/123')`
- **THEN** the Wire SHALL make a GET request to `{baseUrl}/users/123`
- **AND** the response SHALL be typed as `{ id: string }`

#### Scenario: POST request with body
- **WHEN** a user calls `wire.post('/users', { body: { name: 'Alice' } })`
- **THEN** the Wire SHALL make a POST request with JSON body `{"name":"Alice"}`
- **AND** the request SHALL include `Content-Type: application/json` header

#### Scenario: Request with query parameters
- **WHEN** a user calls `wire.get('/users', { params: { page: 1, limit: 10 } })`
- **THEN** the Wire SHALL append `?page=1&limit=10` to the request URL

#### Scenario: Request with per-request headers
- **WHEN** a user calls `wire.get('/users', { headers: { 'X-Request-Id': 'abc' } })`
- **THEN** the per-request headers SHALL be merged with default headers, with per-request headers taking precedence

### Requirement: Auth strategy — bearer
The scaffolded file SHALL export a `bearer()` function that accepts a token (string) or a token function (() => string | Promise<string>). It SHALL set the `Authorization: Bearer <token>` header on every request.

#### Scenario: Static bearer token
- **WHEN** a wire is created with `auth: bearer('sk_live_123')`
- **THEN** every request SHALL include the header `Authorization: Bearer sk_live_123`

#### Scenario: Dynamic bearer token
- **WHEN** a wire is created with `auth: bearer(() => getTokenFromVault())`
- **THEN** the function SHALL be called before each request to get a fresh token

### Requirement: Auth strategy — basic
The scaffolded file SHALL export a `basic()` function that accepts username and password strings. It SHALL set the `Authorization: Basic <base64(user:pass)>` header.

#### Scenario: Basic auth
- **WHEN** a wire is created with `auth: basic('user', 'pass')`
- **THEN** every request SHALL include the header `Authorization: Basic dXNlcjpwYXNz`

### Requirement: Auth strategy — apiKey
The scaffolded file SHALL export an `apiKey()` function that accepts a header name and value. By default it sets a custom header. With `{ in: 'query' }`, it appends the key as a query parameter instead.

#### Scenario: API key in header
- **WHEN** a wire is created with `auth: apiKey('X-API-Key', 'key_123')`
- **THEN** every request SHALL include the header `X-API-Key: key_123`

#### Scenario: API key in query string
- **WHEN** a wire is created with `auth: apiKey('api_key', 'key_123', { in: 'query' })`
- **THEN** every request URL SHALL include the query parameter `api_key=key_123`

### Requirement: Auth strategy — custom
The scaffolded file SHALL export a `custom()` auth function that accepts a function `(headers: Headers) => void | Promise<void>`. This allows users to implement any auth scheme.

#### Scenario: Custom auth
- **WHEN** a wire is created with `auth: custom((headers) => { headers.set('X-Signature', sign(payload)) })`
- **THEN** the custom function SHALL be called before each request with the request headers

### Requirement: Runtime auth switching
The Wire instance SHALL provide a `withAuth(strategy)` method that returns a new Wire instance with the given auth strategy, preserving all other configuration.

#### Scenario: Switch auth for multi-tenant
- **WHEN** a user calls `const tenantWire = wire.withAuth(bearer(tenantToken))`
- **THEN** `tenantWire` SHALL use the new auth strategy
- **AND** the original wire SHALL be unchanged

### Requirement: Retry with exponential backoff
The Wire SHALL retry failed requests using exponential backoff with jitter. The default retry config SHALL be: 3 attempts, exponential backoff starting at 1 second, with jitter. Retryable conditions: network errors, 408, 429, 500, 502, 503, 504 status codes.

#### Scenario: Retry on 500
- **WHEN** a request returns HTTP 500 and retry is configured with 3 attempts
- **THEN** the Wire SHALL retry up to 2 more times with exponential backoff
- **AND** if all retries fail, the Wire SHALL throw the last error

#### Scenario: Retry on 429 with Retry-After header
- **WHEN** a request returns HTTP 429 with a `Retry-After: 2` header
- **THEN** the Wire SHALL wait at least 2 seconds before retrying
- **AND** the Retry-After value SHALL take precedence over calculated backoff

#### Scenario: Retry disabled
- **WHEN** a wire is created with `retry: false`
- **THEN** the Wire SHALL NOT retry any failed request

### Requirement: Timeout
The Wire SHALL support request timeouts. When `timeout` is configured, each request (including each retry attempt) SHALL be aborted if it exceeds the timeout duration.

#### Scenario: Request times out
- **WHEN** a request exceeds the configured timeout
- **THEN** the Wire SHALL abort the request and throw a timeout error

### Requirement: Pagination — cursor
The scaffolded file SHALL export a `cursorPagination()` function that accepts configuration: `cursorParam` (query param name for the cursor), `cursorPath` (dot-path to next cursor in response), `dataPath` (dot-path to data array in response).

#### Scenario: Paginate with cursor
- **WHEN** a user calls `for await (const page of wire.paginate<Item>('/items'))` with cursor pagination configured
- **THEN** the Wire SHALL fetch the first page, extract the next cursor from the response, and continue fetching until the cursor is null/undefined/empty

### Requirement: Pagination — offset
The scaffolded file SHALL export an `offsetPagination()` function that accepts configuration: `limitParam` (default `'limit'`), `offsetParam` (default `'offset'`), `dataPath` (dot-path to data array), `pageSize` (number).

#### Scenario: Paginate with offset
- **WHEN** a user calls `wire.paginate<Item>('/items')` with offset pagination configured
- **THEN** the Wire SHALL increment the offset by pageSize on each request until a page returns fewer items than pageSize

### Requirement: Pagination — keyset
The scaffolded file SHALL export a `keysetPagination()` function that accepts configuration: `param` (query param name, e.g., `'starting_after'`), `idField` (field name to use as cursor from last item), `dataPath` (dot-path to data array).

#### Scenario: Paginate with keyset (Stripe-style)
- **WHEN** a user calls `wire.paginate<Item>('/items')` with keyset pagination configured with `param: 'starting_after'` and `idField: 'id'`
- **THEN** the Wire SHALL use the `id` of the last item in each page as the `starting_after` parameter for the next request

### Requirement: Paginate method returns async iterable
The `wire.paginate<T>(path, options?)` method SHALL return an `AsyncIterable<T[]>` where each yielded value is one page of results (an array of items).

#### Scenario: Consume pages with for-await
- **WHEN** a user writes `for await (const page of wire.paginate<Item>('/items'))`
- **THEN** each `page` SHALL be an array of items from one API response

### Requirement: Rate limit handling
The Wire SHALL handle rate limiting by respecting `Retry-After` headers on 429 responses. When a 429 is received, the Wire SHALL wait for the specified duration before retrying (this integrates with the retry logic).

#### Scenario: Rate limited with Retry-After
- **WHEN** a request returns 429 with `Retry-After: 5`
- **THEN** the Wire SHALL wait at least 5 seconds before the next retry attempt

### Requirement: Error handling
The Wire SHALL throw a `WireError` (or similar) that includes the HTTP status code, status text, response body (when available), and the original request URL and method. This error SHALL extend `Error`.

#### Scenario: Non-retryable error
- **WHEN** a request returns HTTP 404
- **THEN** the Wire SHALL throw an error with `status: 404`, `statusText: 'Not Found'`, the response body, and the request URL

#### Scenario: Network error
- **WHEN** a request fails due to a network error (DNS failure, connection refused)
- **THEN** the Wire SHALL retry per the retry config and eventually throw with the original error cause
