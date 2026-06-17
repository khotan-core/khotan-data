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

// Both `khotan-data` and `@khotan/cli` ship a bin named `khotan`, so this
// package also exposes a `khotan-data` bin to stay unambiguous when both are
// installed. Reflect whichever bin was invoked in help/usage text, defaulting
// to the canonical `khotan-data`.
function resolveProgramName(): string {
  const invokedAs = path.basename(process.argv[1] ?? "");
  return invokedAs === "khotan" || invokedAs === "khotan-data"
    ? invokedAs
    : "khotan-data";
}

const program = new Command();

program
  .name(resolveProgramName())
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
