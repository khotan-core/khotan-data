import { Command } from "commander";
import { prepareAppEnv, BINDINGS_FILE } from "../bindings.js";
import { output, fail } from "../cli-api.js";

export const appsCommand = new Command("apps").description(
  "Prepare local app deployment metadata",
);

const envCommand = new Command("env").description("Manage app env bindings");

envCommand
  .command("prepare")
  .description("Prepare app env metadata from a local database binding")
  .argument("<app>", "Application name")
  .requiredOption("--database <alias>", "Database binding alias")
  .option("--key <name>", "Environment variable name")
  .action((app: string, opts: { database: string; key?: string }) => {
    try {
      const binding = prepareAppEnv(process.cwd(), app, opts.database, {
        ...(opts.key ? { envKey: opts.key } : {}),
      });
      output({
        ok: true,
        binding,
        file: BINDINGS_FILE,
        hint: "No external provider was called. Use databaseId with your deployment tool to resolve and set the actual secret value.",
      });
    } catch (error) {
      fail("prepare_failed", (error as Error).message);
    }
  });

appsCommand.addCommand(envCommand);
