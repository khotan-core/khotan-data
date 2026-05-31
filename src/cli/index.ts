import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { addCommand } from "./commands/add.js";

const program = new Command();

program
  .name("khotan")
  .description("Scaffold data components into your project")
  .version("0.0.1");

program.addCommand(initCommand);
program.addCommand(addCommand);

program.parse();
