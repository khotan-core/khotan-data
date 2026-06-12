## Context

Wire currently registers webhook subscriptions with external services and stores subscription state (remoteId, webhookSecret) in the database. When an event arrives, there is no factory-level handling — users write standalone route handlers that manually verify and log. The `onVerify` hook exists on Wire's type definition but is never called by the factory.

Vercel Workflow is the target runtime for durable processing. The user already uses Workflow for webhook processing in their projects. Catch and Pass should be "workflow-native by default."

## Goals / Non-Goals

**Goals:**
- Catch and Pass handlers execute as durable Vercel Workflow steps (retryable, observable, crash-safe)
- Factory verifies inbound webhooks synchronously (via Wire's `onVerify`), starts workflows, returns 200 immediately
- Builder functions (`catchEvent`, `pass`) provide type-safe DX and extensibility for future enhancements
- Scaffolded templates follow the same zero-runtime-dependency pattern as Plug and Wire
- Fan-out: all registered catches and passes fire for every verified event

**Non-Goals:**
- Dry-run mode (future enhancement)
- Event filtering at the framework level (users filter in their handler)
- Run tracking in `khotan_runs` (future — workflows have their own observability)
- Generic webhook routing without Wire (Wire subscription is a prerequisite)

## Decisions

### Decision 1: Verify sync, process async via Workflow

The factory's `POST /webhook/:plugName` route:
1. Reads raw body (before JSON parse, needed for signature verification)
2. Looks up active wire for the plug → retrieves stored wireVars
3. Calls `wire.onVerify(headers, rawBody, wireVars)` — synchronous check
4. If invalid → 401; if valid → `start()` catch/pass workflows, return 200

**Why**: External services expect fast acknowledgement (< 5s). Durable processing decouples receipt from handling. Retries are free via Workflow steps.

**Alternative considered**: Process inline in the route handler (simpler, but no durability/retry; timeouts kill long handlers).

### Decision 2: Builder functions wrap workflow functions

```typescript
export const pollinateCatch = catchEvent(pollinateCatchWorkflow);
export const pollinateToSlack = pass({ to: "slack", workflow: pollinateToSlackWorkflow });
```

The builder provides:
- Type contract for workflow function signature
- Metadata carrier (`to` for pass, future: `retries`, `deduplicate`, `filter`)
- Registration object the factory can introspect

The workflow function itself contains `"use workflow"` / `"use step"` directives — these are compile-time and must be written by the user.

**Why**: Builders are extensible. Today they're thin; tomorrow they carry config that shapes factory behavior without touching the workflow code.

**Alternative considered**: Raw workflow functions without builders (simpler, but no metadata slot and harder to extend).

### Decision 3: Serialization boundary — pass plain data to workflows

Workflow arguments must be serializable. The factory passes:
- Catches: `{ event, eventType, headers }` — all plain JSON
- Passes: `{ event, eventType, headers, destVars }` — includes serialized destination plug credentials

Step functions import their own `db` and construct destination plugs from passed vars. The factory reads dest plug vars from DB before starting the workflow.

**Why**: Workflow runtime constraint. Class instances (Plug, DB connection) cannot cross the boundary.

**Alternative considered**: Passing a "plug factory function" — not possible due to serialization.

### Decision 4: Catches and passes register on the source plug

```typescript
plugs: [{
  name: "pollinate",
  plug: pollinatePlug,
  wires: [pollinateWire],
  catches: [pollinateCatch],
  passes: [pollinateToSlack],
}]
```

Everything related to "events from pollinate" lives on the pollinate plug config.

**Why**: Matches Wire's registration pattern. The source plug is the natural grouping — it owns the subscription, the verification, and the event processing.

### Decision 5: Wire onVerify becomes required for webhook receipt

If a plug has catches/passes but its wire has no `onVerify`, the factory rejects inbound webhooks with 500 (misconfiguration). Verification is not optional when processing events.

**Why**: Security. Unverified webhooks should never trigger durable processing. Forces the user to implement verification.

**Alternative considered**: Skip verification if `onVerify` is undefined (insecure, bad default).

### Decision 6: Templates are self-contained (zero khotan-data runtime imports)

Like Plug and Wire, the scaffolded `catch.ts` and `pass.ts` are type-only builders with no runtime import from `khotan-data`. They import from sibling files (e.g., `../wires/wire` for the BoundPlug type if needed).

**Why**: Consistency with existing pattern. User owns the code, no version coupling.

### Decision 7: `workflow/api` as peer dependency

The factory calls `start()` from `workflow/api` to launch catch/pass workflows. This is a peer dependency of `khotan-data` — the user's project must have Vercel Workflow installed.

**Why**: The factory (in the npm package) needs to start workflows defined in the user's project. Peer dep ensures the user controls the version.

## Risks / Trade-offs

- **Workflow not installed** → Factory throws a clear error at config validation time if catches/passes are registered but `workflow/api` is not resolvable. Mitigation: error message links to setup docs.
- **Local dev without Workflow DevKit** → `start()` may not work locally without the Workflow dev server. Mitigation: document that `npx workflow dev` must run alongside `next dev`, or provide a sync fallback mode later.
- **onVerify required** → Existing wires without `onVerify` will break if catches/passes are added. Mitigation: factory validates at config time and throws descriptive error.
- **Serialization limits Pass DX** → Users must reconstruct destination plugs inside steps from plain vars. Mitigation: scaffolded template shows the pattern clearly; future enhancement could auto-generate step boilerplate.
