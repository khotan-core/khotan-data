---
"khotan-data": patch
---

Scaffolded and rewritten Drizzle `schema` globs now target `*.ts` only (e.g.
`./db/schema/*.ts`) instead of `*`. This stops `drizzle-kit` from trying to parse
non-TypeScript files such as `AGENTS.md` in the schema directory, which crashed
`migrate` with a misleading `SyntaxError`.
