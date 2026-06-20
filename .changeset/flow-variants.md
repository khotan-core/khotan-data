---
"khotan-data": minor
---

Add per-run flow variants: trigger a flow with `--variant <name>` (or `variant`
in the start/request body) and branch extract/transform/load logic on
`ctx.variant`. Plumbed through `FlowWorkflowContext`, `FlowRunContext`, and
`FlowStartOptions`.

Scaffold a Drizzle config and `db` instance in `npx khotan init --full` so the
factory's `@/db` import resolves and `migrate` works out of the box.

Harden `npx khotan add` for non-interactive use: it no longer hangs on overwrite
prompts when stdin is not a TTY, and `add schema` falls back to a conventional
`db/schema` directory instead of colliding with the factory config `khotan.ts`.
