import fs from "node:fs";
import path from "node:path";

/**
 * Attempt to resolve the Drizzle schema directory from drizzle.config.ts.
 * Returns the directory path relative to the project root, or null if detection fails.
 */
export function resolveDrizzleSchemaDir(projectRoot: string): string | null {
  const configPath = path.join(projectRoot, "drizzle.config.ts");

  if (!fs.existsSync(configPath)) {
    return null;
  }

  let content: string;
  try {
    content = fs.readFileSync(configPath, "utf-8");
  } catch {
    return null;
  }

  // Match schema: "./src/db/schema/*" or schema: "./db/schema.ts" or schema: "./src/db/schema"
  // Handles single-quoted, double-quoted, and backtick strings
  const schemaMatch = content.match(/schema:\s*["'`]([^"'`]+)["'`]/);

  if (!schemaMatch) {
    return null;
  }

  const schemaValue = schemaMatch[1] as string | undefined;

  if (!schemaValue) {
    return null;
  }

  // Strip leading ./ for consistency
  const normalized = schemaValue.replace(/^\.\//, "");

  // If it's a glob (e.g. "src/db/schema/*"), extract the directory
  if (normalized.includes("*")) {
    return normalized.replace(/\/\*.*$/, "");
  }

  // If it points to a file (e.g. "src/db/schema.ts"), extract the directory
  if (/\.\w+$/.test(normalized)) {
    return path.dirname(normalized);
  }

  // It's already a directory (e.g. "src/db/schema")
  return normalized;
}
