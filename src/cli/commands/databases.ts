import { Command } from "commander";
import {
  bindDatabase,
  readBindingRegistry,
  unbindDatabase,
  BINDINGS_FILE,
} from "../bindings.js";
import { output, fail } from "../cli-api.js";

export const databasesCommand = new Command("databases")
  .alias("db")
  .description("Manage local database bindings in khotan.bindings.json");

databasesCommand
  .command("bind")
  .description("Bind a database id to a local alias")
  .argument("<alias>", "Local database alias, e.g. primary")
  .argument("<id>", "Provisioned database id or provider reference")
  .option("--url-env <name>", "Env var expected to contain this database URL")
  .action((alias: string, id: string, opts: { urlEnv?: string }) => {
    const binding = bindDatabase(process.cwd(), alias, id, {
      ...(opts.urlEnv ? { urlEnv: opts.urlEnv } : {}),
    });
    output({ ok: true, binding, file: BINDINGS_FILE });
  });

databasesCommand
  .command("list")
  .description("List local database bindings")
  .action(() => {
    const registry = readBindingRegistry(process.cwd());
    output({
      ok: true,
      databases: Object.values(registry.databases),
      file: BINDINGS_FILE,
    });
  });

databasesCommand
  .command("unbind")
  .description("Remove a local database binding")
  .argument("<alias>", "Local database alias")
  .action((alias: string) => {
    const removed = unbindDatabase(process.cwd(), alias);
    if (!removed) {
      fail("binding_not_found", `No database binding named "${alias}".`);
    }
    output({ ok: true, removed: alias, file: BINDINGS_FILE });
  });
