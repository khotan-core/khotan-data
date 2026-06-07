## MODIFIED Requirements

### Requirement: Plug factory function
The scaffolded `plug.ts` SHALL export a `plug()` factory function that accepts a configuration object and returns a Plug instance. The configuration SHALL accept: `baseUrl` (string), `auth` (AuthStrategy, optional), `retry` (retry config or false, optional), `timeout` (number in ms, optional), `defaultHeaders` (Record<string, string>, optional), `pagination` (PaginationStrategy, optional), `hooks` (PlugHooks, optional), and `parsers` (Record<string, (text: string) => unknown>, optional). Rate limit handling is built into the retry logic via 429/Retry-After support rather than a separate config field.

#### Scenario: Create a basic plug
- **WHEN** a user calls `plug({ baseUrl: 'https://api.example.com' })`
- **THEN** the function SHALL return a Plug instance configured with the given base URL
- **AND** the instance SHALL have `get`, `post`, `put`, `patch`, `delete`, `request`, `paginate`, `with`, and `withAuth` methods

#### Scenario: Create a plug with all options
- **WHEN** a user calls `plug({ baseUrl, auth: bearer('token'), retry: { attempts: 3 }, timeout: 30000, defaultHeaders: { 'X-Custom': 'value' }, parsers: { 'application/xml': parseXml } })`
- **THEN** the Plug instance SHALL apply all configured options to every request

## ADDED Requirements

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
- **WHEN** a user registers `{ name: "cin7", plug: cin7Plug, syncs: [...] }`
- **THEN** the factory SHALL call `adapter.upsertPlug({ name: "cin7", baseUrl: cin7Plug.baseUrl, authType: cin7Plug.authType })`

#### Scenario: No metadata-only registration
- **WHEN** a user attempts to register a plug without a `plug` instance
- **THEN** TypeScript SHALL report a compile error (the field is required)
