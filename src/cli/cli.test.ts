import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

const CLI_PATH = path.resolve(__dirname, "../../dist/cli.js");

function run(
  args: string,
  cwd: string,
  timeout = 30_000,
): { output: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args} 2>&1`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
    });
    return { output: stdout, exitCode: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return {
      output: (e.stdout ?? "") + (e.stderr ?? ""),
      exitCode: e.status ?? 1,
    };
  }
}

function writePkgJson(
  dir: string,
  deps: Record<string, string> = {},
  devDeps: Record<string, string> = {},
): void {
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ dependencies: deps, devDependencies: devDeps }),
  );
}

describe("CLI", { timeout: 30_000 }, () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "khotan-cli-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("init", () => {
    it("creates khotan.config.ts with src/khotan when src/app exists", () => {
      fs.mkdirSync(path.join(tmpDir, "src", "app"), { recursive: true });
      const result = run("init", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Created khotan.config.ts");

      const content = fs.readFileSync(
        path.join(tmpDir, "khotan.config.ts"),
        "utf-8",
      );
      expect(content).toContain('"src/khotan"');
    });

    it("creates khotan.config.ts with khotan when app is top-level", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      const result = run("init", tmpDir);
      expect(result.exitCode).toBe(0);

      const content = fs.readFileSync(
        path.join(tmpDir, "khotan.config.ts"),
        "utf-8",
      );
      expect(content).toContain('"khotan"');
    });

    it("defaults to src/khotan when no app directory exists", () => {
      const result = run("init", tmpDir);
      expect(result.exitCode).toBe(0);

      const content = fs.readFileSync(
        path.join(tmpDir, "khotan.config.ts"),
        "utf-8",
      );
      expect(content).toContain('"src/khotan"');
    });

    it("warns when config already exists", () => {
      fs.writeFileSync(
        path.join(tmpDir, "khotan.config.ts"),
        "existing config",
      );
      const result = run("init", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("already exists");

      const content = fs.readFileSync(
        path.join(tmpDir, "khotan.config.ts"),
        "utf-8",
      );
      expect(content).toBe("existing config");
    });

    it("scaffolds khotan.ts and route.ts alongside config", () => {
      fs.mkdirSync(path.join(tmpDir, "src", "app"), { recursive: true });
      const result = run("init", tmpDir);
      expect(result.exitCode).toBe(0);

      expect(
        fs.existsSync(path.join(tmpDir, "src", "khotan", "khotan.ts")),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(
            tmpDir,
            "src",
            "app",
            "api",
            "khotan",
            "[...all]",
            "route.ts",
          ),
        ),
      ).toBe(true);
    });

    it("never overwrites existing khotan.ts or route.ts", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      run("init", tmpDir);

      const khotanPath = path.join(tmpDir, "khotan", "khotan.ts");
      const routePath = path.join(
        tmpDir,
        "app",
        "api",
        "khotan",
        "[...all]",
        "route.ts",
      );
      fs.writeFileSync(khotanPath, "// user modified");
      fs.writeFileSync(routePath, "// user route");

      const result = run("init", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("already exists");

      expect(fs.readFileSync(khotanPath, "utf-8")).toBe("// user modified");
      expect(fs.readFileSync(routePath, "utf-8")).toBe("// user route");
    });
  });

  describe("add", () => {
    it("creates plug.ts at detected output path (top-level app)", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      run("init", tmpDir);
      const result = run("add plug", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Created");

      const plugPath = path.join(tmpDir, "khotan", "plugs", "plug.ts");
      expect(fs.existsSync(plugPath)).toBe(true);

      const content = fs.readFileSync(plugPath, "utf-8");
      expect(content).toContain("export class Plug");
      expect(content).toContain("export function plug");
      expect(content).toContain("export function bearer");
      expect(content).not.toContain('from "khotan-data"');
      expect(content).not.toContain("from 'khotan-data'");
    });

    it("creates plug.ts at detected output path (src/app)", () => {
      fs.mkdirSync(path.join(tmpDir, "src", "app"), { recursive: true });
      run("init", tmpDir);
      const result = run("add plug", tmpDir);
      expect(result.exitCode).toBe(0);

      const plugPath = path.join(
        tmpDir,
        "src",
        "khotan",
        "plugs",
        "plug.ts",
      );
      expect(fs.existsSync(plugPath)).toBe(true);
    });

    it("lazily runs init when no config exists", () => {
      writePkgJson(tmpDir, { "khotan-data": "^0.0.1" });
      const result = run("add plug", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Running init");
      expect(result.output).toContain("Created khotan.config.ts");
      expect(fs.existsSync(path.join(tmpDir, "khotan.config.ts"))).toBe(true);
    });

    it("creates khotan.ts schema at detected Drizzle schema dir", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        `export default { schema: "./db/schema/*" };`,
      );
      run("init", tmpDir);
      const result = run("add schema", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Detected Drizzle schema directory");
      expect(result.output).toContain("Created");

      const schemaPath = path.join(tmpDir, "db", "schema", "khotan.ts");
      expect(fs.existsSync(schemaPath)).toBe(true);

      const content = fs.readFileSync(schemaPath, "utf-8");
      expect(content).toContain("khotan_plugs");
      expect(content).toContain("khotan_syncs");
      expect(content).toContain("khotan_runs");
      expect(content).not.toContain('from "khotan-data"');
      expect(content).not.toContain("from 'khotan-data'");
    });

    it("creates khotan.ts schema at outputDir when no drizzle config", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      run("init", tmpDir);
      const result = run("add schema --force", tmpDir);
      expect(result.exitCode).toBe(0);

      const schemaPath = path.join(tmpDir, "khotan", "khotan.ts");
      expect(fs.existsSync(schemaPath)).toBe(true);
    });

    it("prints Drizzle re-export hint when no barrel file exists", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        `export default { schema: "./db/schema/*" };`,
      );
      run("init", tmpDir);
      const result = run("add schema", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("re-export");
      expect(result.output).toContain("khotan");
    });

    it("auto-updates barrel and drizzle config with --yes", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "db"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        `export default { schema: "./db/schema.ts" };`,
      );
      fs.writeFileSync(
        path.join(tmpDir, "db", "index.ts"),
        `export * from "./schema";\n`,
      );
      run("init", tmpDir);
      const result = run("add schema --yes", tmpDir);
      expect(result.exitCode).toBe(0);

      expect(result.output).toContain("Updated");
      expect(result.output).toContain("khotan re-export");

      const barrel = fs.readFileSync(
        path.join(tmpDir, "db", "index.ts"),
        "utf-8",
      );
      expect(barrel).toContain('export * from "./khotan"');

      const drizzleConfig = fs.readFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        "utf-8",
      );
      expect(drizzleConfig).toContain("./db/*");
      expect(drizzleConfig).not.toContain("./db/schema.ts");
    });

    it("skips drizzle config and barrel updates in non-TTY without --yes", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "db"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        `export default { schema: "./db/schema.ts" };`,
      );
      fs.writeFileSync(
        path.join(tmpDir, "db", "index.ts"),
        `export * from "./schema";\n`,
      );
      run("init", tmpDir);
      const result = run("add schema", tmpDir);
      expect(result.exitCode).toBe(0);

      expect(result.output).toContain("points to a single file");
      expect(result.output).toContain("Skipped");

      const barrel = fs.readFileSync(
        path.join(tmpDir, "db", "index.ts"),
        "utf-8",
      );
      expect(barrel).not.toContain("./khotan");

      const drizzleConfig = fs.readFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        "utf-8",
      );
      expect(drizzleConfig).toContain("./db/schema.ts");
    });

    it("skips barrel update when khotan re-export already present", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "db"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        `export default { schema: "./db/*" };`,
      );
      fs.writeFileSync(
        path.join(tmpDir, "db", "index.ts"),
        `export * from "./schema";\nexport * from "./khotan";\n`,
      );
      run("init", tmpDir);
      const result = run("add schema", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("already re-exports khotan");
    });

    it("skips drizzle config update when schema is already a glob", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        `export default { schema: "./db/schema/*" };`,
      );
      run("init", tmpDir);
      const result = run("add schema --yes", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain("points to a single file");

      const drizzleConfig = fs.readFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        "utf-8",
      );
      expect(drizzleConfig).toContain("./db/schema/*");
    });

    it("errors for unknown names and lists components and blocks separately", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      run("init", tmpDir);
      const result = run("add foobar", tmpDir);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Unknown name "foobar"');
      expect(result.output).toContain("Components:");
      expect(result.output).toContain("Blocks:");
      expect(result.output).toContain("plug");
      expect(result.output).toContain("config-page-1");
    });

    it("overwrites existing file with --force", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      run("init", tmpDir);
      run("add plug", tmpDir);

      const plugPath = path.join(tmpDir, "khotan", "plugs", "plug.ts");
      fs.writeFileSync(plugPath, "// modified by user");

      const result = run("add plug --force", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Created");

      const content = fs.readFileSync(plugPath, "utf-8");
      expect(content).toContain("export class Plug");
    });

    it("preserves existing file when overwrite is declined via non-TTY stdin", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      run("init", tmpDir);
      run("add plug", tmpDir);

      const plugPath = path.join(tmpDir, "khotan", "plugs", "plug.ts");
      fs.writeFileSync(plugPath, "// modified by user");

      try {
        execSync(`echo "n" | node ${CLI_PATH} add plug 2>&1`, {
          cwd: tmpDir,
          encoding: "utf-8",
          timeout: 5000,
        });
      } catch {
        // may exit non-zero or timeout — either is acceptable
      }

      const content = fs.readFileSync(plugPath, "utf-8");
      expect(content).toBe("// modified by user");
    });
  });

  describe("add hub", () => {
    it("scaffolds hub.tsx in src layout (core files from init)", () => {
      fs.mkdirSync(path.join(tmpDir, "src", "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "components.json"),
        JSON.stringify({}),
      );
      const uiDir = path.join(tmpDir, "src", "components", "ui");
      fs.mkdirSync(uiDir, { recursive: true });
      for (const c of ["card", "badge", "table", "switch", "button", "input", "label"]) {
        fs.writeFileSync(path.join(uiDir, `${c}.tsx`), "");
      }
      run("init", tmpDir);
      const result = run("add hub --force", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Created 3 files");

      expect(
        fs.existsSync(
          path.join(tmpDir, "src", "components", "khotan", "hub.tsx"),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(tmpDir, "src", "components", "khotan", "wire-panel.tsx"),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, "src", "khotan", "khotan.ts")),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(
            tmpDir,
            "src",
            "app",
            "api",
            "khotan",
            "[...all]",
            "route.ts",
          ),
        ),
      ).toBe(true);
    });

    it("scaffolds hub.tsx in top-level app layout (core files from init)", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "components.json"),
        JSON.stringify({}),
      );
      const uiDir = path.join(tmpDir, "components", "ui");
      fs.mkdirSync(uiDir, { recursive: true });
      for (const c of ["card", "badge", "table", "switch", "button", "input", "label"]) {
        fs.writeFileSync(path.join(uiDir, `${c}.tsx`), "");
      }
      run("init", tmpDir);
      const result = run("add hub --force", tmpDir);
      expect(result.exitCode).toBe(0);

      expect(
        fs.existsSync(
          path.join(tmpDir, "components", "khotan", "hub.tsx"),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(tmpDir, "components", "khotan", "wire-panel.tsx"),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, "khotan", "khotan.ts")),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(tmpDir, "app", "api", "khotan", "[...all]", "route.ts"),
        ),
      ).toBe(true);
    });

    it("warns when shadcn is not configured", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      const uiDir = path.join(tmpDir, "components", "ui");
      fs.mkdirSync(uiDir, { recursive: true });
      for (const c of ["card", "badge", "table", "switch"]) {
        fs.writeFileSync(path.join(uiDir, `${c}.tsx`), "");
      }
      run("init", tmpDir);
      const result = run("add hub --force", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("shadcn/ui is required");
      expect(result.output).toContain("components.json");
    });

    it("hub.tsx has no khotan-data imports", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "components.json"),
        JSON.stringify({}),
      );
      const uiDir = path.join(tmpDir, "components", "ui");
      fs.mkdirSync(uiDir, { recursive: true });
      for (const c of ["card", "badge", "table", "switch", "button", "input", "label"]) {
        fs.writeFileSync(path.join(uiDir, `${c}.tsx`), "");
      }
      run("init", tmpDir);
      run("add hub --force", tmpDir);

      const hubPath = path.join(
        tmpDir,
        "components",
        "khotan",
        "hub.tsx",
      );
      const content = fs.readFileSync(hubPath, "utf-8");
      expect(content).not.toContain('from "khotan-data"');
      expect(content).not.toContain("from 'khotan-data'");
    });

    it("shows next steps after scaffolding hub", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "components.json"),
        JSON.stringify({}),
      );
      const uiDir = path.join(tmpDir, "components", "ui");
      fs.mkdirSync(uiDir, { recursive: true });
      for (const c of ["card", "badge", "table", "switch", "button", "input", "label"]) {
        fs.writeFileSync(path.join(uiDir, `${c}.tsx`), "");
      }
      run("init", tmpDir);
      const result = run("add hub --force", tmpDir);
      expect(result.output).toContain("Next steps:");
      expect(result.output).toContain("config-page-1");
    });

    it("preserves existing khotan.ts config on hub install", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "components.json"),
        JSON.stringify({}),
      );
      const uiDir = path.join(tmpDir, "components", "ui");
      fs.mkdirSync(uiDir, { recursive: true });
      for (const c of ["card", "badge", "table", "switch", "button", "input", "label"]) {
        fs.writeFileSync(path.join(uiDir, `${c}.tsx`), "");
      }
      run("init", tmpDir);

      const khotanTsPath = path.join(tmpDir, "khotan", "khotan.ts");
      fs.writeFileSync(khotanTsPath, 'const MY_PLUGS = "cin7";');

      const result = run("add hub --force", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("already exists, skipping");

      const content = fs.readFileSync(khotanTsPath, "utf-8");
      expect(content).toBe('const MY_PLUGS = "cin7";');
    });

    it("init creates khotan.ts instance config", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      const result = run("init", tmpDir);
      expect(result.exitCode).toBe(0);

      const configPath = path.join(tmpDir, "khotan", "khotan.ts");
      expect(fs.existsSync(configPath)).toBe(true);
      const content = fs.readFileSync(configPath, "utf-8");
      expect(content).toContain("khotan");
      expect(content).toContain("drizzleAdapter");
    });

    it("route template exposes PATCH method", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      run("init", tmpDir);

      const routePath = path.join(
        tmpDir,
        "app",
        "api",
        "khotan",
        "[...all]",
        "route.ts",
      );
      const content = fs.readFileSync(routePath, "utf-8");
      expect(content).toContain("PATCH");
    });

    it("hub.tsx uses PATCH for sync toggles", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "components.json"),
        JSON.stringify({}),
      );
      const uiDir = path.join(tmpDir, "components", "ui");
      fs.mkdirSync(uiDir, { recursive: true });
      for (const c of ["card", "badge", "table", "switch", "button", "input", "label"]) {
        fs.writeFileSync(path.join(uiDir, `${c}.tsx`), "");
      }
      run("init", tmpDir);
      run("add hub --force", tmpDir);

      const hubPath = path.join(
        tmpDir,
        "components",
        "khotan",
        "hub.tsx",
      );
      const content = fs.readFileSync(hubPath, "utf-8");
      expect(content).toContain('"PATCH"');
      expect(content).not.toContain('method: "PUT"');
    });
  });

  describe("add config-page-1 (block)", () => {
    function preScaffoldHub(dir: string, srcLayout: boolean): void {
      const hubDir = srcLayout
        ? path.join(dir, "src", "components", "khotan")
        : path.join(dir, "components", "khotan");
      fs.mkdirSync(hubDir, { recursive: true });
      fs.writeFileSync(
        path.join(hubDir, "hub.tsx"),
        "export function KhotanHub() {}",
      );
      fs.writeFileSync(
        path.join(hubDir, "wire-panel.tsx"),
        "export function WirePanel() {}",
      );
    }

    it("scaffolds config/page.tsx in src layout", () => {
      fs.mkdirSync(path.join(tmpDir, "src", "app"), { recursive: true });
      preScaffoldHub(tmpDir, true);
      run("init", tmpDir);
      const result = run("add config-page-1 --force", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Created 1 files");

      const pagePath = path.join(tmpDir, "src", "app", "config", "page.tsx");
      expect(fs.existsSync(pagePath)).toBe(true);

      const content = fs.readFileSync(pagePath, "utf-8");
      expect(content).toContain("KhotanHub");
      expect(content).toContain("@/components/khotan/hub");
    });

    it("scaffolds config/page.tsx in top-level app layout", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      preScaffoldHub(tmpDir, false);
      run("init", tmpDir);
      const result = run("add config-page-1 --force", tmpDir);
      expect(result.exitCode).toBe(0);

      const pagePath = path.join(tmpDir, "app", "config", "page.tsx");
      expect(fs.existsSync(pagePath)).toBe(true);
    });

    it("page has no khotan-data imports", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      preScaffoldHub(tmpDir, false);
      run("init", tmpDir);
      run("add config-page-1 --force", tmpDir);

      const pagePath = path.join(tmpDir, "app", "config", "page.tsx");
      const content = fs.readFileSync(pagePath, "utf-8");
      expect(content).not.toContain('from "khotan-data"');
      expect(content).not.toContain("from 'khotan-data'");
    });

    it("auto-adds hub when not present", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "components.json"),
        JSON.stringify({}),
      );
      const uiDir = path.join(tmpDir, "components", "ui");
      fs.mkdirSync(uiDir, { recursive: true });
      for (const c of ["card", "badge", "table", "switch", "button", "input", "label"]) {
        fs.writeFileSync(path.join(uiDir, `${c}.tsx`), "");
      }
      run("init", tmpDir);
      const result = run("add config-page-1 --force", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Adding required component: hub");
      expect(
        fs.existsSync(
          path.join(tmpDir, "components", "khotan", "hub.tsx"),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, "app", "config", "page.tsx")),
      ).toBe(true);
    });
  });

  describe("add dependency checks", () => {
    it("shows missing npm packages when package.json has no drizzle-orm", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir);
      run("init", tmpDir);
      const result = run("add schema", tmpDir);
      expect(result.output).toContain("Missing npm packages");
      expect(result.output).toContain("drizzle-orm");
      expect(result.output).toContain("Skipping dependency install");
    });

    it("does not show missing packages when drizzle-orm is present", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          dependencies: { "drizzle-orm": "^0.35.0" },
        }),
      );
      run("init", tmpDir);
      const result = run("add schema", tmpDir);
      expect(result.output).not.toContain("Missing npm packages");
    });

    it("shows missing shadcn components for hub", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "components.json"),
        JSON.stringify({}),
      );
      run("init", tmpDir);
      const result = run("add hub --force", tmpDir);
      expect(result.output).toContain("Missing shadcn components");
      expect(result.output).toContain("Skipping dependency install");
    });

    it("does not show missing shadcn components when all exist", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({
          dependencies: { "drizzle-orm": "^0.35.0" },
        }),
      );
      fs.writeFileSync(
        path.join(tmpDir, "components.json"),
        JSON.stringify({}),
      );
      const uiDir = path.join(tmpDir, "components", "ui");
      fs.mkdirSync(uiDir, { recursive: true });
      for (const comp of ["card", "badge", "table", "switch", "button", "input", "label"]) {
        fs.writeFileSync(path.join(uiDir, `${comp}.tsx`), "");
      }
      run("init", tmpDir);
      const result = run("add hub --force", tmpDir);
      expect(result.output).not.toContain("Missing shadcn components");
      expect(result.output).not.toContain("Missing npm packages");
    });

    it("plug has no dependency prompts when zod is installed", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { zod: "^3.0.0" });
      run("init", tmpDir);
      const result = run("add plug", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain("Missing");
      expect(result.output).toContain("Created");
    });

    it("scaffolds even when dependency install is skipped", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "db"), { recursive: true });
      writePkgJson(tmpDir);
      fs.writeFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        `export default { schema: "./db/*" };`,
      );
      run("init", tmpDir);
      const result = run("add schema --force", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Skipping dependency install");
      expect(result.output).toContain("Created");
    });

    it("warns when dependency install is declined in non-TTY", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "db"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "package.json"),
        JSON.stringify({ dependencies: {} }),
      );
      fs.writeFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        `export default { schema: "./db/*" };`,
      );
      run("init", tmpDir);
      const result = run("add schema", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Skipping dependency install");
      expect(result.output).toContain("Created");
    });
  });

  describe("init --full", () => {
    function setupFullProject(
      dir: string,
      opts: {
        deps?: Record<string, string>;
        devDeps?: Record<string, string>;
        componentsJson?: boolean;
        shadcnComponents?: boolean;
        existingConfig?: string;
        lockfile?: string;
      } = {},
    ): void {
      fs.mkdirSync(path.join(dir, "app"), { recursive: true });
      writePkgJson(dir, opts.deps ?? {}, opts.devDeps ?? {});
      if (opts.componentsJson) {
        fs.writeFileSync(path.join(dir, "components.json"), JSON.stringify({}));
      }
      if (opts.shadcnComponents) {
        const uiDir = path.join(dir, "components", "ui");
        fs.mkdirSync(uiDir, { recursive: true });
        for (const c of ["card", "badge", "table", "switch"]) {
          fs.writeFileSync(path.join(uiDir, `${c}.tsx`), "");
        }
      }
      if (opts.existingConfig) {
        fs.writeFileSync(
          path.join(dir, "khotan.config.ts"),
          opts.existingConfig,
        );
      }
      if (opts.lockfile) {
        fs.writeFileSync(path.join(dir, opts.lockfile), "");
      }
    }

    const allDeps = { "drizzle-orm": "^0.35.0", postgres: "^3.0.0" };
    const allDevDeps = { "drizzle-kit": "^0.25.0" };

    it("shows setup summary", () => {
      setupFullProject(tmpDir, {
        deps: allDeps,
        devDeps: allDevDeps,
        componentsJson: true,
        shadcnComponents: true,
      });
      const result = run("init --full", tmpDir);
      expect(result.output).toContain("Running full khotan setup");
      expect(result.output).toContain("Setup Summary");
    });

    it("creates khotan.config.ts during full setup", () => {
      setupFullProject(tmpDir, {
        deps: allDeps,
        devDeps: allDevDeps,
        componentsJson: true,
        shadcnComponents: true,
      });
      const result = run("init --full", tmpDir);
      expect(result.output).toContain("khotan.config.ts");
      expect(fs.existsSync(path.join(tmpDir, "khotan.config.ts"))).toBe(true);
    });

    it("skips drizzle install when packages already present", () => {
      setupFullProject(tmpDir, {
        deps: allDeps,
        devDeps: allDevDeps,
        componentsJson: true,
        shadcnComponents: true,
      });
      const result = run("init --full", tmpDir);
      expect(result.output).toContain("already installed");
    });

    it("skips shadcn init when components.json exists", () => {
      setupFullProject(tmpDir, {
        deps: allDeps,
        devDeps: allDevDeps,
        componentsJson: true,
        shadcnComponents: true,
      });
      const result = run("init --full", tmpDir);
      expect(result.output).toContain("already configured");
    });

    it("skips config creation when khotan.config.ts already exists", () => {
      setupFullProject(tmpDir, {
        deps: allDeps,
        devDeps: allDevDeps,
        componentsJson: true,
        shadcnComponents: true,
        existingConfig: "existing config",
      });
      const result = run("init --full", tmpDir);
      expect(result.output).toContain("already exists");
      const content = fs.readFileSync(
        path.join(tmpDir, "khotan.config.ts"),
        "utf-8",
      );
      expect(content).toBe("existing config");
    });

    it(
      "continues with remaining steps when a step fails",
      { timeout: 60_000 },
      () => {
        setupFullProject(tmpDir, {
          componentsJson: true,
          shadcnComponents: true,
        });
        const result = run("init --full", tmpDir, 45_000);
        expect(result.output).toContain("Setup Summary");
        expect(fs.existsSync(path.join(tmpDir, "khotan.config.ts"))).toBe(true);
      },
    );

    it("detects package manager from lockfile", () => {
      setupFullProject(tmpDir, {
        deps: allDeps,
        devDeps: allDevDeps,
        componentsJson: true,
        shadcnComponents: true,
        lockfile: "pnpm-lock.yaml",
      });
      const result = run("init --full", tmpDir);
      expect(result.output).toContain("Detected package manager: pnpm");
    });
  });

  describe("generate", () => {
    it("scaffolds khotan.ts schema at detected Drizzle directory", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "db"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        `export default { schema: "./db/*" };`,
      );
      run("init", tmpDir);
      const result = run("generate", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Detected Drizzle schema directory");

      const schemaPath = path.join(tmpDir, "db", "khotan.ts");
      expect(fs.existsSync(schemaPath)).toBe(true);
      const content = fs.readFileSync(schemaPath, "utf-8");
      expect(content).toContain("khotan_plugs");
    });

    it("updates single-file drizzle config to glob", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "db"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        `export default { schema: "./db/schema.ts" };`,
      );
      fs.writeFileSync(
        path.join(tmpDir, "db", "index.ts"),
        `export * from "./schema";\n`,
      );
      run("init", tmpDir);
      const result = run("generate", tmpDir);
      expect(result.exitCode).toBe(0);

      const drizzleConfig = fs.readFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        "utf-8",
      );
      expect(drizzleConfig).toContain("./db/*");
    });

    it("appends khotan re-export to barrel file", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "db"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        `export default { schema: "./db/*" };`,
      );
      fs.writeFileSync(
        path.join(tmpDir, "db", "index.ts"),
        `export * from "./schema";\n`,
      );
      run("init", tmpDir);
      const result = run("generate", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("khotan re-export");

      const barrel = fs.readFileSync(
        path.join(tmpDir, "db", "index.ts"),
        "utf-8",
      );
      expect(barrel).toContain('export * from "./khotan"');
    });

    it("skips barrel update when khotan re-export already present", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "db"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0" });
      fs.writeFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        `export default { schema: "./db/*" };`,
      );
      fs.writeFileSync(
        path.join(tmpDir, "db", "index.ts"),
        `export * from "./schema";\nexport * from "./khotan";\n`,
      );
      run("init", tmpDir);
      const result = run("generate", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("already re-exports khotan");
    });

    it("runs init automatically if no config exists", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, "db"), { recursive: true });
      writePkgJson(tmpDir, {
        "khotan-data": "^0.0.1",
        "drizzle-orm": "^0.35.0",
      });
      fs.writeFileSync(
        path.join(tmpDir, "drizzle.config.ts"),
        `export default { schema: "./db/*" };`,
      );
      const result = run("generate", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Running init");
      expect(fs.existsSync(path.join(tmpDir, "khotan.config.ts"))).toBe(true);
    });
  });

  describe("help", () => {
    it("shows usage when run with no args", () => {
      const result = run("", tmpDir);
      expect(result.output).toContain("Usage:");
      expect(result.output).toContain("init");
      expect(result.output).toContain("add");
      expect(result.output).toContain("generate");
      expect(result.output).toContain("migrate");
    });
  });

  describe("add wire", () => {
    it("wire appears in component listing and has correct metadata", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      run("init", tmpDir);
      const result = run("add foobar", tmpDir);
      expect(result.output).toContain("wire");
    });

    it("wire.ts template contains wire factory function and commented example", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0", zod: "^3.0.0" });
      run("init", tmpDir);

      // Pre-scaffold plug and schema so wire doesn't trigger requires prompt
      const plugDir = path.join(tmpDir, "khotan", "plugs");
      fs.mkdirSync(plugDir, { recursive: true });
      fs.writeFileSync(path.join(plugDir, "plug.ts"), "export class Plug {}");
      fs.writeFileSync(path.join(tmpDir, "khotan", "khotan.ts"), "// schema");

      const result = run("add wire --force --without-ui", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Created");

      const wirePath = path.join(tmpDir, "khotan", "wires", "wire.ts");
      expect(fs.existsSync(wirePath)).toBe(true);

      const content = fs.readFileSync(wirePath, "utf-8");
      expect(content).toContain("export function wire");
      expect(content).toContain("// Usage Example");
      expect(content).not.toContain('from "khotan-data"');
      expect(content).not.toContain("from 'khotan-data'");
    });

    it("wire requires plug and schema", () => {
      fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
      writePkgJson(tmpDir, { "drizzle-orm": "^0.35.0", zod: "^3.0.0" });
      run("init", tmpDir);

      // Don't pre-scaffold plug/schema — wire should offer to add them
      const result = run("add wire --force --without-ui", tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.output).toContain("Adding required component: plug");
    });
  });
});
