import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  parseEnvFile,
  parsePortFromEnvFile,
  resolveOutputDir,
  loadConfigOutputDir,
} from "./cli-api.js";

// ---------------------------------------------------------------------------
// parseEnvFile
// ---------------------------------------------------------------------------

describe("parseEnvFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "khotan-env-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses simple KEY=value lines", () => {
    const envPath = path.join(tmpDir, ".env");
    fs.writeFileSync(envPath, "PORT=3000\nDATABASE_URL=postgres://localhost\n");
    const result = parseEnvFile(envPath);
    expect(result).toEqual({
      PORT: "3000",
      DATABASE_URL: "postgres://localhost",
    });
  });

  it("handles double-quoted values preserving = and # inside", () => {
    const envPath = path.join(tmpDir, ".env");
    fs.writeFileSync(envPath, 'SECRET="abc=123#def"\n');
    expect(parseEnvFile(envPath)["SECRET"]).toBe("abc=123#def");
  });

  it("handles single-quoted values", () => {
    const envPath = path.join(tmpDir, ".env");
    fs.writeFileSync(envPath, "SECRET='hello world'\n");
    expect(parseEnvFile(envPath)["SECRET"]).toBe("hello world");
  });

  it("strips inline comments from unquoted values", () => {
    const envPath = path.join(tmpDir, ".env");
    fs.writeFileSync(envPath, "PORT=3000 # dev server port\n");
    expect(parseEnvFile(envPath)["PORT"]).toBe("3000");
  });

  it("handles export prefix", () => {
    const envPath = path.join(tmpDir, ".env");
    fs.writeFileSync(envPath, "export DATABASE_URL=postgres://localhost\n");
    expect(parseEnvFile(envPath)["DATABASE_URL"]).toBe("postgres://localhost");
  });

  it("preserves = inside unquoted values", () => {
    const envPath = path.join(tmpDir, ".env");
    fs.writeFileSync(envPath, "CONNECTION_STRING=host=localhost;port=5432\n");
    expect(parseEnvFile(envPath)["CONNECTION_STRING"]).toBe(
      "host=localhost;port=5432",
    );
  });

  it("skips comments and blank lines", () => {
    const envPath = path.join(tmpDir, ".env");
    fs.writeFileSync(envPath, "# comment\n\nPORT=3000\n");
    const result = parseEnvFile(envPath);
    expect(Object.keys(result)).toEqual(["PORT"]);
  });

  it("returns empty object for missing file", () => {
    expect(parseEnvFile(path.join(tmpDir, "nonexistent"))).toEqual({});
  });

  it("handles lowercase key names", () => {
    const envPath = path.join(tmpDir, ".env");
    fs.writeFileSync(envPath, "my_var=hello\n");
    expect(parseEnvFile(envPath)["my_var"]).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// parsePortFromEnvFile
// ---------------------------------------------------------------------------

describe("parsePortFromEnvFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "khotan-port-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("parses PORT from env file", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "PORT=4200\n");
    expect(parsePortFromEnvFile(path.join(tmpDir, ".env"))).toBe(4200);
  });

  it("returns null when PORT is missing", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "OTHER=value\n");
    expect(parsePortFromEnvFile(path.join(tmpDir, ".env"))).toBeNull();
  });

  it("returns null for non-numeric PORT", () => {
    fs.writeFileSync(path.join(tmpDir, ".env"), "PORT=abc\n");
    expect(parsePortFromEnvFile(path.join(tmpDir, ".env"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveOutputDir
// ---------------------------------------------------------------------------

describe("resolveOutputDir", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "khotan-outdir-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads outputDir from existing khotan.config.ts", () => {
    fs.writeFileSync(
      path.join(tmpDir, "khotan.config.ts"),
      `export default { outputDir: "lib/custom" };`,
    );
    expect(resolveOutputDir(tmpDir)).toBe("lib/custom");
  });

  it("defaults to src/khotan when src/app exists", () => {
    fs.mkdirSync(path.join(tmpDir, "src", "app"), { recursive: true });
    expect(resolveOutputDir(tmpDir)).toBe("src/khotan");
  });

  it("defaults to khotan when app/ exists (no src/)", () => {
    fs.mkdirSync(path.join(tmpDir, "app"), { recursive: true });
    expect(resolveOutputDir(tmpDir)).toBe("khotan");
  });

  it("defaults to src/khotan when neither app directory exists", () => {
    expect(resolveOutputDir(tmpDir)).toBe("src/khotan");
  });

  it("prefers config over layout detection", () => {
    fs.mkdirSync(path.join(tmpDir, "src", "app"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "khotan.config.ts"),
      `export default { outputDir: "my/custom/dir" };`,
    );
    expect(resolveOutputDir(tmpDir)).toBe("my/custom/dir");
  });
});

// ---------------------------------------------------------------------------
// loadConfigOutputDir
// ---------------------------------------------------------------------------

describe("loadConfigOutputDir", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "khotan-config-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no config exists", () => {
    expect(loadConfigOutputDir(tmpDir)).toBeNull();
  });

  it("returns outputDir from existing config", () => {
    fs.writeFileSync(
      path.join(tmpDir, "khotan.config.ts"),
      `export default { outputDir: "src/khotan" };`,
    );
    const result = loadConfigOutputDir(tmpDir);
    expect(result).not.toBeNull();
    expect(result!.outputDir).toBe("src/khotan");
  });
});
