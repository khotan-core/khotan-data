## ADDED Requirements

### Requirement: Catch component registry entry
The CLI registry SHALL include a `catch` component with name "catch", description indicating webhook event catching, file output to `webhooks/catch.ts`, and `requires: ["wire"]`.

#### Scenario: Add catch component
- **WHEN** a user runs `npx khotan add catch`
- **THEN** the CLI SHALL scaffold `catch.ts` to `{outputDir}/webhooks/catch.ts`
- **AND** print post-install guidance showing how to create a catch workflow and register it

#### Scenario: Catch listed in available components
- **WHEN** a user runs `npx khotan add` without arguments
- **THEN** the catch component SHALL appear in the list of available components

### Requirement: Pass component registry entry
The CLI registry SHALL include a `pass` component with name "pass", description indicating webhook event forwarding, file output to `webhooks/pass.ts`, and `requires: ["wire", "plug"]`.

#### Scenario: Add pass component
- **WHEN** a user runs `npx khotan add pass`
- **THEN** the CLI SHALL scaffold `pass.ts` to `{outputDir}/webhooks/pass.ts`
- **AND** print post-install guidance showing how to create a pass workflow and register it

#### Scenario: Pass listed in available components
- **WHEN** a user runs `npx khotan add pass` without arguments
- **THEN** the pass component SHALL appear in the list of available components
