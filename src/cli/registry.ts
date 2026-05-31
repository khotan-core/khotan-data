import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ComponentFile {
  templatePath: string;
  /** Output path relative to a base directory determined at scaffold time */
  outputFile: string;
  /**
   * Where to resolve the output path from:
   * - "outputDir" — the khotan outputDir (default)
   * - "components" — components/khotan/ relative to project root
   * - "app" — app/api/khotan/[...all]/ relative to project root (or src/app if src layout)
   */
  outputBase: "outputDir" | "components" | "app";
}

export interface ComponentDeps {
  npmPackages?: string[];
  npmDevPackages?: string[];
  shadcnComponents?: string[];
}

export interface ComponentEntry {
  name: string;
  description: string;
  /** Single-file component */
  templatePath?: string;
  outputFile?: string;
  /** Multi-file component */
  files?: ComponentFile[];
  /** Requires shadcn to be installed */
  requiresShadcn?: boolean;
  /** Dependencies this component requires in the user's project */
  dependencies?: ComponentDeps;
}

const COMPONENTS: Record<string, ComponentEntry> = {
  plug: {
    name: "plug",
    description: "Self-contained fetch wrapper with auth, retry, and pagination",
    templatePath: path.resolve(__dirname, "templates", "plug.ts"),
    outputFile: "plug.ts",
  },
  schema: {
    name: "schema",
    description:
      "Drizzle table definitions for khotan plugs, syncs, and runs",
    templatePath: path.resolve(__dirname, "templates", "schema.ts"),
    outputFile: "khotan.ts",
    dependencies: {
      npmPackages: ["drizzle-orm"],
    },
  },
  hub: {
    name: "hub",
    description:
      "Dashboard UI, API route, and config for managing plugs and syncs",
    requiresShadcn: true,
    dependencies: {
      npmPackages: ["drizzle-orm"],
      shadcnComponents: ["card", "badge", "table", "switch"],
    },
    files: [
      {
        templatePath: path.resolve(__dirname, "templates", "hub.tsx"),
        outputFile: "hub.tsx",
        outputBase: "components",
      },
      {
        templatePath: path.resolve(__dirname, "templates", "khotan-route.ts"),
        outputFile: "route.ts",
        outputBase: "app",
      },
      {
        templatePath: path.resolve(__dirname, "templates", "khotan-config.ts"),
        outputFile: "khotan.ts",
        outputBase: "outputDir",
      },
    ],
  },
};

export function getComponent(name: string): ComponentEntry | undefined {
  return COMPONENTS[name];
}

export function getTemplateContent(entry: ComponentEntry | ComponentFile): string {
  const templatePath = "templatePath" in entry ? entry.templatePath : undefined;
  if (!templatePath) {
    throw new Error("No templatePath on entry");
  }
  return fs.readFileSync(templatePath, "utf-8");
}

export function listComponents(): ComponentEntry[] {
  return Object.values(COMPONENTS);
}

export function isMultiFile(entry: ComponentEntry): entry is ComponentEntry & { files: ComponentFile[] } {
  return Array.isArray(entry.files) && entry.files.length > 0;
}
