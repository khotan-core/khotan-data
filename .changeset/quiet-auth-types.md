---
"khotan-data": patch
---

Widen the generated factory and persisted plug auth metadata so consumers can remove scaffold workarounds. `drizzleAdapter(db)` now accepts transaction-free Drizzle database subsets without the previous `as unknown as` double-cast, and custom auth types such as `tokenExchange` are stored as-is instead of being coerced to the built-in bearer/basic/apiKey/custom set.
