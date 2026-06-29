---
"khotan-data": patch
---

Add resource-name mapping helpers with `mapping(resourceName).upsert(...)`,
`lookup(...)`, and `lookupByRef(...)`, plus explicit `mergeRefs` control for
partial ref merges versus full replacement.
