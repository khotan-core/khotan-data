---
"khotan-data": minor
---

Secure the management API by default. Omitting `authorize` now denies management requests in development and throws in production, while `authorize: false` is limited to non-production explicit opt-out. Added `khotan add auth` to scaffold Better Auth and wire the khotan authorize hook.
