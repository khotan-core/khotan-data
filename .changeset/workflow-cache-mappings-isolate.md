---
"khotan-data": patch
---

Fix `khotanCache(ctx, …)` and `khotanMappings(ctx)` throwing `Khotan runtime helpers for instance "…" are not registered` inside Vercel Workflow `"use step"` functions in production.

The factory instance id is now derived deterministically from the config's stable identity (sorted plug/flow/cache/resource names) instead of a per-process `crypto.randomUUID()`. A workflow step runs in a fresh isolate that re-imports the flow module and re-runs `khotan(config)`; deriving the id from config identity means the re-imported module lands on the same runtime-registry key, so cache/mapping helpers resolve across the isolate boundary (the same way plug vars already survive via serialized context).

Also adds a sole-instance fallback in the registry lookup (resolve to the only registered instance on a miss) and a clearer error when multiple instances are registered and none match.
