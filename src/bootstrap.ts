import fs from "node:fs";
import path from "node:path";
import { resolveOutputDir } from "./cli/cli-api.js";
import { configTemplate } from "./cli/config-template.js";

export interface BootstrapOptions {
  cwd?: string;
  outputDir?: string;
}

export interface BootstrapResult {
  ok: boolean;
  outputDir: string;
  created: string[];
  skipped: string[];
}

function hasSrcLayout(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, "src", "app"));
}

function writeIfMissing(
  cwd: string,
  relPath: string,
  content: string,
  result: BootstrapResult,
): void {
  const absPath = path.join(cwd, relPath);
  if (fs.existsSync(absPath)) {
    result.skipped.push(relPath);
    return;
  }
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, "utf-8");
  result.created.push(relPath);
}

export async function createBootstrap(
  opts: BootstrapOptions = {},
): Promise<BootstrapResult> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const outputDir = opts.outputDir ?? resolveOutputDir(cwd);
  const result: BootstrapResult = {
    ok: true,
    outputDir,
    created: [],
    skipped: [],
  };

  writeIfMissing(cwd, "khotan.config.ts", configTemplate(outputDir), result);

  const khotanTsImport = outputDir.startsWith("src/")
    ? `@/${outputDir.slice(4)}/khotan`
    : `@/${outputDir}/khotan`;

  writeIfMissing(
    cwd,
    path.join(outputDir, "khotan.ts"),
    `import { khotan, drizzleAdapter } from "khotan-data/factory";\n` +
      `import { db } from "@/db";\n\n` +
      `export default khotan({\n` +
      `  adapter: drizzleAdapter(db),\n` +
      `  plugs: [],\n` +
      `});\n`,
    result,
  );

  const routePath = hasSrcLayout(cwd)
    ? "src/app/api/khotan/[...all]/route.ts"
    : "app/api/khotan/[...all]/route.ts";
  writeIfMissing(
    cwd,
    routePath,
    `import { toNextJsHandler } from "khotan-data/factory";\n` +
      `import khotanData from "${khotanTsImport}";\n\n` +
      `export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(\n` +
      `  khotanData.handler,\n` +
      `);\n`,
    result,
  );

  return result;
}
