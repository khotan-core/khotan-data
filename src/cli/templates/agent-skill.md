---
name: khotan-probe
description: >
  Inspect and debug khotan plugs via the CLI. Prefer `khotan plug`
  (legacy alias: `khotan probe`). Use when verifying API
  response shapes against typed endpoint definitions, debugging type
  mismatches between declared schemas and actual responses, or exploring
  available plugs and their endpoints.
---

Inspect and debug khotan plugs via the CLI. Prefer `khotan plug` (legacy alias: `khotan probe`). Use when verifying API response shapes against typed endpoint definitions, debugging type mismatches between declared schemas and actual responses, or exploring available plugs and their endpoints.

**Requires**: A running dev server with `KHOTAN_DEBUG=1` set.

This is Phase 3 of `khotan-build`. The goal of this loop is to learn the exact
request/response shapes of the service **before** building any flows on top.

## Headline rule (MUST)

- **`GET` endpoints: probe freely.** Kitchen-sink every relevant `GET` to learn
  real payloads.
- **Non-`GET` (`POST`/`PATCH`/`PUT`/`DELETE`): require explicit user consent
  first.** Firing these mutates live remote data and you usually lack the setup
  to do so safely. Do not run them just because the endpoint exists.

## Commands

### List all plugs
```bash
npx khotan-data plug --list
```
Returns: `{ ok, plugs: [{ name, baseUrl, authType, varsConfigured }] }`

### Show plug info and endpoints
```bash
npx khotan-data plug <plugName> --info
```
Returns: `{ ok, plug: { name, baseUrl, authType, vars, endpoints } }`

### Fire a request through a plug
```bash
npx khotan-data plug <plugName> GET /products
npx khotan-data plug <plugName> POST /subscriptions --body '{"url":"https://example.com"}'
npx khotan-data plug <plugName> GET /products --params '{"limit":"10"}'
npx khotan-data plug <plugName> GET /products --headers '{"X-Custom":"value"}'
```
Returns: `{ ok, request, response: { status, timing, size, body }, matchedEndpoint }`

### Fire via named endpoint
```bash
npx khotan-data plug <plugName> --endpoint listProducts
```
Resolves method and path from the endpoint definition automatically.

### Compare response against schema
```bash
npx khotan-data plug <plugName> --endpoint listProducts --compare
```
Returns: `{ ..., comparison: { match, expected, actual, mismatches } }`

Each mismatch has `{ path, issue, note }` where issue is `missing`, `extra`, or `type_mismatch` and path uses JSONPath notation (e.g. `$.items[].sku`).

## Options

| Flag | Description |
|------|-------------|
| `--port <n>` | Dev server port (default: from .env.local → .env → 3000) |
| `--base-path <p>` | API base path (default: `/api/khotan`) |
| `--list` | List registered plugs |
| `--info` | Show plug metadata |
| `--endpoint <name>` | Fire using named endpoint |
| `--compare` | Diff response against schema |
| `--body <json>` | Request body |
| `--params <json>` | Query params |
| `--headers <json>` | Extra headers |

## Workflow

1. **Discover**: `--list` to find plugs, `--info` to see endpoints
2. **Probe**: Fire a request via endpoint name or raw method/path
3. **Compare**: Add `--compare` to check response shape against Zod schema
4. **Fix**: If mismatches found, update the endpoint's response schema or adjust API expectations

All output is JSON on stdout — parse with standard JSON tools.
