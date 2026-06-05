import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { resolveDrizzleSchemaDir } from "../drizzle-detect.js";
import { runInit } from "./init.js";
import { runGenerate } from "./generate.js";
import { detectPackageManager } from "../deps.js";

function isSchemaScaffolded(cwd: string): boolean {
  const schemaDir = resolveDrizzleSchemaDir(cwd);
  if (!schemaDir) return false;
  return fs.existsSync(path.join(cwd, schemaDir, "khotan.ts"));
}

export const migrateCommand = new Command("migrate")
  .description(
    "Generate a migration and apply it (or --push to skip migration files)",
  )
  .option("--push", "Push schema directly without generating migration files")
  .action(async (opts: { push?: boolean }) => {
    const cwd = process.cwd();

    const configPath = path.resolve(cwd, "khotan.config.ts");
    if (!fs.existsSync(configPath)) {
      console.log("No khotan.config.ts found. Running init...\n");
      const initOk = await runInit(cwd);
      if (!initOk) {
        console.error("✗ Init failed. Cannot proceed.");
        process.exit(1);
      }
      console.log("");
    }

    if (!isSchemaScaffolded(cwd)) {
      console.log("Schema not found. Running generate...\n");
      const ok = runGenerate(cwd);
      if (!ok) {
        console.error("✗ Generate failed. Cannot proceed.");
        process.exit(1);
      }
      console.log("");
    } else {
      console.log("✓ Schema already generated");
    }

    const pm = detectPackageManager(cwd);
    const runner = pm.name === "npm" ? "npx" : pm.name;

    if (opts.push) {
      console.log("Pushing schema directly to database...\n");
      try {
        execSync(`${runner} drizzle-kit push`, {
          cwd,
          stdio: "inherit",
        });
        console.log("\n✓ Schema pushed to database");
      } catch {
        console.error("\n✗ drizzle-kit push failed.");
        console.error(
          "  Make sure DATABASE_URL is set and drizzle-kit is installed.",
        );
        process.exit(1);
      }
    } else {
      console.log("Generating migration...\n");
      try {
        execSync(`${runner} drizzle-kit generate`, {
          cwd,
          stdio: "inherit",
        });
        console.log("\n✓ Migration file generated");
      } catch {
        console.error("\n✗ drizzle-kit generate failed.");
        process.exit(1);
      }

      console.log("\nApplying migration...\n");
      try {
        execSync(`${runner} drizzle-kit migrate`, {
          cwd,
          stdio: "inherit",
        });
        console.log("\n✓ Migration applied successfully");
      } catch {
        console.error("\n✗ drizzle-kit migrate failed.");
        console.error(
          "  Make sure DATABASE_URL is set and drizzle-kit is installed.",
        );
        process.exit(1);
      }
    }
  });
