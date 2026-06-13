---
name: publish-package
description: Publishes the khotan-data npm package using this repo's release workflow. Use when preparing a release, publishing to npm, running prepublish checks, or when the user mentions npm publish, OTP, login, whoami, or public access.
---

# Publish Package

Use this skill when releasing `khotan-data` to npm.

## Default Rule

Do not publish casually. Always verify the package name, version, auth state, local release checks, and tarball contents first.

## Workflow

Copy this checklist and work through it in order:

```text
Release Checklist
- [ ] Confirm repo root and package name
- [ ] Confirm version is correct
- [ ] Confirm npm auth
- [ ] Run local release checks
- [ ] Inspect the tarball
- [ ] Run publish dry-run
- [ ] Publish with public access
- [ ] Confirm the published version
```

## Step 1: Confirm repo root and package name

Run:

```bash
pwd
node -p "require('./package.json').name"
node -p "require('./package.json').version"
```

Make sure you are in the package root and publishing the package you expect.

## Step 2: Confirm version is correct

Check the local version:

```bash
node -p "require('./package.json').version"
```

Check the registry version:

```bash
npm view "$(node -p "require('./package.json').name")" version
```

Rules:

- If the local version already exists on npm, do not publish until the version is bumped.
- If this is the first publish and `npm view` fails, that may be okay.
- If publish later fails with `404` or permission errors, the package name may be unavailable or owned by someone else.

## Step 3: Confirm npm auth

Run:

```bash
npm login
npm whoami
```

If `npm whoami` does not return the expected account, stop and fix auth before continuing.

## Step 4: Run local release checks

Run:

```bash
npm run typecheck
npm test
npm run build
npm run prepublishOnly
```

Rules:

- `prepublishOnly` is the final local release gate.
- Do not publish if any of these fail.
- Prefer fixing real failures instead of bypassing the checks.

## Step 5: Inspect the tarball

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

## Step 6: Run publish dry-run

Run:

```bash
npm publish --dry-run --access public
```

This confirms npm is happy with the package before the real publish.

## Step 7: Publish with public access

Run from the repo root:

```bash
npm publish --access public
```

If npm requires an OTP, stop and let the user enter it manually.

## Step 8: Confirm the published version

Run:

```bash
npm view "$(node -p "require('./package.json').name")" version
```

The returned version should match `package.json`.

## Required Notes

Need to do login. check whoami. publish with public access.

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

Bump the version before retrying. Do not try to re-publish the same version.

## Repo-specific Notes

- The package name lives in `package.json`.
- `prepublishOnly` is the final local release gate and should pass before publish.
- If publish fails with a package-name or permission error, check whether the npm package name is available or owned by the logged-in account before retrying.
