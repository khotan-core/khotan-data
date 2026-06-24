import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initCommand } from "./commands/init.js";
import { addCommand } from "./commands/add.js";
import { generateCommand } from "./commands/generate.js";
import { migrateCommand } from "./commands/migrate.js";
import { plugCommand } from "./commands/probe.js";
import { wireCommand } from "./commands/wire.js";
import { flowsCommand } from "./commands/flows.js";
import { mappingsCommand } from "./commands/mappings.js";

const __cliDirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(__cliDirname, "..", "package.json"), "utf-8"),
) as { version: string };

const program = new Command();

program
  .name("khotan-data")
  .description("Scaffold data components into your project")
  .version(pkg.version);

program.addCommand(initCommand);
program.addCommand(addCommand);
program.addCommand(generateCommand);
program.addCommand(migrateCommand);
program.addCommand(plugCommand);
program.addCommand(wireCommand);
program.addCommand(flowsCommand);
program.addCommand(mappingsCommand);

program.parse();
