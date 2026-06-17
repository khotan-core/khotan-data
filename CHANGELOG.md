# khotan-data

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
