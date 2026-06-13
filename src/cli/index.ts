import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { addCommand } from "./commands/add.js";
import { generateCommand } from "./commands/generate.js";
import { migrateCommand } from "./commands/migrate.js";
import { plugCommand } from "./commands/probe.js";
import { wireCommand } from "./commands/wire.js";
import { flowsCommand } from "./commands/flows.js";
import { mappingsCommand } from "./commands/mappings.js";

const program = new Command();

program
  .name("khotan")
  .description("Scaffold data components into your project")
  .version("0.0.1");

program.addCommand(initCommand);
program.addCommand(addCommand);
program.addCommand(generateCommand);
program.addCommand(migrateCommand);
program.addCommand(plugCommand);
program.addCommand(wireCommand);
program.addCommand(flowsCommand);
program.addCommand(mappingsCommand);

program.parse();
