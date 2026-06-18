# khotan-data

Production-grade data flow, ETL, and webhook components for Next.js + Drizzle + Postgres.

## Skills

Start from **khotan-build** when integrating a service — it orchestrates the
whole workflow and points to the focused skills below at each step.

| Skill | When to use |
|-------|-------------|
| [khotan-build](skills/khotan-build/SKILL.md) | Integrating a service end to end — owns the order of operations and the consent gates. Start here. |
| [khotan-setup](skills/khotan-setup/SKILL.md) | Foundation: initializing khotan, schema/migrations, factory, securing the API, middleware/workflow fixes |
| [khotan-plug](skills/khotan-plug/SKILL.md) | Connecting to a new API, defining endpoint contracts, configuring authentication |
| [khotan-probe](skills/khotan-probe/SKILL.md) | Verifying endpoint shapes via CLI with `khotan plug` (legacy alias: `probe`) — GET-first, consent before mutations |
| [khotan-flow](skills/khotan-flow/SKILL.md) | Building/running inflows, outflows, relays; triggering and scheduling flows |
| [khotan-webhook](skills/khotan-webhook/SKILL.md) | Receiving webhooks, registering callback URLs, processing/forwarding events |
| [khotan-cache](skills/khotan-cache/SKILL.md) | Durable caching of upstream snapshots, checkpoints, and dedupe markers |
| [khotan-mappings](skills/khotan-mappings/SKILL.md) | Resources and cross-service record matching/dedupe via connect keys |
| [khotan-frontend](skills/khotan-frontend/SKILL.md) | Suggesting frontend components/pages — never adds UI or routes without confirmation |

## Quick Reference

```bash
npx khotan init              # Initialize project
npx khotan add plug --yes    # Add HTTP client component
npx khotan add hub --yes     # Add dashboard UI
npx khotan generate          # Scaffold Drizzle schema
npx khotan migrate           # Apply database migrations
npx khotan plug --list       # Debug: list registered plugs
```

## Key Files

| File | Purpose |
|------|---------|
| `khotan.config.ts` | CLI config — sets outputDir |
| `{outputDir}/khotan.ts` | Factory config — register plugs, resources, adapter |
| `src/app/api/khotan/[...all]/route.ts` | Catch-all API route |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection (Drizzle) |
| `KHOTAN_SECRET` | AES-256-GCM key for encrypting plug variables |
| `KHOTAN_DEBUG` | Enables debug routes and the `plug` CLI (`probe` alias) |
| `KHOTAN_WEBHOOK_URL` | Public URL for webhook callbacks |
