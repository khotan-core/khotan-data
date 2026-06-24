---
"khotan-data": patch
---

The `logs` component now declares `lucide-react` as an npm dependency. Its
`runs-table.tsx` imports an icon from `lucide-react`, so scaffolding `logs` into a
fresh app previously produced code that failed to typecheck/run until the package
was installed by hand.
