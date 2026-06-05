import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { getComponent, isMultiFile } from "../registry.js";
import {
  resolveDrizzleSchemaDir,
  detectSingleFileSchema,
  updateDrizzleConfigSchema,
} from "../drizzle-detect.js";
import { runInit } from "./init.js";

function loadOutputDir(): string {
  const configPath = path.resolve(process.cwd(), "khotan.config.ts");
  if (!fs.existsSync(configPath)) return "src/lib/khotan";
  const content = fs.readFileSync(configPath, "utf-8");
  const match = /outputDir:\s*["']([^"']+)["']/.exec(content);
  return match?.[1] ?? "src/lib/khotan";
}

export function runGenerate(cwd: string): boolean {
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

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const content = fs.readFileSync(schema.templatePath, "utf-8");
  fs.writeFileSync(outputPath, content, "utf-8");
  console.log(`✓ Created ${path.relative(cwd, outputPath)}`);

  // Update drizzle.config.ts if schema points to a single file
  const singleFile = detectSingleFileSchema(cwd);
  if (singleFile) {
    const relConfig = path.relative(cwd, singleFile.configPath);
    updateDrizzleConfigSchema(
      singleFile.configPath,
      singleFile.currentValue,
      singleFile.globValue,
    );
    console.log(`✓ Updated ${relConfig}: schema → "${singleFile.globValue}"`);
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
  .action(async () => {
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

    const ok = runGenerate(cwd);
    if (!ok) process.exit(1);
  });
