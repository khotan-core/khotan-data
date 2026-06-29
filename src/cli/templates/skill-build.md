---
name: khotan-build
description: >
  End-to-end workflow for integrating an external service with khotan-data.
  Use when the user points at a service (docs, a link, markdown, "connect to
  X", "sync data from X", "build a plug for X") and wants data flowing. This is
  the orchestrator: it owns the order of operations, the credential decisions,
  and the consent gates. Delegates the "how" of each step to the focused
  khotan skills (setup, plug, probe, flow, webhook, cache, mappings, frontend).
---

Integrate an external service with khotan-data, end to end. This skill is the
**procedure and the decision-maker**. Follow it in order. Stop at every gate and
ask the user — do not improvise past a gate.

## When to use

- The user gives you docs, a link, a markdown dump, or a description of a
  service and wants khotan to talk to it.
- The user says "connect to X", "sync X", "pull data from X", "push data to X",
  or "receive webhooks from X".

## Do NOT use

- For isolated edits to an existing integration — go straight to the specific
  capability skill (`khotan-plug`, `khotan-flow`, etc.).

## Core safety rules (MUST follow)

1. **Scope gate.** If the integration's scope is not clear from the prompt,
   STOP and ask before building anything.
2. **Mutation gate.** You may fire `GET` endpoints freely to learn shapes. You
   MUST NOT fire `POST`/`PATCH`/`PUT`/`DELETE` against the live service without
   explicit user consent — you almost never have the setup to safely create or
   mutate remote data yet.
3. **Flows/webhooks gate.** After the plug is verified, STOP and ask which flows
   and webhook handlers the user wants — unless they already told you.
4. **Frontend gate.** Never add UI or routes on your own. After the backend
   works, STOP and ask what frontend (if any) they want — see `khotan-frontend`.
5. **Quick-fire, disclosed.** Default to the smallest working version (e.g.
   paginate **one page only**) so the loop is fast — but always tell the user
   that is what you did and what it would take to go further.

## The workflow

### Phase 0 — Ensure the foundation exists
Confirm khotan is initialized and a plug component is installed. If not, run the
setup path. → See `khotan-setup`.

```bash
npx khotan-data init --yes      # if khotan.config.ts / factory / route are missing
npx khotan-data add schema --yes && npx khotan-data migrate   # if tables not set up
npx khotan-data add plug --yes  # if no plug component exists
```

### Phase 1 — Read the docs, triage credentials & env
Read the provided service docs. Identify exactly which credentials the service
requires, then decide where each one lives:

| Question | → goes to |
|---|---|
| Secret/token the service issues to *this* integration? | **Plug var** (stored in DB, encrypted via `KHOTAN_SECRET`, editable in Hub/CLI) |
| Infra/config that differs per deploy (base URL, region)? | **Env var** |

Then check the base khotan env vars are present:

| Variable | Needed for | If missing |
|---|---|---|
| `DATABASE_URL` | Always | Ask the user — Postgres must be reachable |
| `KHOTAN_SECRET` | Encrypting plug vars | If unset/empty, suggest: `openssl rand -hex 32` |
| `KHOTAN_DEBUG` | The `plug` CLI + debug routes | Set `KHOTAN_DEBUG=1` in **dev only** (auto-disabled when `NODE_ENV=production`) |

### Phase 2 — Build the plug (within scope)
Author the plug for the service: auth strategy, vars, resources, and a **small**
set of typed `GET` endpoints covering what the prompt actually asked for. If
scope is unclear → **scope gate**: ask. → See `khotan-plug`.

### Phase 3 — Start the server and kitchen-sink the GETs
Start the dev app with `KHOTAN_DEBUG=1`, confirm the plug is registered, then
fire every relevant `GET` endpoint to learn the real request/response shapes.
**Mutation gate** applies. → See `khotan-probe`.

```bash
npx khotan-data plug --list
npx khotan-data plug <plugName> --info
npx khotan-data plug <plugName> --endpoint listX --compare
```

### Phase 4 — Fix the plug and verify
Tighten the endpoint Zod schemas until `--compare` matches the real payloads you
care about. The plug is "done" when the shapes are correct.

### Phase 5 — Flows & webhooks (GATE)
**Flows/webhooks gate**: ask the user which flows (pull/push/sync) and webhook
handlers they want, unless already told. Then build only those, lean
(one page), trigger once via CLI, and confirm the run.

- Pull/push/sync data → `khotan-flow`
- Receive/forward webhook events → `khotan-webhook`
- If they asked for caching → `khotan-cache`
- If they asked for record matching/dedupe → `khotan-mappings`

```bash
npx khotan-data flows trigger <flowName>        # default variant
npx khotan-data flows trigger <flowName> delta  # a specific variant (run mode)
npx khotan-data flows runs <flowName>
```

### Phase 6 — Frontend (GATE)
**Frontend gate**: ask what frontend they want — drop-in components, a config
page, a debug page, logs, or nothing. Never add UI/routes unprompted.
→ See `khotan-frontend`.

## Done checklist

- [ ] Plug registered and visible via `npx khotan-data plug --list`
- [ ] GET endpoint shapes verified with `--compare`
- [ ] No mutations fired without explicit consent
- [ ] Requested flows/webhooks built and triggered once successfully
- [ ] Quick-fire limits (e.g. single-page pagination) disclosed to the user
- [ ] Frontend decision made with the user (built only what they chose)
