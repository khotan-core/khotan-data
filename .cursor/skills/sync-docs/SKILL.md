---
name: sync-docs
description: Sync khotan-data documentation to the ai-native-etl docs site. Updates both Markdown source files and React TSX pages. Use when the user mentions updating docs, syncing docs, ai-native-etl, or after making changes that should be reflected in documentation.
disable-model-invocation: true
---

# Sync Docs to ai-native-etl

Update khotan-data documentation on the ai-native-etl docs site at `/Users/coreyberther/Projects/ai-native-etl`.

## Docs Site Structure

The site uses a dual content system — no MDX. Every doc page has two files that must stay in sync:

| File | Purpose |
|------|---------|
| `src/content/docs/<slug>.md` | Markdown source (served raw via `.md` routes, used by LLM endpoints) |
| `src/app/docs/<slug>/page.tsx` | React page using doc primitives from `@/components/docs` |

### Existing Pages

| Slug | Route | Section |
|------|-------|---------|
| `index` | `/docs` | Get Started |
| `installation` | `/docs/installation` | Get Started |
| `basic-usage` | `/docs/basic-usage` | Get Started |
| `configuration` | `/docs/configuration` | Get Started |
| `how-it-works` | `/docs/how-it-works` | Get Started |
| `integrations/drizzle` | `/docs/integrations/drizzle` | Integrations |

Component docs live at `/docs/components/[slug]` — data-driven from `src/lib/components-data.ts`.

## Updating an Existing Page

1. Edit `src/content/docs/<slug>.md` with the new content
2. Edit `src/app/docs/<slug>/page.tsx` to match — use doc primitives:

```tsx
import {
  DocH1, DocH2, DocH3, DocLead, DocEyebrow,
  DocP, DocList, DocCode, DocCallout, DocInline,
  DocViewAsMarkdown,
} from '@/components/docs'
```

3. Keep both files semantically identical

## Adding a New Page

1. Create `src/content/docs/<slug>.md` with frontmatter:

```markdown
---
title: Page Title
description: Brief description.
section: Get Started
url: /docs/<slug>
---
```

2. Create `src/app/docs/<slug>/page.tsx` using doc primitives

3. Create the markdown route handler at `src/app/docs/<slug>.md/route.ts`:

```typescript
import { markdownResponse } from '@/lib/docs-response'

export const dynamic = 'force-static'

export function GET() {
  return markdownResponse('<slug>')
}
```

4. Register in `src/lib/docs-content.ts` — add entry to the `docs` array:

```typescript
{
  slug: '<slug>',
  title: 'Page Title',
  description: 'Brief description.',
  section: 'Get Started',
  url: '/docs/<slug>',
  mdUrl: '/docs/<slug>.md',
  file: '<slug>.md',
},
```

5. Add to sidebar in `src/components/docs-sidebar.tsx` — insert in the appropriate section

## Updating Component Data

Component docs are driven by `src/lib/components-data.ts`. Preview components live in `src/components/component-previews.tsx`.

Current component names (after Wire/Plug swap):
- **Plug** (Clients) — HTTP client with auth, retry, pagination
- **Wire** (Webhooks) — webhook subscription registration
- **Catch**, **Pass** (Webhooks)
- **Inflow**, **Outflow**, **Relay** (Flows)
- **Hub**, **Runs** (Dashboards)

## Updating Blocks

Blocks page: `src/app/docs/blocks/page.tsx` and `src/app/blocks/page.tsx`.

Current blocks:
- `config-page-1` — ready-made /config page rendering KhotanHub

## Checklist

- [ ] Markdown file updated (`src/content/docs/`)
- [ ] TSX page updated (`src/app/docs/`)
- [ ] If new page: route handler, docs-content.ts entry, sidebar link added
- [ ] If component change: `components-data.ts` updated
- [ ] Both .md and .tsx are semantically identical
