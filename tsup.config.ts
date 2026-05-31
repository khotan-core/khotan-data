import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const libraryEntries = {
  index: "src/index.ts",
  pipeline: "src/pipeline.ts",
  transform: "src/transform.ts",
  drizzle: "src/drizzle.ts",
  factory: "src/factory.ts",
};

export default defineConfig([
  {
    entry: libraryEntries,
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: true,
    treeshake: true,
    minify: false,
    outDir: "dist",
    target: "es2022",
    external: ["drizzle-orm"],
  },
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    dts: false,
    sourcemap: false,
    clean: false,
    splitting: false,
    treeshake: true,
    minify: false,
    outDir: "dist",
    target: "es2022",
    banner: { js: "#!/usr/bin/env node" },
    external: ["commander", "prompts"],
    onSuccess: async () => {
      const templatesDir = path.resolve("dist", "templates");
      mkdirSync(templatesDir, { recursive: true });
      copyFileSync(
        path.resolve("src", "cli", "templates", "plug.ts"),
        path.resolve(templatesDir, "plug.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "schema.ts"),
        path.resolve(templatesDir, "schema.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "hub.tsx"),
        path.resolve(templatesDir, "hub.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "khotan-route.ts"),
        path.resolve(templatesDir, "khotan-route.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "khotan-config.ts"),
        path.resolve(templatesDir, "khotan-config.ts"),
      );
    },
  },
]);
