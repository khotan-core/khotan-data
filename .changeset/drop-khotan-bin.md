---
"khotan-data": minor
---

Remove the `khotan` bin alias. The CLI is now exposed only as `khotan-data` to avoid clashing with other packages that ship a `khotan` bin. Update any scripts that invoke `khotan` to use `khotan-data`.
