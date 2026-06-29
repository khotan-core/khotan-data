---
"khotan-data": patch
---

Accept `--json` on the API-backed CLI read commands (`flows`, `mappings`, `plug`,
`wire`). Their output is already JSON, so the flag is explicit/no-op, but passing
it no longer errors with `unknown option '--json'`. (`plug vars --json <payload>`
keeps its existing value-taking meaning.)
