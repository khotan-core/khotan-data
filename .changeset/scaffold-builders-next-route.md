---
"khotan-data": minor
---

Export first-class scaffold builders from `khotan-data/factory`: `inflow`, `outflow`, `relay`, `catchEvent`, and `wire`. Flow contexts and `flow().start()` now accept typed body generics, and generated scaffold templates re-export the real builders instead of re-declaring local pass-through implementations.

Add `khotan-data/next` as a compatibility Next.js App Router subpath for projects that expose the standard `@/khotan/khotan` instance. `khotan init` now scaffolds route handlers with `toNextJsHandler` and a computed relative import to the generated instance, so custom output directories work without relying on aliases.

Hub UI remains scaffolded source in this release. Publishing `@khotan/hub` is intentionally left as a scoped packaging project because the current vendored Hub surface is large and should be split with explicit component API, peer dependency, and stylesheet contracts rather than shipped as a placeholder package.
