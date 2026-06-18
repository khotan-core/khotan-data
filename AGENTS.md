# khotan-data

Production-grade data sync, ETL, and webhook components for Next.js + Drizzle + Postgres.

## Agent Skills

This package ships agent skills that teach coding agents how to use khotan-data.
Skills are installed into consumer projects via the CLI:

```bash
npx khotan init --yes          # Installs all skills during setup
npx khotan add skill-setup     # Or install individually
```

The installer auto-detects which coding agents are present (Cursor, Claude Code, Codex, Copilot, Kiro, Roo) and installs to all detected agent directories. It also places an `AGENTS.md` router at the project root.

## Skill Templates

Source templates live in `src/cli/templates/`:

| Template | Skill name | Teaches |
|----------|-----------|---------|
| `skill-build.md` | khotan-build | End-to-end integration workflow + consent gates (orchestrator) |
| `skill-setup.md` | khotan-setup | Project initialization, factory config, database setup, securing |
| `skill-plug.md` | khotan-plug | Plug authoring, auth strategies, typed endpoints |
| `agent-skill.md` | khotan-probe | Probe CLI for verifying endpoint shapes (GET-first) |
| `skill-flow.md` | khotan-flow | Inflows, outflows, relays; triggering and scheduling |
| `skill-webhook.md` | khotan-webhook | Wires, Catch, Pass, webhook flow |
| `skill-cache.md` | khotan-cache | Durable caching of snapshots/checkpoints/dedupe markers |
| `skill-mappings.md` | khotan-mappings | Resources and cross-service record mappings |
| `skill-frontend.md` | khotan-frontend | Suggests UI components/blocks; never adds UI/routes unprompted |

## Agent Detection

`src/cli/agent-detect.ts` handles multi-agent installation:

| Agent | Marker directory | Skill path |
|-------|-----------------|------------|
| Cursor | `.cursor/` | `.cursor/skills/{name}/SKILL.md` |
| Claude Code | `.claude/` | `.claude/skills/{name}/SKILL.md` |
| Codex | `.agents/` | `.agents/skills/{name}/SKILL.md` |
| Copilot | `.github/` | `.github/skills/{name}/SKILL.md` |
| Kiro | `.kiro/` | `.kiro/skills/{name}/SKILL.md` |
| Roo | `.roo/` | `.roo/rules/{name}/SKILL.md` |

If no agent directories are detected, defaults to Cursor + Claude Code.

## Package Architecture

See `openspec/` for full specifications. Key source files:

| File | Purpose |
|------|---------|
| `src/factory.ts` | Runtime core — plug registration, API routing, debug endpoints |
| `src/cli/` | CLI commands (init, add, generate, migrate, probe) |
| `src/cli/registry.ts` | Component/block registry |
| `src/cli/agent-detect.ts` | Agent detection + multi-path skill installer |
| `src/cli/compare.ts` | Schema inference + diff engine for probe --compare |
