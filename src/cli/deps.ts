import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

interface PackageManagerInfo {
  name: PackageManager;
  installCmd: string;
  devFlag: string;
}

const PM_INFO: Record<PackageManager, PackageManagerInfo> = {
  bun: { name: "bun", installCmd: "bun add", devFlag: "-d" },
  pnpm: { name: "pnpm", installCmd: "pnpm add", devFlag: "-D" },
  yarn: { name: "yarn", installCmd: "yarn add", devFlag: "-D" },
  npm: { name: "npm", installCmd: "npm install", devFlag: "--save-dev" },
};

const LOCKFILE_PRIORITY: { file: string; pm: PackageManager }[] = [
  { file: "bun.lock", pm: "bun" },
  { file: "pnpm-lock.yaml", pm: "pnpm" },
  { file: "yarn.lock", pm: "yarn" },
  { file: "package-lock.json", pm: "npm" },
];

export function detectPackageManager(cwd: string): PackageManagerInfo {
  for (const { file, pm } of LOCKFILE_PRIORITY) {
    if (fs.existsSync(path.join(cwd, file))) {
      return PM_INFO[pm];
    }
  }
  return PM_INFO.npm;
}

export function checkNpmPackages(cwd: string, packages: string[]): string[] {
  const pkgPath = path.join(cwd, "package.json");

  if (!fs.existsSync(pkgPath)) {
    return packages;
  }

  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const allDeps = {
      ...pkgJson.dependencies,
      ...pkgJson.devDependencies,
    };

    return packages.filter((pkg) => !(pkg in allDeps));
  } catch {
    return packages;
  }
}

export function checkShadcnComponents(
  cwd: string,
  components: string[],
): string[] {
  const componentsJsonPath = path.join(cwd, "components.json");
  let uiDir: string | null = null;

  if (fs.existsSync(componentsJsonPath)) {
    try {
      const config = JSON.parse(
        fs.readFileSync(componentsJsonPath, "utf-8"),
      ) as {
        aliases?: { components?: string };
      };

      const aliasPath = config.aliases?.components;
      if (aliasPath) {
        const resolved = aliasPath.replace(/^@\//, "src/").replace(/^~\//, "");
        uiDir = path.join(cwd, resolved, "ui");
      }
    } catch {
      // fall through to defaults
    }
  }

  if (!uiDir) {
    const srcUi = path.join(cwd, "src", "components", "ui");
    const rootUi = path.join(cwd, "components", "ui");
    if (fs.existsSync(srcUi)) {
      uiDir = srcUi;
    } else if (fs.existsSync(rootUi)) {
      uiDir = rootUi;
    } else {
      return components;
    }
  }

  return components.filter((name) => {
    const filePath = path.join(uiDir, `${name}.tsx`);
    return !fs.existsSync(filePath);
  });
}

export function installPackages(
  cwd: string,
  packages: string[],
  opts?: { devDependency?: boolean },
): { success: boolean; error?: string } {
  if (packages.length === 0) {
    return { success: true };
  }

  const pm = detectPackageManager(cwd);
  const devFlag = opts?.devDependency ? ` ${pm.devFlag}` : "";
  const cmd = `${pm.installCmd} ${packages.join(" ")}${devFlag}`;

  try {
    execSync(cmd, { cwd, stdio: "pipe", encoding: "utf-8" });
    return { success: true };
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string };
    return {
      success: false,
      error: e.stderr ?? e.stdout ?? "Install command failed",
    };
  }
}

export function installShadcnComponents(
  cwd: string,
  components: string[],
): { success: boolean; error?: string } {
  if (components.length === 0) {
    return { success: true };
  }

  const cmd = `npx shadcn@latest add ${components.join(" ")} --yes`;

  try {
    execSync(cmd, { cwd, stdio: "pipe", encoding: "utf-8" });
    return { success: true };
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string };
    return {
      success: false,
      error: e.stderr ?? e.stdout ?? "shadcn install failed",
    };
  }
}
