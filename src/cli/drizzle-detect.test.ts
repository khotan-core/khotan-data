import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  resolveDrizzleSchemaDir,
  detectSingleFileSchema,
  updateDrizzleConfigSchema,
} from "./drizzle-detect.js";

describe("resolveDrizzleSchemaDir", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "khotan-drizzle-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when drizzle.config.ts does not exist", () => {
    expect(resolveDrizzleSchemaDir(tmpDir)).toBeNull();
  });

  it('detects directory from string path: "./src/db/schema"', () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      `export default { schema: "./src/db/schema" };`,
    );
    expect(resolveDrizzleSchemaDir(tmpDir)).toBe("src/db/schema");
  });

  it('detects directory from file path: "./src/db/schema.ts"', () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      `export default { schema: "./src/db/schema.ts" };`,
    );
    expect(resolveDrizzleSchemaDir(tmpDir)).toBe("src/db");
  });

  it('detects directory from glob: "./src/db/schema/*"', () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      `export default { schema: "./src/db/schema/*" };`,
    );
    expect(resolveDrizzleSchemaDir(tmpDir)).toBe("src/db/schema");
  });

  it('detects directory from glob with extension: "./db/schema/*.ts"', () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      `export default { schema: "./db/schema/*.ts" };`,
    );
    expect(resolveDrizzleSchemaDir(tmpDir)).toBe("db/schema");
  });

  it("handles single-quoted strings", () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      `export default { schema: './src/db/schema' };`,
    );
    expect(resolveDrizzleSchemaDir(tmpDir)).toBe("src/db/schema");
  });

  it("handles backtick strings", () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      "export default { schema: `./src/db/schema` };",
    );
    expect(resolveDrizzleSchemaDir(tmpDir)).toBe("src/db/schema");
  });

  it("returns null when schema property is not a string", () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      `export default { schema: ["./src/db/schema/*"] };`,
    );
    expect(resolveDrizzleSchemaDir(tmpDir)).toBeNull();
  });

  it("returns null for unparseable config", () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      "this is not valid ts but has no schema property",
    );
    expect(resolveDrizzleSchemaDir(tmpDir)).toBeNull();
  });

  it("handles config with defineConfig wrapper", () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      `import { defineConfig } from "drizzle-kit";\nexport default defineConfig({ schema: "./drizzle/schema.ts" });`,
    );
    expect(resolveDrizzleSchemaDir(tmpDir)).toBe("drizzle");
  });

  it("handles path without leading ./", () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      `export default { schema: "src/db/schema" };`,
    );
    expect(resolveDrizzleSchemaDir(tmpDir)).toBe("src/db/schema");
  });
});

describe("detectSingleFileSchema", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "khotan-drizzle-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects single file schema and returns glob replacement", () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      `export default { schema: "./src/db/schema.ts" };`,
    );
    const result = detectSingleFileSchema(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.currentValue).toBe("./src/db/schema.ts");
    expect(result!.globValue).toBe("./src/db/*");
  });

  it("returns null for glob schema", () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      `export default { schema: "./src/db/schema/*" };`,
    );
    expect(detectSingleFileSchema(tmpDir)).toBeNull();
  });

  it("returns null for directory schema", () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      `export default { schema: "./src/db/schema" };`,
    );
    expect(detectSingleFileSchema(tmpDir)).toBeNull();
  });

  it("returns null when no config exists", () => {
    expect(detectSingleFileSchema(tmpDir)).toBeNull();
  });

  it("preserves ./ prefix in glob value", () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      `export default { schema: "./db/schema.ts" };`,
    );
    const result = detectSingleFileSchema(tmpDir);
    expect(result!.globValue).toBe("./db/*");
  });

  it("handles path without ./ prefix", () => {
    fs.writeFileSync(
      path.join(tmpDir, "drizzle.config.ts"),
      `export default { schema: "src/db/schema.ts" };`,
    );
    const result = detectSingleFileSchema(tmpDir);
    expect(result!.currentValue).toBe("src/db/schema.ts");
    expect(result!.globValue).toBe("src/db/*");
  });
});

describe("updateDrizzleConfigSchema", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "khotan-drizzle-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("replaces single file schema with glob and returns true", () => {
    const configPath = path.join(tmpDir, "drizzle.config.ts");
    fs.writeFileSync(
      configPath,
      `import { defineConfig } from "drizzle-kit";\nexport default defineConfig({ schema: "./src/db/schema.ts", out: "./drizzle" });`,
    );
    const replaced = updateDrizzleConfigSchema(configPath, "./src/db/schema.ts", "./src/db/*");
    expect(replaced).toBe(true);
    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain('"./src/db/*"');
    expect(content).not.toContain("schema.ts");
    expect(content).toContain("drizzle-kit");
    expect(content).toContain("./drizzle");
  });

  it("returns false when pattern is not found", () => {
    const configPath = path.join(tmpDir, "drizzle.config.ts");
    fs.writeFileSync(
      configPath,
      `export default { schema: "./src/db/*" };`,
    );
    const replaced = updateDrizzleConfigSchema(configPath, "./src/db/schema.ts", "./src/db/*");
    expect(replaced).toBe(false);
    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain('"./src/db/*"');
  });

  it("preserves quote style", () => {
    const configPath = path.join(tmpDir, "drizzle.config.ts");
    fs.writeFileSync(
      configPath,
      `export default { schema: './db/schema.ts' };`,
    );
    updateDrizzleConfigSchema(configPath, "./db/schema.ts", "./db/*");
    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain("'./db/*'");
  });
});
