---
name: publish-package
description: Publishes the khotan-data npm package using this repo's release workflow. Use when preparing a release, publishing to npm, running prepublish checks, or when the user mentions npm publish, OTP, login, whoami, or public access.
---

# Publish Package

Use this skill when releasing `khotan-data` to npm.

## Default Rule

Do not publish casually. The workflow is split into two phases: a dry run that validates everything without needing npm auth, and a publish step that logs in once and ships.

## Workflow

```text
Release Checklist

Dry run (no auth needed)
- [ ] Confirm repo root, package name, and current version
- [ ] Run changeset version
- [ ] Review the generated changelog entry
- [ ] Run local release checks (typecheck, test, build)
- [ ] Inspect the tarball
- [ ] Commit the version bump
- [ ] Git tag
- [ ] Run publish dry-run

Publish
- [ ] Publish with public access
- [ ] Push commit and tag to origin
- [ ] Confirm the published version
```

---

## Dry Run

### Step 1: Confirm repo root, package name, and current version

Run:

```bash
pwd
node -p "require('./package.json').name"
node -p "require('./package.json').version"
```

Make sure you are in the package root and publishing the package you expect.

### Step 2: Run changeset version

Check for pending changesets:

```bash
ls .changeset/*.md 2>/dev/null | grep -v README
```

If there are no pending changeset files, there is nothing to release. Stop here unless the user explicitly wants to force a version bump.

Run:

```bash
npx changeset version
```

This does three things:
1. Determines the next version from the pending changeset files
2. Bumps `package.json` version
3. Prepends the new entry to `CHANGELOG.md`

Verify the version was bumped:

```bash
node -p "require('./package.json').version"
```

### Step 3: Review the generated changelog entry

Read the top of `CHANGELOG.md` and confirm the entry is accurate. Fix any typos or unclear descriptions before committing.

### Step 4: Run local release checks

Run:

```bash
npm run typecheck
npm test
npm run build
```

Rules:

- Do not publish if any of these fail.
- Prefer fixing real failures instead of bypassing the checks.

### Step 5: Inspect the tarball

Run:

```bash
npm pack
```

Review the output:

- package name
- version
- tarball filename
- package size
- total files

This is the easiest way to catch missing build output, missing templates, or accidentally included files.

### Step 6: Commit the version bump

Stage and commit the version bump, changelog, and consumed changeset files:

```bash
git add package.json CHANGELOG.md .changeset/
git commit -m "release: v$(node -p "require('./package.json').version")"
```

This is the only commit that uses the `release` type.

### Step 7: Git tag

Tag the release commit:

```bash
git tag "v$(node -p "require('./package.json').version")"
```

### Step 8: Run publish dry-run

Run:

```bash
npm publish --dry-run --access public
```

This confirms npm is happy with the package before the real publish. No auth is needed for a dry run.

**Stop here and confirm with the user before proceeding to publish.**

---

## Publish

### Step 9: Publish with public access

Run from the repo root:

```bash
npm login
npm publish --access public
```

You must be logged in to npm before publishing. If you're already logged in (`npm whoami` shows your username), skip `npm login`.

### Step 10: Push commit and tag to origin

```bash
git push origin main --follow-tags
```

### Step 11: Confirm the published version

Run:

```bash
npm view "$(node -p "require('./package.json').name")" version
```

The returned version should match `package.json`.

---

## If Publish Fails

### `E404 Not Found` or permission error

Check:

```bash
npm whoami
npm view "$(node -p "require('./package.json').name")"
```

Most common causes:

- the package name is already owned by another npm account
- the package name is unavailable
- you are logged into the wrong npm account

If the name is unavailable, consider publishing under a scope such as:

```text
@your-npm-name/khotan-data
```

Public scoped packages must still be published with:

```bash
npm publish --access public
```

### Version already exists

This should not happen if you are using changesets correctly. If it does, check whether `changeset version` was skipped or the tag was not pushed. Do not manually bump the version — create a new changeset and run the workflow again.

### No pending changesets

If there are no `.changeset/*.md` files (excluding README), there is nothing to release. Either:
- Work was merged without changesets (go back and create one: `npx changeset`)
- All changes were internal (`chore`, `test`, `docs`) and intentionally skipped

## Repo-specific Notes

- The package name lives in `package.json`.
- `prepublishOnly` runs typecheck + test + build automatically on `npm publish`.
- `.changeset/config.json` controls changeset behavior (access, base branch, changelog format).
