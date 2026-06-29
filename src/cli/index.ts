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
import { whoamiCommand } from "./commands/whoami.js";
import { databasesCommand } from "./commands/databases.js";
import { appsCommand } from "./commands/apps.js";
import { bootstrapCommand } from "./commands/bootstrap.js";
import { loadEnvFileIntoProcess } from "./cli-api.js";

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
  .version(pkg.version)
  .option("--env-file <path>", "Load a dotenv file for this CLI invocation")
  .option("--org-id <id>", "Set KHOTAN_ORG_ID for this CLI invocation")
  .hook("preAction", (thisCommand, actionCommand) => {
    const opts = actionCommand.optsWithGlobals<{
      envFile?: string;
      orgId?: string;
    }>();
    if (opts.envFile) {
      loadEnvFileIntoProcess(opts.envFile);
    }
    if (opts.orgId) {
      process.env["KHOTAN_ORG_ID"] = opts.orgId;
    }
  });

program.addCommand(initCommand);
program.addCommand(addCommand);
program.addCommand(generateCommand);
program.addCommand(migrateCommand);
program.addCommand(plugCommand);
program.addCommand(wireCommand);
program.addCommand(flowsCommand);
program.addCommand(mappingsCommand);
program.addCommand(whoamiCommand);
program.addCommand(databasesCommand);
program.addCommand(appsCommand);
program.addCommand(bootstrapCommand);

program.parse();
