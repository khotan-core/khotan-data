## MODIFIED Requirements

### Requirement: onVerify hook (optional)
The optional `onVerify` hook SHALL receive a `WireVerifyContext` with: `headers` (Record<string, string> — incoming request headers), `body` (string — raw request body as text), and `wireVars` (Record<string, string> — stored wire-specific vars including signing secrets). It SHALL return a boolean indicating signature validity.

#### Scenario: Verify incoming webhook
- **WHEN** a webhook request arrives and `onVerify` is defined
- **THEN** the hook SHALL receive the headers and raw body for signature verification
- **AND** return `true` if valid, `false` otherwise

#### Scenario: onVerify receives wireVars with stored secrets
- **WHEN** the factory calls `onVerify` for a plug whose wire stored a `webhookSecret` via `setWireVars`
- **THEN** `wireVars` SHALL contain the decrypted `webhookSecret` value

#### Scenario: onVerify is required when catches or passes exist
- **WHEN** a plug has catches or passes registered
- **THEN** the wire MUST define `onVerify` — the factory SHALL enforce this at configuration time
