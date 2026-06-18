---
"khotan-data": minor
---

Restructure the agent skills around a `khotan-build` orchestrator that drives the end-to-end integration workflow with explicit consent gates (scope, mutation, flows/webhooks, frontend). Add `khotan-flow`, `khotan-cache`, and `khotan-mappings`; rename `khotan-dashboard` to `khotan-frontend` (suggest-only — never adds UI or routes without confirmation); and harden the setup, plug, probe, and webhook skills.
