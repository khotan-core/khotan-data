# khotan-data

Production-grade data flow, ETL, and webhook components for Next.js + Drizzle + Postgres.

## Skills

| Skill | When to use |
|-------|-------------|
| [khotan-setup](skills/khotan-setup/SKILL.md) | Initializing khotan in a new project, adding the database schema, configuring the factory |
| [khotan-plug](skills/khotan-plug/SKILL.md) | Connecting to a new API, defining endpoint contracts, configuring authentication |
| [khotan-dashboard](skills/khotan-dashboard/SKILL.md) | Adding a management interface, configuring plug variables in the browser |
| [khotan-webhook](skills/khotan-webhook/SKILL.md) | Receiving webhooks, registering callback URLs, processing incoming events |
| [khotan-probe](skills/khotan-probe/SKILL.md) | Debugging plugs via CLI with `khotan plug` (legacy alias: `probe`) |

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
