import fs from "node:fs";
import path from "node:path";

function readDrizzleConfig(projectRoot: string): {
  content: string;
  configPath: string;
} | null {
  const configPath = path.join(projectRoot, "drizzle.config.ts");

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    return { content: fs.readFileSync(configPath, "utf-8"), configPath };
  } catch {
    return null;
  }
}

function parseSchemaValue(content: string): string | null {
  const schemaMatch = /schema:\s*["'`]([^"'`]+)["'`]/.exec(content);
  return schemaMatch?.[1] ?? null;
}

/**
 * Attempt to resolve the Drizzle schema directory from drizzle.config.ts.
 * Returns the directory path relative to the project root, or null if detection fails.
 */
export function resolveDrizzleSchemaDir(projectRoot: string): string | null {
  const config = readDrizzleConfig(projectRoot);
  if (!config) return null;

  const schemaValue = parseSchemaValue(config.content);
  if (!schemaValue) return null;

  const normalized = schemaValue.replace(/^\.\//, "");

  if (normalized.includes("*")) {
    return normalized.replace(/\/\*.*$/, "");
  }

  if (/\.\w+$/.test(normalized)) {
    return path.dirname(normalized);
  }

  return normalized;
}

/**
 * Check if drizzle.config.ts schema points to a single file (not a glob or directory).
 * Returns the glob replacement value and config path, or null if no update is needed.
 */
export function detectSingleFileSchema(projectRoot: string): {
  configPath: string;
  currentValue: string;
  globValue: string;
} | null {
  const config = readDrizzleConfig(projectRoot);
  if (!config) return null;

  const schemaValue = parseSchemaValue(config.content);
  if (!schemaValue) return null;

  const normalized = schemaValue.replace(/^\.\//, "");

  if (normalized.includes("*")) return null;
  if (!/\.\w+$/.test(normalized)) return null;

  const dir = path.dirname(normalized);
  const prefix = schemaValue.startsWith("./") ? "./" : "";
  return {
    configPath: config.configPath,
    currentValue: schemaValue,
    globValue: `${prefix}${dir}/*`,
  };
}

/**
 * Rewrite the schema value in drizzle.config.ts.
 */
export function updateDrizzleConfigSchema(
  configPath: string,
  oldValue: string,
  newValue: string,
): void {
  const content = fs.readFileSync(configPath, "utf-8");
  const updated = content.replace(
    new RegExp(
      `(schema:\\s*)(["'\`])${oldValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\2`,
    ),
    `$1$2${newValue}$2`,
  );
  fs.writeFileSync(configPath, updated, "utf-8");
}
