import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    pipeline: "src/pipeline.ts",
    transform: "src/transform.ts",
    extract: "src/extract.ts",
    load: "src/load.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  minify: false,
  outDir: "dist",
  target: "es2022",
});
