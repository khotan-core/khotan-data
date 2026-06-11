## 1. Comparison Engine

- [x] 1.1 Create `src/cli/compare.ts` with `inferShape(value: unknown): SchemaNode` that recursively walks JSON values and produces a type tree (primitives, objects, arrays, nulls)
- [x] 1.2 Implement array item shape merging in `inferShape` — union all keys across array items into a single merged item schema
- [x] 1.3 Implement `diffSchemas(expected: SerializedSchema, actual: SchemaNode): Mismatch[]` that produces `missing`, `extra`, and `type_mismatch` entries with JSONPath notation
- [x] 1.4 Handle nested object diffing recursively with path accumulation (e.g., `$.data.items[].name`)
- [x] 1.5 Add unit tests for `inferShape` covering primitives, nested objects, arrays (homogeneous + polymorphic), empty arrays, null values
- [x] 1.6 Add unit tests for `diffSchemas` covering exact match, missing fields, extra fields, type mismatches, nested mismatches, array item mismatches

## 2. Probe Command Core

- [x] 2.1 Create `src/cli/commands/probe.ts` with Commander command definition, flags (`--port`, `--base-path`, `--list`, `--info`, `--endpoint`, `--compare`, `--body`, `--params`, `--headers`)
- [x] 2.2 Implement port detection: read `--port` flag → parse `.env.local` for PORT → parse `.env` for PORT → default 3000
- [x] 2.3 Implement connectivity check: `GET <base>/debug` with error handling for connection refused and 404 responses
- [x] 2.4 Implement `--list` mode: `GET <base>/plugs` → format as `{ ok, plugs: [{ name, baseUrl, authType, varsConfigured }] }`
- [x] 2.5 Implement `--info` mode: `GET <base>/debug/:plugName` → format as `{ ok, plug: { name, baseUrl, authType, vars, endpoints } }`
- [x] 2.6 Implement fire request mode: `POST <base>/debug/:plugName` with method, path, body, params, headers → format response with timing, size, matchedEndpoint
- [x] 2.7 Implement `--endpoint` resolution: fetch metadata, find endpoint by name, use its method/path
- [x] 2.8 Implement `--compare` mode: after getting response, run comparison engine against matched endpoint's response schema; output comparison or null with note
- [x] 2.9 Implement payload size calculation in human-readable format (`"234b"`, `"1.4kb"`, `"2.1mb"`)

## 3. CLI Registration

- [x] 3.1 Register `probeCommand` in `src/cli/index.ts`
- [x] 3.2 Update `tsup.config.ts` to include `probe.ts` and `compare.ts` in the CLI build

## 4. Agent Skill Template

- [x] 4.1 Create `src/cli/templates/agent-skill.md` with skill trigger description, command syntax, output format, and common workflow patterns
- [x] 4.2 Add `agent-skill` entry to `src/cli/registry.ts` with output to `.cursor/skills/khotan-probe/SKILL.md` using project-root output base
- [x] 4.3 Update `tsup.config.ts` to copy `agent-skill.md` to `dist/templates`

## 5. Init Integration

- [x] 5.1 Add agent skill prompt to `src/cli/commands/init.ts` — "Install agent skill for AI-assisted debugging? (Y/n)"
- [x] 5.2 Respect `--yes` flag to auto-install without prompting
- [x] 5.3 Scaffold skill file to `.cursor/skills/khotan-probe/SKILL.md` when accepted

## 6. Testing & Verification

- [x] 6.1 Add integration tests for probe command: port detection, connectivity check errors, list mode, info mode
- [x] 6.2 Add integration tests for fire request mode: successful request, error responses, endpoint matching
- [x] 6.3 Add integration test for `--compare` mode: match case, mismatch case, no-schema case
- [x] 6.4 Build, pack, verify CLI command is accessible via `npx khotan probe --help`
