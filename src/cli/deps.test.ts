import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  detectPackageManager,
  checkNpmPackages,
  checkShadcnComponents,
} from "./deps.js";

describe("detectPackageManager", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "khotan-deps-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("detects bun from bun.lock", () => {
    fs.writeFileSync(path.join(tmpDir, "bun.lock"), "");
    const pm = detectPackageManager(tmpDir);
    expect(pm.name).toBe("bun");
    expect(pm.installCmd).toBe("bun add");
  });

  it("detects pnpm from pnpm-lock.yaml", () => {
    fs.writeFileSync(path.join(tmpDir, "pnpm-lock.yaml"), "");
    const pm = detectPackageManager(tmpDir);
    expect(pm.name).toBe("pnpm");
    expect(pm.installCmd).toBe("pnpm add");
  });

  it("detects yarn from yarn.lock", () => {
    fs.writeFileSync(path.join(tmpDir, "yarn.lock"), "");
    const pm = detectPackageManager(tmpDir);
    expect(pm.name).toBe("yarn");
    expect(pm.installCmd).toBe("yarn add");
  });

  it("detects npm from package-lock.json", () => {
    fs.writeFileSync(path.join(tmpDir, "package-lock.json"), "{}");
    const pm = detectPackageManager(tmpDir);
    expect(pm.name).toBe("npm");
    expect(pm.installCmd).toBe("npm install");
  });

  it("falls back to npm when no lockfile exists", () => {
    const pm = detectPackageManager(tmpDir);
    expect(pm.name).toBe("npm");
  });

  it("prioritizes bun over pnpm when both lockfiles exist", () => {
    fs.writeFileSync(path.join(tmpDir, "bun.lock"), "");
    fs.writeFileSync(path.join(tmpDir, "pnpm-lock.yaml"), "");
    const pm = detectPackageManager(tmpDir);
    expect(pm.name).toBe("bun");
  });

  it("prioritizes pnpm over npm when both lockfiles exist", () => {
    fs.writeFileSync(path.join(tmpDir, "pnpm-lock.yaml"), "");
    fs.writeFileSync(path.join(tmpDir, "package-lock.json"), "{}");
    const pm = detectPackageManager(tmpDir);
    expect(pm.name).toBe("pnpm");
  });

  it("prioritizes yarn over npm when both lockfiles exist", () => {
    fs.writeFileSync(path.join(tmpDir, "yarn.lock"), "");
    fs.writeFileSync(path.join(tmpDir, "package-lock.json"), "{}");
    const pm = detectPackageManager(tmpDir);
    expect(pm.name).toBe("yarn");
  });
});

describe("checkNpmPackages", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "khotan-deps-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns all packages as missing when no package.json exists", () => {
    const missing = checkNpmPackages(tmpDir, ["drizzle-orm", "postgres"]);
    expect(missing).toEqual(["drizzle-orm", "postgres"]);
  });

  it("returns empty array when all packages are in dependencies", () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        dependencies: { "drizzle-orm": "^0.35.0", postgres: "^3.0.0" },
      }),
    );
    const missing = checkNpmPackages(tmpDir, ["drizzle-orm", "postgres"]);
    expect(missing).toEqual([]);
  });

  it("returns empty array when all packages are in devDependencies", () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        devDependencies: { "drizzle-kit": "^0.25.0" },
      }),
    );
    const missing = checkNpmPackages(tmpDir, ["drizzle-kit"]);
    expect(missing).toEqual([]);
  });

  it("returns only missing packages when some are present", () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        dependencies: { "drizzle-orm": "^0.35.0" },
      }),
    );
    const missing = checkNpmPackages(tmpDir, ["drizzle-orm", "postgres"]);
    expect(missing).toEqual(["postgres"]);
  });

  it("finds packages across both dependencies and devDependencies", () => {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify({
        dependencies: { "drizzle-orm": "^0.35.0" },
        devDependencies: { "drizzle-kit": "^0.25.0" },
      }),
    );
    const missing = checkNpmPackages(tmpDir, [
      "drizzle-orm",
      "drizzle-kit",
      "postgres",
    ]);
    expect(missing).toEqual(["postgres"]);
  });

  it("returns all packages when package.json is invalid JSON", () => {
    fs.writeFileSync(path.join(tmpDir, "package.json"), "not json");
    const missing = checkNpmPackages(tmpDir, ["drizzle-orm"]);
    expect(missing).toEqual(["drizzle-orm"]);
  });
});

describe("checkShadcnComponents", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "khotan-deps-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns all components when no ui directory exists", () => {
    const missing = checkShadcnComponents(tmpDir, [
      "card",
      "badge",
      "table",
      "switch",
    ]);
    expect(missing).toEqual(["card", "badge", "table", "switch"]);
  });

  it("returns empty array when all components exist", () => {
    const uiDir = path.join(tmpDir, "src", "components", "ui");
    fs.mkdirSync(uiDir, { recursive: true });
    fs.writeFileSync(path.join(uiDir, "card.tsx"), "");
    fs.writeFileSync(path.join(uiDir, "badge.tsx"), "");
    fs.writeFileSync(path.join(uiDir, "table.tsx"), "");
    fs.writeFileSync(path.join(uiDir, "switch.tsx"), "");

    const missing = checkShadcnComponents(tmpDir, [
      "card",
      "badge",
      "table",
      "switch",
    ]);
    expect(missing).toEqual([]);
  });

  it("returns only missing components when some exist", () => {
    const uiDir = path.join(tmpDir, "src", "components", "ui");
    fs.mkdirSync(uiDir, { recursive: true });
    fs.writeFileSync(path.join(uiDir, "card.tsx"), "");

    const missing = checkShadcnComponents(tmpDir, ["card", "table"]);
    expect(missing).toEqual(["table"]);
  });

  it("checks components/ui when src/components/ui does not exist", () => {
    const uiDir = path.join(tmpDir, "components", "ui");
    fs.mkdirSync(uiDir, { recursive: true });
    fs.writeFileSync(path.join(uiDir, "card.tsx"), "");

    const missing = checkShadcnComponents(tmpDir, ["card", "badge"]);
    expect(missing).toEqual(["badge"]);
  });

  it("resolves custom alias path from components.json", () => {
    const customDir = path.join(tmpDir, "src", "ui", "shadcn", "ui");
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(path.join(customDir, "card.tsx"), "");

    fs.writeFileSync(
      path.join(tmpDir, "components.json"),
      JSON.stringify({
        aliases: { components: "@/ui/shadcn" },
      }),
    );

    const missing = checkShadcnComponents(tmpDir, ["card", "badge"]);
    expect(missing).toEqual(["badge"]);
  });

  it("falls back to default paths when components.json has no aliases", () => {
    fs.writeFileSync(path.join(tmpDir, "components.json"), JSON.stringify({}));

    const uiDir = path.join(tmpDir, "src", "components", "ui");
    fs.mkdirSync(uiDir, { recursive: true });
    fs.writeFileSync(path.join(uiDir, "card.tsx"), "");

    const missing = checkShadcnComponents(tmpDir, ["card", "badge"]);
    expect(missing).toEqual(["badge"]);
  });

  it("falls back to default paths when components.json is invalid JSON", () => {
    fs.writeFileSync(path.join(tmpDir, "components.json"), "not json");

    const uiDir = path.join(tmpDir, "src", "components", "ui");
    fs.mkdirSync(uiDir, { recursive: true });
    fs.writeFileSync(path.join(uiDir, "card.tsx"), "");

    const missing = checkShadcnComponents(tmpDir, ["card", "badge"]);
    expect(missing).toEqual(["badge"]);
  });
});
