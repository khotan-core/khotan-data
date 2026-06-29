---
"khotan-data": patch
---

Flow runs now finalize reliably from returned workflow `FlowRunResult` values. Inline `run(ctx)` handlers expose `ctx.finalize(result)` as a race-idempotent escape hatch; durable workflow contexts rely on returned `FlowRunResult` values as the production-safe contract. Manual start bodies are persisted as initial run metadata and preserved unless the final result explicitly supplies metadata.
