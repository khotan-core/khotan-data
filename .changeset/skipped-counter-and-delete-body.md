---
"khotan-data": minor
---

feat(flows): add a `skipped` counter to flow run results, and allow a request body on plug `delete`

Flow runs now track a `skipped` counter alongside created/updated/deleted/failed, giving delta-sync's most common outcome (records unchanged) a home; it threads through `FlowRunResult`, the `khotan_runs` table, `RunSummary`, the adapter, and the Slack notifier payload, and is treated as a neutral outcome that never drives partial/failed status. Bound plugs may now pass a request `body` on `delete`, unblocking batch soft-delete via `DELETE` (the plug template already forwarded it — only the type signatures forbade it).
