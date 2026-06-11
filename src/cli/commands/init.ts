import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import prompts from "prompts";
import { configTemplate } from "../config-template.js";
import {
  detectPackageManager,
  checkNpmPackages,
  checkShadcnComponents,
  installPackages,
  installShadcnComponents,
} from "../deps.js";
import { getComponent, getTemplateContent, isMultiFile } from "../registry.js";
import { installSkills, type SkillDefinition } from "../agent-detect.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveOutputDir(projectRoot: string): string {
  if (fs.existsSync(path.join(projectRoot, "src", "app"))) {
    return "src/khotan";
  }
  if (fs.existsSync(path.join(projectRoot, "app"))) {
    return "khotan";
  }
  return "src/khotan";
}

function hasSrcLayout(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, "src", "app"));
}

interface StepResult {
  name: string;
  status: "success" | "skipped" | "failed";
  error?: string | undefined;
}

const DRIZZLE_PACKAGES = ["drizzle-orm", "postgres"];
const DRIZZLE_DEV_PACKAGES = ["drizzle-kit"];
const SHADCN_COMPONENTS = ["card", "badge", "table", "switch"];

/**
 * Scaffold the core khotan files (khotan.ts instance + route.ts).
 * Never overwrites existing files. Returns list of created file paths.
 */
export function scaffoldCoreFiles(cwd: string, outputDir: string): string[] {
  const created: string[] = [];

  const khotanConfigTemplatePath = path.resolve(
    __dirname,
    "templates",
    "khotan-config.ts",
  );
  const routeTemplatePath = path.resolve(
    __dirname,
    "templates",
    "khotan-route.ts",
  );

  // Scaffold khotan.ts (instance config) — never overwrite
  const khotanTsPath = path.join(path.resolve(cwd, outputDir), "khotan.ts");
  if (!fs.existsSync(khotanTsPath)) {
    fs.mkdirSync(path.dirname(khotanTsPath), { recursive: true });
    fs.copyFileSync(khotanConfigTemplatePath, khotanTsPath);
    created.push(path.relative(cwd, khotanTsPath));
  } else {
    console.log(`✓ ${path.relative(cwd, khotanTsPath)} already exists, skipping`);
  }

  // Scaffold route.ts (API catch-all) — never overwrite
  const routeDir = path.resolve(
    cwd,
    hasSrcLayout(cwd)
      ? "src/app/api/khotan/[...all]"
      : "app/api/khotan/[...all]",
  );
  const routePath = path.join(routeDir, "route.ts");
  if (!fs.existsSync(routePath)) {
    fs.mkdirSync(routeDir, { recursive: true });
    fs.copyFileSync(routeTemplatePath, routePath);
    created.push(path.relative(cwd, routePath));
  } else {
    console.log(`✓ ${path.relative(cwd, routePath)} already exists, skipping`);
  }

  return created;
}

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

  // Step 4: Create khotan config + core files
  const configPath = path.resolve(cwd, "khotan.config.ts");
  const outputDir = resolveOutputDir(cwd);
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, configTemplate(outputDir), "utf-8");
    console.log(`\n✓ Created khotan.config.ts (outputDir: ${outputDir})`);
    results.push({ name: "Create khotan.config.ts", status: "success" });
  } else {
    console.log("\n✓ khotan.config.ts already exists, skipping");
    results.push({ name: "Create khotan.config.ts", status: "skipped" });
  }

  const coreFiles = scaffoldCoreFiles(cwd, outputDir);
  if (coreFiles.length > 0) {
    results.push({ name: `Scaffold ${coreFiles.join(", ")}`, status: "success" });
  } else {
    results.push({ name: "Scaffold core files", status: "skipped" });
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
 * Creates khotan.config.ts, khotan.ts, route.ts, and installs khotan-data.
 * Never overwrites existing files.
 * Returns true if the config file exists after running.
 */
export async function runInit(cwd: string): Promise<boolean> {
  const configPath = path.resolve(cwd, "khotan.config.ts");
  const outputDir = resolveOutputDir(cwd);

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, configTemplate(outputDir), "utf-8");
    console.log(`✓ Created khotan.config.ts (outputDir: ${outputDir})`);
  }

  scaffoldCoreFiles(cwd, outputDir);
  ensureKhotanDataInstalled(cwd);

  return fs.existsSync(configPath);
}

const SKILL_COMPONENTS = [
  "skill-setup",
  "skill-plug",
  "skill-dashboard",
  "skill-webhook",
  "agent-skill",
];

function scaffoldAgentSkills(cwd: string): number {
  const skills: SkillDefinition[] = [];

  for (const name of SKILL_COMPONENTS) {
    const entry = getComponent(name);
    if (!entry || !isMultiFile(entry)) continue;

    for (const file of entry.files) {
      if (file.outputBase === "agentSkills") {
        skills.push({ name: file.outputFile, templatePath: file.templatePath });
      }
    }
  }

  if (skills.length === 0) return 0;

  const agentsTemplatePath = path.resolve(
    __dirname,
    "templates",
    "agents.md",
  );
  const result = installSkills(cwd, skills, agentsTemplatePath);

  if (result.created.length > 0) {
    console.log(`  Agents detected: ${result.agents.join(", ")}`);
    for (const f of result.created) {
      console.log(`  ✓ Created ${f}`);
    }
  }

  return result.created.length;
}

export const initCommand = new Command("init")
  .description("Initialize khotan in your project")
  .option(
    "--full",
    "Full project setup: install drizzle, shadcn, and configure everything",
  )
  .option("-y, --yes", "Auto-accept all prompts")
  .action(async (opts: { full?: boolean; yes?: boolean }) => {
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
    const outputDir = resolveOutputDir(cwd);

    if (fs.existsSync(configPath)) {
      console.log(`✓ khotan.config.ts already exists, skipping`);
    } else {
      fs.writeFileSync(configPath, configTemplate(outputDir), "utf-8");
      console.log(`✓ Created khotan.config.ts (outputDir: ${outputDir})`);
    }

    const coreFiles = scaffoldCoreFiles(cwd, outputDir);

    ensureKhotanDataInstalled(cwd);

    // Offer to install agent skills
    let installSkills = opts.yes ?? false;
    if (!installSkills && process.stdin.isTTY) {
      const response = await prompts({
        type: "confirm",
        name: "install",
        message: "Install agent skills for AI-assisted development? (Y/n)",
        initial: true,
      });
      installSkills = response.install === true;
    }
    if (installSkills) {
      const count = scaffoldAgentSkills(cwd);
      if (count > 0) {
        console.log(`✓ Installed ${String(count)} agent skills`);
      }
    }

    const allFiles = [
      ...(fs.existsSync(configPath) && coreFiles.length === 0
        ? []
        : ["khotan.config.ts"]),
      ...coreFiles,
    ];

    if (allFiles.length > 0 || coreFiles.length > 0) {
      console.log("\nNext steps:");
      console.log("  1. Update the db import in your khotan config file");
      console.log("  2. Run `npx khotan add plug` to add the HTTP client");
      console.log("  3. Run `npx khotan migrate` to create database tables");
    }
  });
