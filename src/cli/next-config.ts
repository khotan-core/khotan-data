import fs from "node:fs";
import path from "node:path";

export interface EnsureWorkflowNextConfigResult {
  status: "updated" | "created" | "skipped" | "unsupported";
  path: string;
}

function findNextConfigPath(cwd: string): string {
  const candidates = [
    "next.config.ts",
    "next.config.mts",
    "next.config.js",
    "next.config.mjs",
  ];

  for (const candidate of candidates) {
    const fullPath = path.join(cwd, candidate);
    if (fs.existsSync(fullPath)) return fullPath;
  }

  return path.join(cwd, "next.config.ts");
}

function ensureWorkflowImport(source: string): string {
  if (
    source.includes(`from "workflow/next"`) ||
    source.includes(`from 'workflow/next'`)
  ) {
    return source;
  }

  const nextImportPattern =
    /import\s+type\s+\{\s*NextConfig\s*\}\s+from\s+["']next["'];?\n?/;
  if (nextImportPattern.test(source)) {
    return source.replace(
      nextImportPattern,
      (match) => `${match}import { withWorkflow } from "workflow/next";\n`,
    );
  }

  return `import { withWorkflow } from "workflow/next";\n${source}`;
}

function wrapDefaultExport(source: string): string | null {
  if (source.includes("export default withWorkflow(")) {
    return source;
  }

  const namedExportPattern = /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/;
  if (namedExportPattern.test(source)) {
    return source.replace(
      namedExportPattern,
      "export default withWorkflow($1);",
    );
  }

  const objectExportPattern = /export\s+default\s+(\{[\s\S]*\})\s*;?/m;
  if (objectExportPattern.test(source)) {
    return source.replace(
      objectExportPattern,
      "export default withWorkflow($1);",
    );
  }

  return null;
}

export function ensureWorkflowNextConfig(
  cwd: string,
): EnsureWorkflowNextConfigResult {
  const configPath = findNextConfigPath(cwd);

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      [
        'import type { NextConfig } from "next";',
        'import { withWorkflow } from "workflow/next";',
        "",
        "const nextConfig: NextConfig = {};",
        "",
        "export default withWorkflow(nextConfig);",
        "",
      ].join("\n"),
      "utf-8",
    );
    return { status: "created", path: configPath };
  }

  const original = fs.readFileSync(configPath, "utf-8");
  const withImport = ensureWorkflowImport(original);
  const wrapped = wrapDefaultExport(withImport);

  if (!wrapped) {
    return { status: "unsupported", path: configPath };
  }

  if (wrapped === original) {
    return { status: "skipped", path: configPath };
  }

  fs.writeFileSync(configPath, wrapped, "utf-8");
  return { status: "updated", path: configPath };
}
