import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resolveDrizzleSchemaDir } from "./drizzle-detect.js";

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
