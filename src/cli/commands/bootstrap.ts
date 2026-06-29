import { Command } from "commander";
import { createBootstrap } from "../../bootstrap.js";
import { output } from "../cli-api.js";

export const bootstrapCommand = new Command("bootstrap")
  .description("Bootstrap Khotan config and route files without external calls")
  .option("--output-dir <path>", "Override generated Khotan output directory")
  .action(async (opts: { outputDir?: string }) => {
    const result = await createBootstrap({
      cwd: process.cwd(),
      ...(opts.outputDir ? { outputDir: opts.outputDir } : {}),
    });
    output({ ...result });
  });
