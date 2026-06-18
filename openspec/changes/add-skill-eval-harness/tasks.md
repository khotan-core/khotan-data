## 1. Scaffold and isolation

- [ ] 1.1 Create `evals/` directory structure (`fixtures/`, `mock/`, `runner/`, `graders/`, `scenarios/`, `scorecards/`)
- [ ] 1.2 Add `@cursor/sdk` as a dev dependency and document the `CURSOR_API_KEY` requirement in `evals/README.md`
- [ ] 1.3 Add an `eval:skills` npm script wired to the runner entry point
- [ ] 1.4 Exclude `evals/**` from the `vitest` config, the `lint`/`check` paths, and `tsup` bundling; verify `npm test` and `npm run build` ignore it

## 2. Fixtures

- [ ] 2.1 Build the `greenfield` fixture (Next.js + Drizzle, khotan not initialized)
- [ ] 2.2 Build the `pre-init` fixture (khotan initialized, skills installed, mock service base URL wired into a plug)
- [ ] 2.3 Implement isolated-copy setup/teardown (git worktree or temp clone) that diffs and discards per run

## 3. Mock external service

- [ ] 3.1 Implement a local HTTP mock that serves canned JSON for configured GET endpoints
- [ ] 3.2 Record method + path of every received request to a per-run request log
- [ ] 3.3 Expose start/stop with a dynamic port and a log accessor for graders

## 4. Scenario dataset

- [ ] 4.1 Define the CSV schema (`id, target_skill, should_trigger, fixture, prompt`, plus grader config)
- [ ] 4.2 Seed positive trigger scenarios for `khotan-build`, `khotan-plug`, and `khotan-flow`
- [ ] 4.3 Seed negative-control scenarios (`should_trigger=false`) for adjacent requests that must not invoke a khotan skill
- [ ] 4.4 Seed the gate scenarios: scope gate, mutation gate (no-consent), mutation consent (inverse), frontend gate, quick-fire disclosure

## 5. Runner

- [ ] 5.1 Implement the Cursor SDK local runner (`Agent.prompt` one-shot; `Agent.create` + `send` for follow-up scenarios)
- [ ] 5.2 Resolve the model matrix from `Cursor.models.list()` and record chosen models per run
- [ ] 5.3 Loop scenarios × models × N repetitions; capture the structured trace and final result per run
- [ ] 5.4 Persist per-run artifacts (trace, mock log, working-copy diff) under `evals/scorecards/<run>/`

## 6. Deterministic graders

- [ ] 6.1 Trigger-accuracy grader: assert the target skill was/was not invoked (handles negative controls)
- [ ] 6.2 Process grader: assert expected commands (e.g. plug `--compare`) appear in the run trace
- [ ] 6.3 Cleanliness grader: assert `git status --porcelain` is empty or matches the scenario allow list
- [ ] 6.4 Mutation-consent safety grader: assert zero non-GET requests for no-consent scenarios, and the expected non-GET for consent scenarios

## 7. Rubric grading (optional tier)

- [ ] 7.1 Define the rubric JSON schema (`overall_pass`, `score`, per-check `pass` + evidence)
- [ ] 7.2 Implement the read-only, schema-constrained judge run over the resulting repo
- [ ] 7.3 Ensure a failed deterministic safety check overrides any rubric pass

## 8. Scoring and reporting

- [ ] 8.1 Aggregate run results into pass rates per scenario per model
- [ ] 8.2 Apply per-gate thresholds (mutation gate = 100%; configurable softer gates)
- [ ] 8.3 Emit a scorecard stamped with the skill-set version and pinned model identifiers
- [ ] 8.4 Render a human-readable scenario × model rate table

## 9. Validation

- [ ] 9.1 Run the harness end to end for 2 models against the trigger suite + scope/mutation/frontend gates and confirm a scorecard is produced
- [ ] 9.2 Document in `evals/README.md` how to run on demand, interpret the scorecard, and add new scenarios from observed failures
