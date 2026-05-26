# khotan-data

Primitives and functions for data management — ETLs, pipelines, transformations, and more.

## Install

```bash
npm install khotan-data
```

## Quick Start

```typescript
import { Pipeline, fromArray, map, filter, toArray } from "khotan-data";

const output: { name: string; score: number }[] = [];

const result = await Pipeline.create("my-pipeline")
  .extract(
    fromArray("source", [
      { name: "Alice", score: 85 },
      { name: "Bob", score: 42 },
      { name: "Charlie", score: 91 },
    ]),
  )
  .transform(filter("passing", (r) => r.score >= 50))
  .transform(map("normalize", (r) => ({ ...r, score: r.score / 100 })))
  .load(toArray("sink", output))
  .run();

console.log(output);
// [{ name: "Alice", score: 0.85 }, { name: "Charlie", score: 0.91 }]

console.log(result);
// { recordsProcessed: 2, recordsLoaded: 2, errors: [], duration: ... }
```

## Subpath Imports

```typescript
import { Pipeline } from "khotan-data/pipeline";
import { map, filter, pick, omit, rename } from "khotan-data/transform";
import { fromArray, createExtractor } from "khotan-data/extract";
import { toArray, createLoader } from "khotan-data/load";
```

## Development

```bash
npm install        # install deps
npm run dev        # watch mode build
npm run test       # run tests
npm run test:watch # watch mode tests
npm run check      # typecheck + lint + format + test
npm run build      # production build
```

## License

MIT
