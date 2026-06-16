---
"khotan-data": minor
---

Add a `khotan-data` bin alias to disambiguate from `@khotan/cli`.

Both packages declare a bin named `khotan`, so a project that depends on both
can only link one `node_modules/.bin/khotan`, making `npx khotan` resolve
nondeterministically. khotan-data now also exposes a `khotan-data` bin (the
existing `khotan` bin is unchanged), giving the ETL CLI an unambiguous
invocation. Help/usage text reflects whichever bin was used and defaults to
`khotan-data`.
