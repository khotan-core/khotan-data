## Why

The khotan agent skills are shipped to teach coding agents how to use the
package, but we have no way to measure whether agents actually follow them —
whether the right skill triggers, whether the workflow gates hold, and whether a
skill edit improved or regressed behavior. Most critically, the skills encode a
safety rule (never fire a mutating request against a live external API without
consent) that is currently enforced only by hope. We need behavioral evaluations
that turn "this skill feels better" into a measurable, per-model score.

## What Changes

- Add a behavioral eval harness (under `evals/`, out of the normal `vitest`
  path) that runs real coding agents against khotan fixture projects and grades
  their behavior.
- Drive agent runs programmatically via the Cursor SDK, looping over multiple
  models and repeating each scenario N times to produce pass-rate scores rather
  than single booleans.
- Provide staged fixture projects (greenfield and pre-initialized) plus a mock
  external service that logs every request method/path — making the
  mutation/consent safety gate a deterministic assertion.
- Define a scenario dataset (CSV) covering skill-trigger accuracy (including
  negative controls that must NOT trigger a skill) and the workflow consent
  gates (scope, mutation, flows/webhooks, frontend, quick-fire disclosure).
- Grade runs with deterministic checks over the run trace + mock request log +
  `git status --porcelain`, plus an optional structured-output rubric judge for
  qualitative conventions.
- Emit a versioned scorecard (scenario × model pass rates) and wire an on-demand
  / nightly runner, explicitly excluded from the per-commit test suite.

## Capabilities

### New Capabilities
- `skill-evals`: Behavioral evaluation of khotan agent skills — fixtures, mock
  service, scenario dataset, the SDK-based runner, deterministic and rubric
  graders, scoring/scorecard, and the safety-gate (mutation consent) assertions.

### Modified Capabilities
<!-- None. This change adds evaluation infrastructure; it does not alter the
     behavioral requirements of the skills themselves (agent-skill). -->

## Impact

- New top-level `evals/` directory: fixtures, mock service, runner, graders,
  scenario CSV, rubric schema, and scorecard output.
- New dev dependency on the Cursor SDK (`@cursor/sdk`) and a `CURSOR_API_KEY`
  for running evals.
- New npm scripts (e.g. `eval:skills`) kept separate from `test`/`check`.
- Requires model API access; runs incur token cost, so the suite runs on demand
  or nightly, not on every commit.
- No changes to shipped package source, the published skill templates, or the
  existing unit/CLI test suites.
