import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import prompts from "prompts";
import { getComponent, isMultiFile } from "../registry.js";
import {
  resolveDrizzleSchemaDir,
  detectSingleFileSchema,
  updateDrizzleConfigSchema,
} from "../drizzle-detect.js";
import { runInit } from "./init.js";
import { resolveOutputDir } from "../cli-api.js";

function loadOutputDir(): string {
  return resolveOutputDir(process.cwd());
}

export function runGenerate(
  cwd: string,
  opts: { force?: boolean; yes?: boolean } = {},
): boolean {
  const schema = getComponent("schema");
  if (
    !schema ||
    isMultiFile(schema) ||
    !schema.templatePath ||
    !schema.outputFile
  ) {
    console.error("✗ Could not find schema component in registry.");
    return false;
  }

  let outputDir = loadOutputDir();
  const schemaDir = resolveDrizzleSchemaDir(cwd);
  if (schemaDir) {
    outputDir = schemaDir;
    console.log(`✓ Detected Drizzle schema directory: ${schemaDir}`);
  }

  const absOutputDir = path.resolve(cwd, outputDir);
  const outputPath = path.join(absOutputDir, schema.outputFile);

  // Non-destructive: warn before overwriting unless --force or --yes
  if (fs.existsSync(outputPath) && !opts.force) {
    if (opts.yes) {
      console.log(
        `⚠ Overwriting ${path.relative(cwd, outputPath)} (--yes passed)`,
      );
    } else if (process.stdin.isTTY) {
      // In interactive mode, we can't use async prompts from a sync function.
      // Print an error and ask the user to pass --force.
      console.error(
        `✗ ${path.relative(cwd, outputPath)} already exists. Pass --force to overwrite.`,
      );
      return false;
    } else {
      console.error(
        `✗ ${path.relative(cwd, outputPath)} already exists. Pass --force to overwrite.`,
      );
      return false;
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const content = fs.readFileSync(schema.templatePath, "utf-8");
  fs.writeFileSync(outputPath, content, "utf-8");
  console.log(`✓ Created ${path.relative(cwd, outputPath)}`);

  // Update drizzle.config.ts if schema points to a single file
  const singleFile = detectSingleFileSchema(cwd);
  if (singleFile) {
    const relConfig = path.relative(cwd, singleFile.configPath);
    const updated = updateDrizzleConfigSchema(
      singleFile.configPath,
      singleFile.currentValue,
      singleFile.globValue,
    );
    if (updated) {
      console.log(
        `✓ Updated ${relConfig}: schema → "${singleFile.globValue}"`,
      );
    } else {
      console.warn(
        `⚠ Could not update ${relConfig} automatically. Set schema to "${singleFile.globValue}" manually.`,
      );
    }
  }

  // Update barrel file with khotan re-export
  const barrelPath = path.join(absOutputDir, "index.ts");
  if (fs.existsSync(barrelPath)) {
    const barrelContent = fs.readFileSync(barrelPath, "utf-8");
    const relBarrel = path.relative(cwd, barrelPath);

    if (barrelContent.includes("./khotan")) {
      console.log(`✓ ${relBarrel} already re-exports khotan`);
    } else {
      const separator = barrelContent.endsWith("\n") ? "" : "\n";
      fs.appendFileSync(barrelPath, `${separator}export * from "./khotan";\n`);
      console.log(`✓ Updated ${relBarrel} with khotan re-export`);
    }
  }

  return true;
}

export const generateCommand = new Command("generate")
  .description(
    "Generate the Khotan schema file and wire it into your Drizzle config",
  )
  .option("-f, --force", "Overwrite existing files without prompting")
  .option("-y, --yes", "Auto-accept all prompts")
  .action(async (opts: { force?: boolean; yes?: boolean }) => {
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

    const ok = runGenerate(cwd, opts);
    if (!ok) process.exit(1);
  });
