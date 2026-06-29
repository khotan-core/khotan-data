# Change-worthiness rubric

khotan-data takes a lot of its backlog from **internal agents reporting daily
friction** while building real connectors on top of it. That feedback is gold —
it's real usage — but it is not a spec. An agent's report can be:

- a **real defect or gap** worth fixing,
- a **stale report** (already fixed on `main`),
- a **misunderstanding** (the API/doc already covers it, the agent missed it), or
- a **local workaround** that would be wrong to bake into the core.

Triage every issue against this rubric **before** writing code. The default for
an unclear issue is *not* "implement it."

## Step 0 — Reproduce against current `main`

Before anything else, confirm the problem still exists on `main`. Many
agent-sourced issues are written against an older published version. If you can't
reproduce it, the verdict is **already-resolved → verify & close**, not "fix."

## The seven questions

Score each. A change should clearly win on most of them.

1. **Real defect, or misunderstanding?** Did you reproduce it, or does an
   existing API/doc already cover it? If the latter, the fix is usually a *doc*
   change (make it discoverable), not new code.
2. **General, or one connector's quirk?** Does it help most consumers, or is it
   one integration's niche need? Don't encode one connector's workaround into the
   core. A primitive earns its place by serving many flows.
3. **Does it fit the shape?** It should extend the existing model
   (resources / plugs / flows / caches + scaffold), not introduce a competing
   concept. Don't add `runType` when `variant` is canonical.
4. **First-run experience?** Scaffolded code must be green out of the box
   (typecheck + lint + run) and docs must match the real API. These are the first
   impression and rank **high** even when individually small.
5. **Surface-area cost.** Every new public API is permanent support burden.
   Prefer: fix docs > fix scaffold > add overload > add primitive. A new
   primitive needs strong, repeated justification.
6. **Correctness / safety.** Does it remove a *class* of bugs (e.g. a delta
   footgun), or just one symptom? Class-removal scores higher.
7. **Breaking & reversibility.** Breaking changes need a migration note and the
   right semver bump. Cheap-to-reverse beats one-way-door.

## Verdicts

- **Accept** — clear win, scoped, do it now (with a changeset).
- **Docs-only** — the code is fine; fix the doc/example/scaffold so it's correct
  and discoverable.
- **Already-resolved** — can't reproduce on `main`; verify and close the issue.
- **Defer (design)** — worth doing but needs a design or product decision first;
  don't half-bake it under time pressure.
- **Reject (won't-fix)** — record *why* (too niche, wrong layer, against the
  shape) so it doesn't get re-filed.

## Close the loop with the agents (required)

Inputs come from internal agents using khotan-data every day. Treat triage as a
two-way channel — every verdict goes back to the source so the next report is
sharper:

- **Always** write the verdict and the *reasoning* back into the originating
  Linear issue (or its thread), not just the code. "Rejected: too niche — encodes
  one connector's auth quirk; use a custom AuthStrategy" teaches more than a
  silent close.
- For **Already-resolved**, link the commit/version that fixed it and the file
  that proves it, so the agent can confirm against the right baseline.
- For **Docs-only** and **Accept**, note what shipped and where, so the agent can
  re-verify and stop hand-rolling the workaround.
- Watch for **repeat reports** of the same friction from different agents — two
  independent reports of the same papercut is a strong signal it's real and
  general (rubric Q2), and should bump priority.

## Notes

- Prefer the smallest change that fixes the real problem. A 2-line doc fix that
  makes the right thing discoverable often beats a new API.
</content>
