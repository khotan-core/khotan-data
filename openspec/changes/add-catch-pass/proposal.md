## Why

Wire registers webhook subscriptions and verifies inbound events, but there is no component for *processing* those events once verified. Users currently write ad-hoc route handlers that log events and go nowhere. Catch and Pass complete the inbound webhook pipeline — durable event processing powered by Vercel Workflow, with the same scaffolded-template DX as Plug and Wire.

## What Changes

- Add `catchEvent()` builder function and scaffolded template for persisting verified webhook events to Postgres via a durable workflow step
- Add `pass()` builder function and scaffolded template for forwarding verified webhook events to another service via a durable workflow step
- Extend the factory to accept `catches` and `passes` on plug registrations
- Add a new `POST /webhook/:plugName` route in the factory handler that verifies via Wire's `onVerify`, then starts catch/pass workflows
- Wire's existing `onVerify` hook (currently defined but unused) becomes the verification entry point for inbound webhooks
- Add `catch` and `pass` to the CLI registry as scaffold-able components

## Capabilities

### New Capabilities
- `catch`: Builder function, types, and scaffolded template for catching webhook events and persisting them to Postgres via a Vercel Workflow step
- `pass`: Builder function, types, and scaffolded template for passing webhook events through to another service via a Vercel Workflow step

### Modified Capabilities
- `factory`: Accept `catches`/`passes` in plug config; add `POST /webhook/:plugName` route; call Wire's `onVerify`; start workflows via `workflow/api`
- `wire`: Wire's `onVerify` hook is now called by the factory's webhook route for inbound event verification
- `registry`: Add `catch` and `pass` component entries

## Impact

- **Factory** (`src/factory.ts`): New route handler, new config types, `workflow/api` integration
- **Wire spec**: `onVerify` transitions from optional/unused to actively invoked by factory
- **CLI registry** (`src/cli/registry.ts`): Two new component entries
- **Templates** (`src/cli/templates/`): New `catch.ts` and `pass.ts` template files
- **Dependencies**: `workflow` (Vercel Workflow) becomes a peer dependency for `start()`
- **Test app**: Needs Vercel Workflow DevKit setup, new catch/pass workflow files, `onVerify` on existing wire
