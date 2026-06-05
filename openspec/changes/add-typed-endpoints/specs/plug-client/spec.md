## ADDED Requirements

### Requirement: createPlugClient adapter function
The `khotan-data/plug` subpath export SHALL provide a `createPlugClient()` function that accepts a ts-rest contract and a Plug instance, and returns a typed client object where each contract endpoint is a callable async function.

#### Scenario: Create a typed client from contract and plug
- **WHEN** a user calls `createPlugClient(contract, plugInstance)`
- **THEN** the function SHALL return an object with one async function per endpoint defined in the contract
- **AND** each function name SHALL match the endpoint key in the contract

#### Scenario: Endpoint function has correct return type
- **WHEN** a user calls `client.getProduct({ params: { id: "123" } })`
- **THEN** the return type SHALL be inferred from the contract's response Zod schema (e.g., `z.infer<typeof responseSchema>`)

#### Scenario: Endpoint function has correct input type
- **WHEN** a contract endpoint defines `params`, `query`, or `body` schemas
- **THEN** the corresponding client function SHALL require those fields in its input argument with types inferred from the Zod schemas

### Requirement: Path parameter interpolation
The adapter SHALL interpolate path parameters from the `:param` syntax in the contract's path using the provided `params` object.

#### Scenario: Single path parameter
- **WHEN** a contract defines `path: "/products/:id"` and the user calls `client.getProduct({ params: { id: "abc" } })`
- **THEN** the adapter SHALL make a request to `{baseUrl}/products/abc`

#### Scenario: Multiple path parameters
- **WHEN** a contract defines `path: "/products/:productId/variants/:variantId"` and the user provides `{ params: { productId: "p1", variantId: "v2" } }`
- **THEN** the adapter SHALL make a request to `{baseUrl}/products/p1/variants/v2`

#### Scenario: Missing path parameter
- **WHEN** a contract defines `path: "/products/:id"` and the user omits the `id` param
- **THEN** TypeScript SHALL report a compile error (enforced by ts-rest's type inference)

### Requirement: Query parameter forwarding
The adapter SHALL pass `query` fields as query parameters on GET requests (and other methods when specified).

#### Scenario: Query params on GET
- **WHEN** a user calls `client.listProducts({ query: { page: 1, limit: 50 } })`
- **THEN** the adapter SHALL pass `{ page: 1, limit: 50 }` as the `params` option to `plug.request()`

#### Scenario: No query params
- **WHEN** an endpoint defines no `query` schema and the user calls `client.listProducts()`
- **THEN** the adapter SHALL make the request without query parameters

### Requirement: Request body forwarding
The adapter SHALL pass the `body` field as the request body for POST, PUT, PATCH, and DELETE methods.

#### Scenario: POST with body
- **WHEN** a user calls `client.createProduct({ body: { name: "Widget", price: 10 } })`
- **THEN** the adapter SHALL pass the body object to `plug.request("POST", path, { body: ... })`

#### Scenario: Body validation before request
- **WHEN** a contract endpoint defines a body Zod schema and the user provides an invalid body
- **THEN** the adapter SHALL throw a Zod validation error before making the HTTP request

### Requirement: Request input validation
The adapter SHALL validate all request inputs (params, query, body) against their respective Zod schemas before making the HTTP request.

#### Scenario: Invalid query param
- **WHEN** a contract defines `query: z.object({ page: z.number() })` and the user passes `{ query: { page: "abc" } }`
- **THEN** the adapter SHALL throw a ZodError without making an HTTP request

#### Scenario: Valid input passes through
- **WHEN** all input fields pass Zod validation
- **THEN** the adapter SHALL proceed to make the HTTP request

### Requirement: Response validation
The adapter SHALL validate the HTTP response against the contract's response Zod schema and return the validated, typed result.

#### Scenario: Valid response
- **WHEN** the API returns JSON matching the response schema
- **THEN** the adapter SHALL return the parsed and validated object with the inferred type

#### Scenario: Invalid response shape
- **WHEN** the API returns JSON that does not match the response schema (missing required fields)
- **THEN** the adapter SHALL throw a ZodError

#### Scenario: Response strips unknown fields
- **WHEN** the API returns extra fields not in the response schema
- **THEN** the adapter SHALL strip unknown fields (Zod default behavior) and return only schema-defined fields

#### Scenario: Skip response validation
- **WHEN** a user passes `{ validateResponse: false }` as an option to the client function
- **THEN** the adapter SHALL skip response Zod validation and return the raw parsed response

### Requirement: Delegates to Plug execution layer
The adapter SHALL delegate all HTTP execution to the provided Plug instance, inheriting its auth, retry, timeout, hooks, and pagination configuration.

#### Scenario: Auth headers applied
- **WHEN** the Plug instance is configured with `auth: bearer("token")`
- **THEN** requests made through `createPlugClient` SHALL include the `Authorization: Bearer token` header

#### Scenario: Retry logic applies
- **WHEN** the Plug instance is configured with retry and the API returns 500
- **THEN** the adapter SHALL retry per the Plug's retry configuration

#### Scenario: Timeout applies
- **WHEN** the Plug instance is configured with a timeout
- **THEN** requests made through the adapter SHALL respect that timeout

### Requirement: Status-code-aware responses
The adapter SHALL support ts-rest's status-code-discriminated response types, returning the result with a `status` and `body` field.

#### Scenario: Successful response with status
- **WHEN** the API returns HTTP 200 and the contract defines `responses: { 200: schema }`
- **THEN** the adapter SHALL return `{ status: 200, body: <validated data> }`

#### Scenario: Error response with status
- **WHEN** the API returns HTTP 404 and the contract defines `responses: { 404: errorSchema }`
- **THEN** the adapter SHALL return `{ status: 404, body: <validated error data> }`
- **AND** the adapter SHALL NOT throw a PlugError for status codes defined in the contract's responses

#### Scenario: Undefined status code
- **WHEN** the API returns a status code not defined in the contract's responses
- **THEN** the adapter SHALL throw a PlugError as normal (existing Plug behavior)

### Requirement: Subpath export
The `khotan-data` package SHALL expose a `khotan-data/plug` subpath export that provides `createPlugClient`.

#### Scenario: Import from subpath
- **WHEN** a user writes `import { createPlugClient } from "khotan-data/plug"`
- **THEN** the function SHALL be available and correctly typed

### Requirement: Per-request headers
The adapter SHALL forward per-request `headers` from the call arguments to the Plug's request.

#### Scenario: Custom headers on single request
- **WHEN** a user calls `client.getProduct({ params: { id: "123" }, headers: { "X-Request-Id": "abc" } })`
- **THEN** the adapter SHALL include `X-Request-Id: abc` in the request headers
