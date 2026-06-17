# khotan-data

## 0.4.1

### Patch Changes

- Replace the positional segment router (`segments.indexOf(...)`) with a declarative route table. Routes are now `{ method, pattern, auth, handler }` entries matched against named params (`:plugName`, `:flowId`, etc.), eliminating collision-prone `indexOf` checks where a cache key or mapping value named `plugs` could mis-route.

- Centralize the auth gate as route metadata. Each route declares its auth type (`authorize`, `webhook`, `cron`, `debug`) instead of scattered positional `isInboundWebhook`/`isCronRoute`/`isDebugRoute` checks.

- De-duplicate the catch/pass webhook processing loops into a single `processWebhookHandler()` function, removing ~150 lines of near-identical code.

- Extract a `readEncryptedJson()` helper that consolidates the "decrypt → fallback to plain JSON → fallback to `{}`" pattern previously copy-pasted across `getWireVars`, the webhook handler, and `getStoredVarsByPlugId`.

- Webhook processing now uses `waitUntil()` from `@vercel/functions` when available, ensuring work reliably completes after the `202` response on serverless runtimes instead of a floating `void Promise.resolve().then(...)`.

- Add `dispose()` to `KhotanInstance` to remove the instance from the module-level runtime registry, preventing unbounded growth in tests, HMR, or multi-instance scenarios.

- Require explicit security posture for `authorize`: omitting the field in production (`NODE_ENV=production`) now throws. In development it warns and defaults to no auth. Pass `authorize: false` to explicitly opt into publicly accessible management routes.

- Remove dual-casing fallback in `getRunWorkflowId` — only `workflowRunId` (camelCase) is checked, matching Drizzle's mapped column names.

- Add integration test suite (`integration/router.test.ts`) for live E2E testing against brs-khotan-connector. Run manually with `npm run test:integration`.

## 0.4.0

### Minor Changes

- Decompose the `factory.ts` monolith into focused, individually-testable modules (`schema`, `crypto`, `cli-auth`, `cron`, `zod-introspect`, `types`, `drizzle-adapter`, `runtime`, `workflow`, `helpers`, `debug`) behind a thin `factory.ts` entry that re-exports the same public surface. Behavior-preserving; additionally exports the `KhotanWorkflowContextRef` and `KhotanWorkflowRuntimeHelpers` types.

  The cron route is now a heartbeat: it evaluates all scheduled flows and triggers any that are due or overdue based on their schedule and last run, catching up missed runs, instead of firing only when the current minute matches the cron expression.

- d3ce01d: Add a `khotan-data` bin alias to disambiguate from `@khotan/cli`.

  Both packages declare a bin named `khotan`, so a project that depends on both
  can only link one `node_modules/.bin/khotan`, making `npx khotan` resolve
  nondeterministically. khotan-data now also exposes a `khotan-data` bin (the
  existing `khotan` bin is unchanged), giving the ETL CLI an unambiguous
  invocation. Help/usage text reflects whichever bin was used and defaults to
  `khotan-data`.
