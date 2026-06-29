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

function arrayContainsKhotanData(arrayBody: string): boolean {
  return /["']khotan-data["']/.test(arrayBody);
}

function appendKhotanDataPackage(arrayBody: string): string {
  if (arrayBody.trim().length === 0) {
    return `"khotan-data"`;
  }

  if (!arrayBody.includes("\n")) {
    return `${arrayBody.trim().replace(/,\s*$/, "")}, "khotan-data"`;
  }

  const lines = arrayBody.split("\n");
  const closingIndent = lines[lines.length - 1]?.match(/^\s*/)?.[0] ?? "";
  const lastItemLine = [...lines]
    .reverse()
    .find((line) => line.trim().length > 0);
  const itemIndent = lastItemLine?.match(/^\s*/)?.[0] ?? `${closingIndent}  `;
  const bodyWithoutTrailingWhitespace = arrayBody.replace(/\s*$/, "");
  const bodyWithoutTrailingComma = bodyWithoutTrailingWhitespace.replace(
    /,\s*$/,
    "",
  );

  return `${bodyWithoutTrailingComma},\n${itemIndent}"khotan-data",\n${closingIndent}`;
}

function ensureServerExternalPackages(source: string): string | null {
  const packagePattern = /serverExternalPackages\s*:\s*\[([\s\S]*?)\]/m;
  const packageMatch = packagePattern.exec(source);

  if (packageMatch) {
    const body = packageMatch[1] ?? "";
    if (arrayContainsKhotanData(body)) return source;

    return source.replace(
      packagePattern,
      `serverExternalPackages: [${appendKhotanDataPackage(body)}]`,
    );
  }

  const namedExportPattern =
    /export\s+default\s+(?:withWorkflow\(\s*)?([A-Za-z_$][\w$]*)\s*\)?\s*;?/;
  const namedExport = namedExportPattern.exec(source);
  if (namedExport) {
    const name = namedExport[1]!;
    const declarationPattern = new RegExp(
      `(const\\s+${name}\\s*(?::[^=]+)?=\\s*\\{)`,
    );
    if (declarationPattern.test(source)) {
      return source.replace(
        declarationPattern,
        `$1\n  serverExternalPackages: ["khotan-data"],`,
      );
    }
  }

  const objectExportPattern = /(export\s+default\s+\{)/m;
  if (objectExportPattern.test(source)) {
    return source.replace(
      objectExportPattern,
      `$1\n  serverExternalPackages: ["khotan-data"],`,
    );
  }

  return null;
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

  // Non-greedy match to avoid over-matching nested braces in multi-object files
  const objectExportPattern = /export\s+default\s+(\{[\s\S]*?\})\s*;?/m;
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
        "const nextConfig: NextConfig = {",
        '  serverExternalPackages: ["khotan-data"],',
        "};",
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
  const withServerExternalPackages = ensureServerExternalPackages(withImport);
  if (!withServerExternalPackages) {
    return { status: "unsupported", path: configPath };
  }

  const wrapped = wrapDefaultExport(withServerExternalPackages);

  if (!wrapped) {
    return { status: "unsupported", path: configPath };
  }

  if (wrapped === original) {
    return { status: "skipped", path: configPath };
  }

  fs.writeFileSync(configPath, wrapped, "utf-8");
  return { status: "updated", path: configPath };
}
