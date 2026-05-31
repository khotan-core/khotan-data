import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import prompts from "prompts";
import {
  getComponent,
  getTemplateContent,
  listComponents,
  isMultiFile,
  type ComponentFile,
  type ComponentDeps,
} from "../registry.js";
import { resolveDrizzleSchemaDir } from "../drizzle-detect.js";
import {
  checkNpmPackages,
  checkShadcnComponents,
  installPackages,
  installShadcnComponents,
} from "../deps.js";

async function loadConfig(): Promise<{ outputDir: string } | null> {
  const configPath = path.resolve(process.cwd(), "khotan.config.ts");

  if (!fs.existsSync(configPath)) {
    return null;
  }

  const content = fs.readFileSync(configPath, "utf-8");
  const outputDirMatch = content.match(/outputDir:\s*["']([^"']+)["']/);

  return {
    outputDir: outputDirMatch?.[1] ?? "src/lib/khotan",
  };
}

function hasSrcLayout(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, "src", "app"));
}

function resolveOutputBase(
  file: ComponentFile,
  cwd: string,
  outputDir: string,
): string {
  switch (file.outputBase) {
    case "components":
      return path.resolve(
        cwd,
        hasSrcLayout(cwd) ? "src/components/khotan" : "components/khotan",
      );
    case "app":
      return path.resolve(
        cwd,
        hasSrcLayout(cwd)
          ? "src/app/api/khotan/[...all]"
          : "app/api/khotan/[...all]",
      );
    case "outputDir":
    default:
      return path.resolve(cwd, outputDir);
  }
}

async function scaffoldFile(
  templatePath: string,
  outputPath: string,
  force: boolean,
): Promise<boolean> {
  if (fs.existsSync(outputPath) && !force) {
    const { overwrite } = await prompts({
      type: "confirm",
      name: "overwrite",
      message: `${path.basename(outputPath)} already exists at ${outputPath}. Overwrite?`,
      initial: false,
    });

    if (!overwrite) {
      return false;
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const content = fs.readFileSync(templatePath, "utf-8");
  fs.writeFileSync(outputPath, content, "utf-8");
  return true;
}

async function checkAndInstallDeps(
  cwd: string,
  deps: ComponentDeps,
  autoYes: boolean,
): Promise<void> {
  const allPackages = [
    ...(deps.npmPackages ?? []),
    ...(deps.npmDevPackages ?? []),
  ];
  const missingPkgs = allPackages.length > 0
    ? checkNpmPackages(cwd, allPackages)
    : [];
  const missingShadcn = deps.shadcnComponents
    ? checkShadcnComponents(cwd, deps.shadcnComponents)
    : [];

  if (missingPkgs.length === 0 && missingShadcn.length === 0) {
    return;
  }

  if (missingPkgs.length > 0) {
    console.log(`\nMissing npm packages: ${missingPkgs.join(", ")}`);
  }
  if (missingShadcn.length > 0) {
    console.log(`Missing shadcn components: ${missingShadcn.join(", ")}`);
  }

  let shouldInstall = autoYes;
  if (!shouldInstall && process.stdin.isTTY) {
    const { install } = await prompts({
      type: "confirm",
      name: "install",
      message: "Install missing dependencies?",
      initial: true,
    });
    shouldInstall = install === true;
  }

  if (!shouldInstall) {
    console.warn("⚠ Skipping dependency install. The component may not work without them.");
    return;
  }

  if (missingPkgs.length > 0) {
    const regularPkgs = missingPkgs.filter(
      (p) => !(deps.npmDevPackages ?? []).includes(p),
    );
    const devPkgs = missingPkgs.filter(
      (p) => (deps.npmDevPackages ?? []).includes(p),
    );

    if (regularPkgs.length > 0) {
      console.log(`Installing ${regularPkgs.join(", ")}...`);
      const result = installPackages(cwd, regularPkgs);
      if (result.success) {
        console.log(`✓ Installed ${regularPkgs.join(", ")}`);
      } else {
        console.error(`✗ Failed to install packages: ${result.error}`);
      }
    }

    if (devPkgs.length > 0) {
      console.log(`Installing ${devPkgs.join(", ")} (dev)...`);
      const result = installPackages(cwd, devPkgs, { devDependency: true });
      if (result.success) {
        console.log(`✓ Installed ${devPkgs.join(", ")} as dev dependencies`);
      } else {
        console.error(`✗ Failed to install dev packages: ${result.error}`);
      }
    }
  }

  if (missingShadcn.length > 0) {
    console.log(`Installing shadcn components: ${missingShadcn.join(", ")}...`);
    const result = installShadcnComponents(cwd, missingShadcn);
    if (result.success) {
      console.log(`✓ Installed shadcn components: ${missingShadcn.join(", ")}`);
    } else {
      console.error(`✗ Failed to install shadcn components: ${result.error}`);
    }
  }
}

export const addCommand = new Command("add")
  .description("Add a component to your project")
  .argument("<component>", "Component to add (e.g., plug, schema, hub)")
  .option("-f, --force", "Overwrite existing files without prompting")
  .option("-y, --yes", "Auto-accept all install prompts")
  .action(async (componentName: string, opts: { force?: boolean; yes?: boolean }) => {
    const config = await loadConfig();

    if (!config) {
      console.error(
        "✗ No khotan.config.ts found. Run `npx khotan init` first.",
      );
      process.exit(1);
    }

    const component = getComponent(componentName);

    if (!component) {
      const available = listComponents()
        .map((c) => c.name)
        .join(", ");
      console.error(
        `✗ Unknown component "${componentName}". Available: ${available}`,
      );
      process.exit(1);
    }

    const cwd = process.cwd();

    // Check and offer to install dependencies
    if (component.dependencies) {
      await checkAndInstallDeps(cwd, component.dependencies, opts.yes ?? false);
    }

    // shadcn detection for components that require it
    if (component.requiresShadcn) {
      const shadcnConfig = path.join(cwd, "components.json");
      if (!fs.existsSync(shadcnConfig)) {
        console.warn(
          "⚠ shadcn/ui is required for the Hub component but components.json was not found.",
        );
        console.warn(
          "  Run `npx shadcn-ui@latest init` first, then re-run this command.\n",
        );
      }
    }

    // Multi-file components (e.g., hub)
    if (isMultiFile(component)) {
      const createdFiles: string[] = [];

      for (const file of component.files) {
        const baseDir = resolveOutputBase(file, cwd, config.outputDir);
        const outputPath = path.join(baseDir, file.outputFile);

        const created = await scaffoldFile(
          file.templatePath,
          outputPath,
          opts.force ?? false,
        );

        if (created) {
          createdFiles.push(path.relative(cwd, outputPath));
        }
      }

      if (createdFiles.length > 0) {
        console.log(`\n✓ Created ${createdFiles.length} files:`);
        for (const f of createdFiles) {
          console.log(`  ${f}`);
        }
      }

      if (componentName === "hub") {
        console.log("\nNext steps:");
        console.log("  1. Update the db import in your khotan config file");
        console.log("  2. Register your plugs and syncs in the config");
        console.log("  3. Start the dev server and visit the Hub component");
      }

      return;
    }

    // Single-file components (plug, schema)
    if (!component.templatePath || !component.outputFile) {
      console.error(`✗ Component "${componentName}" has no template.`);
      process.exit(1);
    }

    // Schema-specific: detect Drizzle schema directory
    let outputDir = path.resolve(cwd, config.outputDir);
    let schemaDir: string | null = null;

    if (componentName === "schema") {
      schemaDir = resolveDrizzleSchemaDir(cwd);

      if (schemaDir) {
        outputDir = path.resolve(cwd, schemaDir);
        console.log(`✓ Detected Drizzle schema directory: ${schemaDir}`);
      } else if (process.stdin.isTTY) {
        const { schemaPath } = await prompts(
          {
            type: "text",
            name: "schemaPath",
            message: "Where should the schema file be placed?",
            initial: config.outputDir,
          },
          { onCancel: () => {} },
        );

        if (schemaPath) {
          outputDir = path.resolve(cwd, schemaPath);
        }
      }
    }

    const outputPath = path.join(outputDir, component.outputFile);

    const created = await scaffoldFile(
      component.templatePath,
      outputPath,
      opts.force ?? false,
    );

    if (!created) {
      console.log("Cancelled.");
      return;
    }

    console.log(`✓ Created ${path.relative(cwd, outputPath)}`);

    if (componentName === "schema") {
      const relDir = path.relative(cwd, outputDir);
      const importBase = relDir.replace(/^src\//, "@/");
      console.log(`\nAdd this re-export to your Drizzle schema barrel file:\n`);
      console.log(`  export * from "${importBase}/khotan";`);
    } else {
      const importBase = config.outputDir.replace(/^src\//, "@/");
      console.log(`\nUsage:\n`);
      console.log(
        `  import { plug, bearer } from "${importBase}/${component.name}";`,
      );
      console.log(`\n  const api = plug({`);
      console.log(`    baseUrl: "https://api.example.com",`);
      console.log(`    auth: bearer(process.env.API_TOKEN!),`);
      console.log(`  });`);
    }
  });
