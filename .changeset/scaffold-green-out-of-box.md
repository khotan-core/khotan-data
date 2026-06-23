---
"khotan-data": patch
---

fix(scaffold): generated example files compile and lint clean out of the box

`relay.example.ts` called `cache.set(key, value, { ttl })` with a third argument the `CacheInstance.set` signature doesn't accept (TTL is configured on the cache definition, not per call), so the scaffolded file failed `tsc`. Removed the stray argument. Also dropped an unused `eslint-disable` directive in the `plug.ts` template, and corrected the stale `start({ runType })` example in the README to `start({ variant })`.
