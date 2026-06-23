---
"khotan-data": patch
---

docs(skill-frontend): document Hub `webhookUrl` prop and the Plug Debugger debug HTTP API

Folds two previously-undocumented reference facts into the generated `khotan-frontend` skill so it stays the single source of truth for the UI surface: the optional `<KhotanHub webhookUrl="..." />` prop, and the `GET/POST /api/khotan/debug[/:plugName]` endpoints used by the plug debugger. Lets downstream starters drop forked `khotan-dashboard` skills without losing reference detail.
