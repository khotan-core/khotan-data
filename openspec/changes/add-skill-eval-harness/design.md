## Context

khotan ships nine agent skills (`khotan-build` orchestrator plus capability and
advanced skills) that teach coding agents how to integrate external services.
Today the only validation is Tier 1/2 unit tests (`src/cli/skills.test.ts`):
structural consistency and install/refresh behavior. There is no measurement of
**how an agent actually behaves** when following the skills.

This matters for three reasons: (1) with nine overlapping skills, the right one
may not trigger (or the wrong one over-triggers); (2) the orchestrator encodes
consent gates (scope, mutation, flows/webhooks, frontend) that may be ignored;
(3) the mutation gate is a real safety property — an agent must never fire a
mutating request against a live external API without consent.

The OpenAI "Testing Agent Skills Systematically with Evals" pattern
(prompt → captured trace → small set of checks → score over time) is the
reference. This design adapts it to Cursor/khotan and adds a khotan-specific
safety assertion the reference lacks.

## Goals / Non-Goals

**Goals:**
- Measure, per model and over repeated runs, whether agents trigger the correct
  skill and honor the workflow consent gates.
- Make the mutation/consent safety gate a deterministic pass/fail signal.
- Produce a versioned scorecard (scenario × model pass rate) that makes skill
  edits' effects and regressions visible.
- Keep everything on-demand / nightly and fully out of the `vitest` and `check`
  paths so it never blocks normal development.
- Start small (a handful of scenarios, 2 models) and grow the dataset from real
  observed failures.

**Non-Goals:**
- Not a replacement for the Tier 1/2 unit tests.
- Not per-commit CI (cost and latency forbid it).
- Not changing any shipped skill content or package source in this change (the
  harness consumes the existing skills; tuning skills is downstream work the
  harness enables).
- Not evaluating cloud-runtime agents (the mock service lives on localhost).
- Not a general-purpose agent benchmark — scoped to khotan skills.

## Decisions

### D1. Runner: Cursor SDK local runtime
Use `@cursor/sdk` `Agent.prompt(...)` (one-shot) and `Agent.create(...)` +
`agent.send(...)` (for scenarios needing a follow-up turn), with
`local: { cwd }` pointed at a fixture worktree. Enumerate models via
`Cursor.models.list()` and run a configured subset.

- *Why local over cloud*: cloud agents run on a Cursor VM against a cloned repo
  and cannot reach a localhost mock service; the mutation-gate assertion depends
  on that mock.
- *Alternative considered*: the `cursor-agent` CLI with `--output-format json`.
  Equivalent trace data, but the SDK gives typed stream events and lifecycle
  control. The CLI remains a fallback if SDK access is unavailable.

### D2. Mock external service as source of truth
Each scenario starts a local HTTP mock whose `baseUrl` the agent's plug targets.
It serves canned JSON for `GET` endpoints and **records every request's method
and path**.

- *Why*: turns the fuzzy "did it respect the mutation gate?" into a hard check —
  `non-GET requests === 0` for no-consent scenarios, and the inverse for consent
  scenarios. This is the safety property the reference blog has no analog for.
- *Alternative*: parse the transcript for mutation intent. Rejected — unreliable
  and not verifiable against what actually hit the wire.

### D3. Trace-based deterministic graders (no hooks)
Read the agent run's structured tool-call events (SDK `run.stream()`; or
`cursor-agent` JSON) to assert which commands ran (e.g.
`khotan plug … --compare`). Combine with the mock log and `git status
--porcelain` (cleanliness / no rogue routes).

- *Why no `.cursor/hooks.json` capture*: the run trace already contains
  structured command-execution events, mirroring the reference's
  `codex exec --json` approach. A hook would be redundant instrumentation.

### D4. Two grader tiers, deterministic first
Deterministic graders (mock log, trace, git diff) decide must-pass safety and
process checks. A structured-output rubric judge (an agent run constrained to a
JSON schema, read-only over the resulting repo) grades qualitative conventions
(style, structure) and the softer "did it ask before acting" gates, always
returning an evidence quote.

- *Why*: fast explainable signals first; model-graded judgment only where rules
  fall short. Mirrors the reference's deterministic + `--output-schema` split.

### D5. Scenario dataset as CSV with `should_trigger` + negative controls
A `prompts.csv` with columns `id, target_skill, should_trigger, fixture, prompt`
(plus per-scenario grader config). Includes `should_trigger=false` negative
controls (adjacent requests that must NOT invoke a khotan skill) to catch
over-triggering.

- *Why*: trigger accuracy is the first failure mode with nine overlapping
  skills. The CSV is a living record grown from observed misses.

### D6. Staged fixtures
Provide a `greenfield` fixture (no khotan; tests Phase 0–1 setup/env triage) and
a `pre-init` fixture (khotan set up + mock wired; tests Phase 2+ gates in
isolation). Each run executes in an isolated git worktree / temp clone that is
diffed and discarded.

- *Why*: targeting a scenario at the relevant phase reduces cost and flakiness
  versus forcing every run through full setup.

### D7. Scoring: pass-rate over N reps, per model, versioned
Each scenario runs N times per model. Report rates, not booleans. Stamp the
scorecard with the skill-set version. Apply per-gate thresholds: safety gates
(mutation) require 100%; softer gates have lower bars. Pin model versions so a
model upgrade is a new column, not a phantom regression.

### D8. Isolation from normal test/build
Everything lives under `evals/` with its own entry script and npm script
(`eval:skills`). It is excluded from `vitest` globs and the `check` script. No
eval code is bundled by `tsup` or published.

## Risks / Trade-offs

- **Non-determinism / flakiness** → Run N reps and report rates; quarantine
  flaky scenarios with separate tracking; use thresholds, not single-run gates.
- **Token / time cost** → On-demand or nightly only; small dataset (10–20
  scenarios); stage fixtures so most runs skip full setup.
- **Mock fidelity drift from real APIs** → Mock validates *behavior/shape
  discipline*, not real API correctness; keep fixtures generic and documented as
  synthetic.
- **Model availability / SDK beta churn** → Read models from
  `Cursor.models.list()` rather than hardcoding; CLI fallback for the runner;
  pin versions in the scorecard.
- **Grader (LLM-judge) unreliability** → Keep safety/process checks
  deterministic; require evidence quotes from the judge; treat rubric output as
  advisory for soft gates only.
- **False sense of safety** → Document that a green scorecard reflects the tested
  scenarios only; coverage grows from real failures (D5).

## Migration Plan

Additive only — no migration. Land the `evals/` scaffold, add the dev dependency
and `eval:skills` script, seed the trigger suite plus the three highest-value
gate scenarios (scope, mutation, frontend), confirm a scorecard is produced for
2 models, then grow the dataset. Rollback is deleting `evals/` and the script;
nothing in the shipped package depends on it.

## Open Questions

- Which model set is the default matrix, and how many reps balance signal vs
  cost?
- Where do scorecards live (committed history under `evals/scorecards/` vs an
  external store) for trend tracking?
- Should the rubric judge run on every scenario or only ones with qualitative
  acceptance criteria?
- Eventually wire into a nightly CI job, or keep manual until the dataset
  stabilizes?
