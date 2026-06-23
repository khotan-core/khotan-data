---
"khotan-data": minor
---

feat(cli): add `init --skills-only` to install agent skills without scaffolding core files

`npx khotan init --skills-only` installs only the agent skill set, skipping `khotan.config.ts`, the `khotan.ts` factory, the catch-all route, and the package install. Useful in polyrepo setups where the khotan-data runtime lives elsewhere and a separate location only hosts the skills. The flag is mutually exclusive with `--full`.
