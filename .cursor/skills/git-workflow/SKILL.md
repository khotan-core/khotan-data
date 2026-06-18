---
name: git-workflow
description: Branching strategy, commit intervals, changesets, and commit message format for khotan-data. Use when creating branches, making commits, or when the user asks to commit changes.
---

# Git Workflow

## Branches

Create a branch when starting any non-trivial change. Name it after what you're doing:

```
feat/declarative-router
fix/webhook-auth-bypass
chore/split-factory-modules
docs/changelog-041
```

Prefix matches the commit type. Keep it short — no tickets, no dates, no version numbers.

Stay on `main` only for single-commit throwaway fixes.

## Commit Intervals

Commit at logical boundaries, not at the end of a marathon session.

**One commit per coherent unit of work.** If you can't describe it in one line without "and", it's two commits.

Good rhythm:
- Extract helper → commit
- Rewrite router → commit
- Update tests for router → commit
- Add integration tests → commit

Bad rhythm:
- Rewrite router + update tests + add integration tests + fix auth + update changelog → one commit

**If you're unsure, commit more often.** Small commits are easy to squash; big commits are impossible to split.

## Commit Messages

### Format

```
type: short description
```

One line. Under 72 characters. Lowercase after the prefix. No period.

### Types

| Type | When |
|------|------|
| `feat` | New capability or behavior change |
| `fix` | Bug fix |
| `hotfix` | Urgent production fix |
| `chore` | Refactor, cleanup, deps — no behavior change |
| `docs` | Documentation only |
| `test` | Test-only changes |
| `release` | Version bump and publish (used only by the publish-package workflow) |

### Rules

- **No paragraphs.** If you need to explain why, the PR description is for that.
- **No "and".** If the message needs "and", split the commit.
- **Be specific.** `fix: auth` is useless. `fix: cli token missing timestamp in hmac` is useful.
- **Don't narrate the how.** `feat: declarative route table` not `feat: replaced indexOf router with pattern-matched route table entries`.
- **No versions in commits.** Never put a version number in a commit message (except `release: v{version}` commits created by the publish workflow).
- **No co-authored-by trailers.** Never add `Co-authored-by`, `Signed-off-by`, or any AI attribution trailers to commit messages. The commit is mine.

### Examples

```
feat: declarative route table
feat: waitUntil for webhook processing
fix: cli token missing timestamp in hmac
chore: extract readEncryptedJson helper
chore: move CHANGES.md to docs/
test: integration tests for live router
docs: contributing section in readme
```

### Counter-examples

```
# too long
feat: declarative route handler, replacing the segment soup. Other adjacent updates to auth gate, de-dupe catch/pass loops, consolidated decrypt function

# too vague
fix: fixed stuff
chore: updates

# narrates the how
chore: moved the decrypt-or-fallback pattern from three separate try/catch blocks into a shared readEncryptedJson helper function in helpers.ts

# version in a feature commit
feat[v0.4.0]: declarative route table
```

## Changesets

This project uses [changesets](https://github.com/changesets/changesets) to track what changed and determine the next version at release time.

### When to create a changeset

Before opening a PR or merging to `main`, run:

```bash
npx changeset
```

This prompts for:
1. **Semver bump** — patch, minor, or major
2. **Summary** — a short description of what changed, written for the changelog

The command creates a markdown file in `.changeset/` that gets committed with the PR.

### Rules

- **One changeset per PR.** If a PR has multiple logical changes, it is fine to create multiple changesets.
- **No changeset for internal-only changes.** If a commit is purely `chore`, `test`, or `docs` with no user-facing impact, skip the changeset.
- **External contributors** should include a changeset in their PR. If they forget, the maintainer adds one before merging.
- **Never manually edit `package.json` version or `CHANGELOG.md`.** Both are updated automatically by `changeset version` during the publish workflow.

### What happens at release time

The publish-package skill handles this. In short: `changeset version` consumes all pending changeset files, bumps `package.json`, and writes the changelog entry. Then the maintainer publishes to npm and tags the release. See the `publish-package` skill for the full checklist.
