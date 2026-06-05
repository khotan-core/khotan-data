import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { configTemplate } from "../config-template.js";
import {
  detectPackageManager,
  checkNpmPackages,
  checkShadcnComponents,
  installPackages,
  installShadcnComponents,
} from "../deps.js";

function resolveOutputDir(projectRoot: string): string {
  if (fs.existsSync(path.join(projectRoot, "src", "app"))) {
    return "src/lib/khotan";
  }
  if (fs.existsSync(path.join(projectRoot, "app"))) {
    return "lib/khotan";
  }
  return "src/lib/khotan";
}

interface StepResult {
  name: string;
  status: "success" | "skipped" | "failed";
  error?: string | undefined;
}

const DRIZZLE_PACKAGES = ["drizzle-orm", "postgres"];
const DRIZZLE_DEV_PACKAGES = ["drizzle-kit"];
const SHADCN_COMPONENTS = ["card", "badge", "table", "switch"];

async function runFullSetup(cwd: string): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const pm = detectPackageManager(cwd);
  console.log(`Detected package manager: ${pm.name}\n`);

  // Step 1: Install drizzle packages
  const missingDrizzle = checkNpmPackages(cwd, DRIZZLE_PACKAGES);
  const missingDrizzleDev = checkNpmPackages(cwd, DRIZZLE_DEV_PACKAGES);

  if (missingDrizzle.length > 0) {
    console.log(`Installing ${missingDrizzle.join(", ")}...`);
    const result = installPackages(cwd, missingDrizzle);
    if (result.success) {
      console.log(`✓ Installed ${missingDrizzle.join(", ")}`);
      results.push({ name: "Install drizzle packages", status: "success" });
    } else {
      console.error(`✗ Failed: ${result.error ?? "unknown error"}`);
      results.push({
        name: "Install drizzle packages",
        status: "failed",
        error: result.error,
      });
    }
  } else {
    console.log("✓ Drizzle packages already installed, skipping");
    results.push({ name: "Install drizzle packages", status: "skipped" });
  }

  if (missingDrizzleDev.length > 0) {
    console.log(`Installing ${missingDrizzleDev.join(", ")} (dev)...`);
    const result = installPackages(cwd, missingDrizzleDev, {
      devDependency: true,
    });
    if (result.success) {
      console.log(
        `✓ Installed ${missingDrizzleDev.join(", ")} as dev dependencies`,
      );
      results.push({ name: "Install drizzle-kit", status: "success" });
    } else {
      console.error(`✗ Failed: ${result.error ?? "unknown error"}`);
      results.push({
        name: "Install drizzle-kit",
        status: "failed",
        error: result.error,
      });
    }
  } else {
    console.log("✓ drizzle-kit already installed, skipping");
    results.push({ name: "Install drizzle-kit", status: "skipped" });
  }

  // Step 2: Initialize shadcn if needed
  const componentsJsonPath = path.join(cwd, "components.json");
  if (!fs.existsSync(componentsJsonPath)) {
    console.log("\nInitializing shadcn/ui...");
    try {
      execSync("npx shadcn@latest init --defaults --yes", {
        cwd,
        stdio: "pipe",
        encoding: "utf-8",
      });
      console.log("✓ Initialized shadcn/ui");
      results.push({ name: "Initialize shadcn", status: "success" });
    } catch (err: unknown) {
      const e = err as { stderr?: string; stdout?: string };
      const error = e.stderr ?? e.stdout ?? "shadcn init failed";
      console.error(`✗ Failed to initialize shadcn: ${error}`);
      results.push({ name: "Initialize shadcn", status: "failed", error });
    }
  } else {
    console.log("\n✓ shadcn/ui already configured, skipping init");
    results.push({ name: "Initialize shadcn", status: "skipped" });
  }

  // Step 3: Install shadcn components
  const missingShadcn = checkShadcnComponents(cwd, SHADCN_COMPONENTS);
  if (missingShadcn.length > 0) {
    console.log(
      `\nInstalling shadcn components: ${missingShadcn.join(", ")}...`,
    );
    const result = installShadcnComponents(cwd, missingShadcn);
    if (result.success) {
      console.log(`✓ Installed shadcn components: ${missingShadcn.join(", ")}`);
      results.push({ name: "Install shadcn components", status: "success" });
    } else {
      console.error(`✗ Failed: ${result.error ?? "unknown error"}`);
      results.push({
        name: "Install shadcn components",
        status: "failed",
        error: result.error,
      });
    }
  } else {
    console.log("\n✓ All required shadcn components already present, skipping");
    results.push({ name: "Install shadcn components", status: "skipped" });
  }

  // Step 4: Create khotan config
  const configPath = path.resolve(cwd, "khotan.config.ts");
  if (!fs.existsSync(configPath)) {
    const outputDir = resolveOutputDir(cwd);
    fs.writeFileSync(configPath, configTemplate(outputDir), "utf-8");
    console.log(`\n✓ Created khotan.config.ts (outputDir: ${outputDir})`);
    results.push({ name: "Create khotan.config.ts", status: "success" });
  } else {
    console.log("\n✓ khotan.config.ts already exists, skipping");
    results.push({ name: "Create khotan.config.ts", status: "skipped" });
  }

  // Step 5: Install khotan-data package
  results.push(ensureKhotanDataInstalled(cwd));

  return results;
}

function ensureKhotanDataInstalled(cwd: string): StepResult {
  const missing = checkNpmPackages(cwd, ["khotan-data"]);
  if (missing.length === 0) {
    console.log("✓ khotan-data already installed, skipping");
    return { name: "Install khotan-data", status: "skipped" };
  }

  console.log("Installing khotan-data...");
  const result = installPackages(cwd, ["khotan-data"]);
  if (result.success) {
    console.log("✓ Installed khotan-data");
    return { name: "Install khotan-data", status: "success" };
  }

  console.error(
    `✗ Failed to install khotan-data: ${result.error ?? "unknown error"}`,
  );
  return { name: "Install khotan-data", status: "failed", error: result.error };
}

/**
 * Core init logic reusable from the add command.
 * Creates khotan.config.ts and installs khotan-data if missing.
 * Returns true if the config file exists after running.
 */
export async function runInit(cwd: string): Promise<boolean> {
  const configPath = path.resolve(cwd, "khotan.config.ts");

  if (fs.existsSync(configPath)) {
    return true;
  }

  const outputDir = resolveOutputDir(cwd);
  fs.writeFileSync(configPath, configTemplate(outputDir), "utf-8");
  console.log(`✓ Created khotan.config.ts (outputDir: ${outputDir})`);

  ensureKhotanDataInstalled(cwd);

  return fs.existsSync(configPath);
}

export const initCommand = new Command("init")
  .description("Initialize khotan in your project")
  .option(
    "--full",
    "Full project setup: install drizzle, shadcn, and configure everything",
  )
  .action(async (opts: { full?: boolean }) => {
    const cwd = process.cwd();

    if (opts.full) {
      console.log("Running full khotan setup...\n");
      const results = await runFullSetup(cwd);

      const succeeded = results.filter((r) => r.status === "success");
      const skipped = results.filter((r) => r.status === "skipped");
      const failed = results.filter((r) => r.status === "failed");

      console.log("\n── Setup Summary ──");
      for (const r of succeeded) {
        console.log(`  ✓ ${r.name}`);
      }
      for (const r of skipped) {
        console.log(`  ⊘ ${r.name} (already done)`);
      }
      for (const r of failed) {
        console.log(`  ✗ ${r.name}: ${r.error ?? "unknown error"}`);
      }

      if (failed.length > 0) {
        console.log(
          `\n${String(failed.length)} step(s) failed. You may need to run them manually.`,
        );
      } else {
        console.log("\nAll done! Your project is ready for khotan.");
      }

      return;
    }

    const configPath = path.resolve(cwd, "khotan.config.ts");

    if (fs.existsSync(configPath)) {
      console.warn(
        `⚠ khotan.config.ts already exists at ${configPath}. Skipping.`,
      );
      ensureKhotanDataInstalled(cwd);
      return;
    }

    const outputDir = resolveOutputDir(cwd);
    fs.writeFileSync(configPath, configTemplate(outputDir), "utf-8");
    console.log(`✓ Created khotan.config.ts (outputDir: ${outputDir})`);

    ensureKhotanDataInstalled(cwd);
  });
