## MODIFIED Requirements

### Requirement: Factory handler routes
The factory handler SHALL include a debug proxy route at `POST /api/khotan/debug/:plugName` that is only active when `KHOTAN_DEBUG_LOGS` environment variable is truthy. The route proxies requests through the registered plug and returns structured response data including status, headers, body, and timing.

#### Scenario: Debug route registered when env var enabled
- **WHEN** `KHOTAN_DEBUG_LOGS` is set and the factory handler receives `POST /api/khotan/debug/:plugName`
- **THEN** the handler routes to the debug proxy logic

#### Scenario: Debug route hidden when env var disabled
- **WHEN** `KHOTAN_DEBUG_LOGS` is not set and the factory handler receives `POST /api/khotan/debug/:plugName`
- **THEN** the handler returns 404
