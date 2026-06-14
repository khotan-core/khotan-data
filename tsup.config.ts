import { defineConfig } from "tsup";
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const libraryEntries = {
  index: "src/index.ts",
  pipeline: "src/pipeline.ts",
  transform: "src/transform.ts",
  drizzle: "src/drizzle.ts",
  factory: "src/factory.ts",
  "plug-client": "src/plug-client.ts",
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
    external: ["drizzle-orm", "zod"],
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
        path.resolve("src", "cli", "templates", "plug.example.ts"),
        path.resolve(templatesDir, "plug.example.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "schema.ts"),
        path.resolve(templatesDir, "schema.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "cache.ts"),
        path.resolve(templatesDir, "cache.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "cache.example.ts"),
        path.resolve(templatesDir, "cache.example.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "wire.ts"),
        path.resolve(templatesDir, "wire.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "api-state.tsx"),
        path.resolve(templatesDir, "api-state.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "hub.tsx"),
        path.resolve(templatesDir, "hub.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "logs.tsx"),
        path.resolve(templatesDir, "logs.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "mapping-browser.tsx"),
        path.resolve(templatesDir, "mapping-browser.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "runs-table.tsx"),
        path.resolve(templatesDir, "runs-table.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "webhook-events-table.tsx"),
        path.resolve(templatesDir, "webhook-events-table.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "khotan-route.ts"),
        path.resolve(templatesDir, "khotan-route.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "khotan-config.ts"),
        path.resolve(templatesDir, "khotan-config.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "config-page.tsx"),
        path.resolve(templatesDir, "config-page.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "wire-panel.tsx"),
        path.resolve(templatesDir, "wire-panel.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "var-panel.tsx"),
        path.resolve(templatesDir, "var-panel.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "plug-debugger.tsx"),
        path.resolve(templatesDir, "plug-debugger.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "debug-index-page.tsx"),
        path.resolve(templatesDir, "debug-index-page.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "debug-page.tsx"),
        path.resolve(templatesDir, "debug-page.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "logs-page.tsx"),
        path.resolve(templatesDir, "logs-page.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "topology-canvas.tsx"),
        path.resolve(templatesDir, "topology-canvas.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "graph-page.tsx"),
        path.resolve(templatesDir, "graph-page.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "mappings-page.tsx"),
        path.resolve(templatesDir, "mappings-page.tsx"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "catch.ts"),
        path.resolve(templatesDir, "catch.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "catch.example.ts"),
        path.resolve(templatesDir, "catch.example.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "pass.ts"),
        path.resolve(templatesDir, "pass.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "pass.example.ts"),
        path.resolve(templatesDir, "pass.example.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "inflow.ts"),
        path.resolve(templatesDir, "inflow.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "inflow.example.ts"),
        path.resolve(templatesDir, "inflow.example.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "outflow.ts"),
        path.resolve(templatesDir, "outflow.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "outflow.example.ts"),
        path.resolve(templatesDir, "outflow.example.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "relay.ts"),
        path.resolve(templatesDir, "relay.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "relay.example.ts"),
        path.resolve(templatesDir, "relay.example.ts"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "agent-skill.md"),
        path.resolve(templatesDir, "agent-skill.md"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "skill-setup.md"),
        path.resolve(templatesDir, "skill-setup.md"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "skill-plug.md"),
        path.resolve(templatesDir, "skill-plug.md"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "skill-dashboard.md"),
        path.resolve(templatesDir, "skill-dashboard.md"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "skill-webhook.md"),
        path.resolve(templatesDir, "skill-webhook.md"),
      );
      copyFileSync(
        path.resolve("src", "cli", "templates", "agents.md"),
        path.resolve(templatesDir, "agents.md"),
      );
    },
  },
]);
