import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import prompts from "prompts";
import {
  getEntry,
  listComponents,
  listBlocks,
  isMultiFile,
  type ComponentEntry,
  type ComponentFile,
  type ComponentDeps,
} from "../registry.js";
import {
  resolveDrizzleSchemaDir,
  detectSingleFileSchema,
  updateDrizzleConfigSchema,
} from "../drizzle-detect.js";
import { runInit, scaffoldCoreFiles } from "./init.js";
import {
  checkNpmPackages,
  checkShadcnComponents,
  installPackages,
  installShadcnComponents,
} from "../deps.js";
import {
  installSkills,
  type SkillDefinition,
} from "../agent-detect.js";
import { ensureWorkflowNextConfig } from "../next-config.js";

async function loadConfig(): Promise<{ outputDir: string } | null> {
  const configPath = path.resolve(process.cwd(), "khotan.config.ts");

  if (!fs.existsSync(configPath)) {
    return null;
  }

  const content = fs.readFileSync(configPath, "utf-8");
  const outputDirMatch = /outputDir:\s*["']([^"']+)["']/.exec(content);

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
    case "appRoot":
      return path.resolve(cwd, hasSrcLayout(cwd) ? "src/app" : "app");
    case "projectRoot":
      return path.resolve(cwd);
    case "outputDir":
    default:
      return path.resolve(cwd, outputDir);
  }
}

function isScaffolded(
  entry: ComponentEntry,
  cwd: string,
  outputDir: string,
): boolean {
  if (isMultiFile(entry)) {
    return entry.files.some((f) => {
      const base = resolveOutputBase(f, cwd, outputDir);
      return fs.existsSync(path.join(base, f.outputFile));
    });
  }
  if (entry.outputFile) {
    return fs.existsSync(path.join(cwd, outputDir, entry.outputFile));
  }
  return false;
}

async function scaffoldFile(
  templatePath: string,
  outputPath: string,
  force: boolean,
): Promise<boolean> {
  if (fs.existsSync(outputPath) && !force) {
    const response = await prompts({
      type: "confirm",
      name: "overwrite",
      message: `${path.basename(outputPath)} already exists at ${outputPath}. Overwrite?`,
      initial: false,
    });

    if (!response.overwrite) {
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
  const missingPkgs =
    allPackages.length > 0 ? checkNpmPackages(cwd, allPackages) : [];
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
    const response = await prompts({
      type: "confirm",
      name: "install",
      message: "Install missing dependencies?",
      initial: true,
    });
    shouldInstall = response.install === true;
  }

  if (!shouldInstall) {
    console.warn(
      "⚠ Skipping dependency install. The component may not work without them.",
    );
    return;
  }

  if (missingPkgs.length > 0) {
    const regularPkgs = missingPkgs.filter(
      (p) => !(deps.npmDevPackages ?? []).includes(p),
    );
    const devPkgs = missingPkgs.filter((p) =>
      (deps.npmDevPackages ?? []).includes(p),
    );

    if (regularPkgs.length > 0) {
      console.log(`Installing ${regularPkgs.join(", ")}...`);
      const result = installPackages(cwd, regularPkgs);
      if (result.success) {
        console.log(`✓ Installed ${regularPkgs.join(", ")}`);
      } else {
        console.error(
          `✗ Failed to install packages: ${result.error ?? "unknown error"}`,
        );
      }
    }

    if (devPkgs.length > 0) {
      console.log(`Installing ${devPkgs.join(", ")} (dev)...`);
      const result = installPackages(cwd, devPkgs, { devDependency: true });
      if (result.success) {
        console.log(`✓ Installed ${devPkgs.join(", ")} as dev dependencies`);
      } else {
        console.error(
          `✗ Failed to install dev packages: ${result.error ?? "unknown error"}`,
        );
      }
    }
  }

  if (missingShadcn.length > 0) {
    console.log(`Installing shadcn components: ${missingShadcn.join(", ")}...`);
    const result = installShadcnComponents(cwd, missingShadcn);
    if (result.success) {
      console.log(`✓ Installed shadcn components: ${missingShadcn.join(", ")}`);
    } else {
      console.error(
        `✗ Failed to install shadcn components: ${result.error ?? "unknown error"}`,
      );
    }
  }
}

export const addCommand = new Command("add")
  .description("Add a component or block to your project")
  .argument(
    "<name>",
    "Component or block to add (e.g., plug, inflow, outflow, relay, schema, hub, config-page-1)",
  )
  .option("-f, --force", "Overwrite existing files without prompting")
  .option("-y, --yes", "Auto-accept all install prompts")
  .option("--without-ui", "Skip UI component scaffolding")
  .action(
    async (componentName: string, opts: { force?: boolean; yes?: boolean; withoutUi?: boolean }) => {
      let config = await loadConfig();

      if (!config) {
        console.log("No khotan.config.ts found. Running init...\n");
        const initOk = await runInit(process.cwd());
        if (!initOk) {
          console.error("✗ Init failed. Cannot proceed with add.");
          process.exit(1);
        }
        config = await loadConfig();
        if (!config) {
          console.error("✗ Could not read config after init.");
          process.exit(1);
        }
        console.log("");
      }

      const cwd = process.cwd();

      // Ensure core files (khotan.ts + route.ts) exist — create if missing, never overwrite
      scaffoldCoreFiles(cwd, config.outputDir);

      const result = getEntry(componentName);

      if (!result) {
        const components = listComponents()
          .map((c) => c.name)
          .join(", ");
        const blocks = listBlocks()
          .map((b) => b.name)
          .join(", ");
        console.error(`✗ Unknown name "${componentName}".`);
        console.error(`  Components: ${components}`);
        console.error(`  Blocks:     ${blocks}`);
        process.exit(1);
      }

      const { entry: component, kind } = result;

      // Check required khotan components and offer to add them first
      if (component.requires && component.requires.length > 0) {
        for (const reqName of component.requires) {
          const reqResult = getEntry(reqName);
          if (!reqResult) continue;
          const req = reqResult.entry;

          if (!isScaffolded(req, cwd, config.outputDir)) {
            let shouldAdd = opts.yes ?? false;
            if (!shouldAdd && process.stdin.isTTY) {
              const response = await prompts({
                type: "confirm",
                name: "add",
                message: `"${componentName}" requires the "${reqName}" component. Add it now?`,
                initial: true,
              });
              shouldAdd = response.add === true;
            } else if (!shouldAdd) {
              shouldAdd = true;
            }

            if (shouldAdd) {
              console.log(`\nAdding required component: ${reqName}...`);
              const { execSync } = await import("node:child_process");
              execSync(
                `node ${process.argv[1] ?? ""} add ${reqName}${opts.force ? " --force" : ""}${opts.yes ? " --yes" : ""}`,
                { cwd, stdio: "inherit" },
              );
              console.log("");
            } else {
              console.warn(
                `⚠ Skipping "${reqName}". The ${kind} may not work without it.`,
              );
            }
          }
        }
      }

      // Check and offer to install dependencies
      if (component.dependencies) {
        const deps = { ...component.dependencies };
        if (opts.withoutUi) {
          delete deps.shadcnComponents;
        }
        await checkAndInstallDeps(
          cwd,
          deps,
          opts.yes ?? false,
        );
      }

      // shadcn detection for components that require it
      if (component.requiresShadcn && !opts.withoutUi) {
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

      if (isMultiFile(component)) {
        const hasAgentSkills = component.files.some(
          (f) => f.outputBase === "agentSkills",
        );

        if (hasAgentSkills) {
          const skills: SkillDefinition[] = component.files
            .filter((f) => f.outputBase === "agentSkills")
            .map((f) => ({ name: f.outputFile, templatePath: f.templatePath }));

          const agentsTemplatePath = path.resolve(
            path.dirname(component.files[0]!.templatePath),
            "agents.md",
          );
          const result = installSkills(cwd, skills, agentsTemplatePath);

          if (result.created.length > 0) {
            console.log(
              `\n✓ Installed to ${result.agents.join(", ")} (${String(result.created.length)} files):`,
            );
            for (const f of result.created) {
              console.log(`  ${f}`);
            }
          }
          if (result.skipped.length > 0 && result.created.length === 0) {
            console.log("\n✓ All skill files already exist, skipping");
          }
          return;
        }

        const createdFiles: string[] = [];
        let filesToScaffold = component.files;

        if (opts.withoutUi) {
          filesToScaffold = filesToScaffold.filter(
            (f) => !f.outputFile.endsWith(".tsx"),
          );
        }

        // Route collision detection for blocks outputting to appRoot
        for (const file of filesToScaffold) {
          if (file.outputBase === "appRoot") {
            const baseDir = resolveOutputBase(file, cwd, config.outputDir);
            const outputPath = path.join(baseDir, file.outputFile);
            const routeDir = path.dirname(outputPath);
            const pageExtensions = ["page.tsx", "page.ts", "page.jsx", "page.js"];
            const existing = pageExtensions.find((ext) =>
              fs.existsSync(path.join(routeDir, ext)),
            );
            if (existing && existing !== path.basename(file.outputFile)) {
              const relRoute = path.relative(cwd, path.join(routeDir, existing));
              console.warn(
                `\n⚠ Route collision: ${relRoute} already exists at this path.`,
              );
              console.warn(
                `  Adding "${component.name}" will create a conflicting route file.\n`,
              );
            }
          }
        }

        for (const file of filesToScaffold) {
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
          console.log(`\n✓ Created ${String(createdFiles.length)} files:`);
          for (const f of createdFiles) {
            console.log(`  ${f}`);
          }
        }

        if (component.requiresWorkflowIntegration) {
          const workflowConfig = ensureWorkflowNextConfig(cwd);
          const relPath = path.relative(cwd, workflowConfig.path);
          if (workflowConfig.status === "created") {
            console.log(`✓ Created ${relPath} with Workflow integration`);
          } else if (workflowConfig.status === "updated") {
            console.log(`✓ Updated ${relPath} with Workflow integration`);
          } else if (workflowConfig.status === "skipped") {
            console.log(`✓ ${relPath} already has Workflow integration`);
          } else {
            console.warn(
              `⚠ Could not automatically update ${relPath} for Workflow integration. Wrap its default export with withWorkflow() from "workflow/next".`,
            );
          }
        }

        if (componentName === "hub") {
          console.log("\nNext steps:");
          console.log(
            "  1. Render <KhotanHub /> on a page, or `npx khotan add config-page-1` for a ready-made /config route",
          );
        }

        return;
      }

      if (!component.templatePath || !component.outputFile) {
        console.error(
          `✗ ${kind === "block" ? "Block" : "Component"} "${componentName}" has no template.`,
        );
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
          const response = await prompts(
            {
              type: "text",
              name: "schemaPath",
              message: "Where should the schema file be placed?",
              initial: config.outputDir,
            },
            {
              onCancel: () => {
                /* noop */
              },
            },
          );

          const schemaPath = response.schemaPath as string | undefined;
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

      if (component.requiresWorkflowIntegration) {
        const workflowConfig = ensureWorkflowNextConfig(cwd);
        const relPath = path.relative(cwd, workflowConfig.path);
        if (workflowConfig.status === "created") {
          console.log(`✓ Created ${relPath} with Workflow integration`);
        } else if (workflowConfig.status === "updated") {
          console.log(`✓ Updated ${relPath} with Workflow integration`);
        } else if (workflowConfig.status === "skipped") {
          console.log(`✓ ${relPath} already has Workflow integration`);
        } else {
          console.warn(
            `⚠ Could not automatically update ${relPath} for Workflow integration. Wrap its default export with withWorkflow() from "workflow/next".`,
          );
        }
      }

      if (componentName === "schema") {
        const autoYes = opts.yes ?? false;

        const singleFile = detectSingleFileSchema(cwd);
        if (singleFile) {
          const relConfig = path.relative(cwd, singleFile.configPath);
          console.log(
            `\n⚠ ${relConfig} points to a single file ("${singleFile.currentValue}").`,
          );
          console.log(
            `  Drizzle Kit won't pick up khotan.ts unless the schema is a glob.`,
          );

          let shouldUpdate = autoYes;
          if (!shouldUpdate && process.stdin.isTTY) {
            const response = await prompts({
              type: "confirm",
              name: "update",
              message: `Update schema to "${singleFile.globValue}" so Drizzle Kit picks up all files?`,
              initial: true,
            });
            shouldUpdate = response.update === true;
          }

          if (shouldUpdate) {
            updateDrizzleConfigSchema(
              singleFile.configPath,
              singleFile.currentValue,
              singleFile.globValue,
            );
            console.log(
              `✓ Updated ${relConfig}: schema → "${singleFile.globValue}"`,
            );
          } else {
            console.log(
              `  Skipped. Update the schema value manually or Drizzle Kit won't see the khotan tables.`,
            );
          }
        }

        const barrelPath = path.join(outputDir, "index.ts");

        if (fs.existsSync(barrelPath)) {
          const barrelContent = fs.readFileSync(barrelPath, "utf-8");
          const relBarrel = path.relative(cwd, barrelPath);

          if (barrelContent.includes("./khotan")) {
            console.log(`✓ ${relBarrel} already re-exports khotan`);
          } else {
            let shouldUpdate = autoYes;
            if (!shouldUpdate && process.stdin.isTTY) {
              const response = await prompts({
                type: "confirm",
                name: "update",
                message: `Add \`export * from "./khotan"\` to ${relBarrel}?`,
                initial: true,
              });
              shouldUpdate = response.update === true;
            }

            if (shouldUpdate) {
              const separator = barrelContent.endsWith("\n") ? "" : "\n";
              fs.appendFileSync(
                barrelPath,
                `${separator}export * from "./khotan";\n`,
              );
              console.log(`✓ Updated ${relBarrel} with khotan re-export`);
            } else {
              console.log(`  Skipped. Add this to ${relBarrel} manually:\n`);
              console.log(`    export * from "./khotan";`);
            }
          }
        } else {
          const relDir = path.relative(cwd, outputDir);
          const importBase = relDir.replace(/^src\//, "@/");
          console.log(
            `\nAdd this re-export to your Drizzle schema barrel file:\n`,
          );
          console.log(`  export * from "${importBase}/khotan";`);
        }
      } else {
        const importBase = config.outputDir.replace(/^src\//, "@/");
        if (componentName === "wire") {
          console.log(`\nUsage:\n`);
          console.log(
            `  import { wire } from "${importBase}/wire";`,
          );
          console.log(
            `  import { myPlug } from "${importBase}/plugs/plug";`,
          );
          console.log(`  import { db } from "@/db";\n`);
          console.log(`  const myWire = wire({`);
          console.log(`    plug: myPlug,`);
          console.log(`    db,`);
          console.log(`    subscribe: {`);
          console.log(`      path: "/webhooks",`);
          console.log(`      buildBody: (callbackUrl) => ({ url: callbackUrl, events: ["*"] }),`);
          console.log(`      parseId: (res) => (res as { id: string }).id,`);
          console.log(`    },`);
          console.log(`    unsubscribe: {`);
          console.log(`      path: (remoteId) => \`/webhooks/\${remoteId}\`,`);
          console.log(`    },`);
          console.log(`  });`);
        } else {
          console.log(`\nUsage:\n`);
          console.log(
            `  import { plug, bearer } from "${importBase}/plugs/${component.name}";`,
          );
          console.log(`\n  const api = plug({`);
          console.log(`    baseUrl: "https://api.example.com",`);
          console.log(`    auth: bearer(process.env.API_TOKEN!),`);
          console.log(`  });`);
        }
      }
    },
  );
