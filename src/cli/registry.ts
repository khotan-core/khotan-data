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
  outputBase: "outputDir" | "components" | "app" | "appRoot";
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
  /** Other khotan components/blocks that must be scaffolded first */
  requires?: string[];
}

// ---------------------------------------------------------------------------
// Components vs Blocks
// ---------------------------------------------------------------------------
// Components are reusable building blocks: library code, UI primitives, schema
// definitions. They never create routes or pages on their own.
//
// Blocks are sample routes/pages composed from components. They wire components
// into the app router so you can see them running immediately.
//
// Both use the same ComponentEntry shape and are addable via `khotan add`.
// ---------------------------------------------------------------------------

const COMPONENTS: Record<string, ComponentEntry> = {
  plug: {
    name: "plug",
    description:
      "Self-contained fetch wrapper with auth, retry, and pagination",
    files: [
      {
        templatePath: path.resolve(__dirname, "templates", "plug.ts"),
        outputFile: "plugs/plug.ts",
        outputBase: "outputDir",
      },
      {
        templatePath: path.resolve(__dirname, "templates", "plug.example.ts"),
        outputFile: "plugs/plug.example.ts",
        outputBase: "outputDir",
      },
    ],
    dependencies: {
      npmPackages: ["zod"],
    },
  },
  wire: {
    name: "wire",
    description:
      "Webhook subscription lifecycle management using Plug for HTTP",
    requires: ["plug", "schema"],
    requiresShadcn: true,
    dependencies: {
      npmPackages: ["drizzle-orm"],
      shadcnComponents: ["card", "badge", "button"],
    },
    files: [
      {
        templatePath: path.resolve(__dirname, "templates", "wire.ts"),
        outputFile: "wires/wire.ts",
        outputBase: "outputDir",
      },
      {
        templatePath: path.resolve(__dirname, "templates", "wire-panel.tsx"),
        outputFile: "wire.tsx",
        outputBase: "components",
      },
    ],
  },
  schema: {
    name: "schema",
    description: "Drizzle table definitions for khotan plugs, syncs, and runs",
    templatePath: path.resolve(__dirname, "templates", "schema.ts"),
    outputFile: "khotan.ts",
    dependencies: {
      npmPackages: ["drizzle-orm"],
    },
  },
  hub: {
    name: "hub",
    description: "Dashboard UI for managing plugs and syncs",
    requiresShadcn: true,
    dependencies: {
      npmPackages: ["drizzle-orm"],
      shadcnComponents: ["card", "badge", "table", "switch", "button", "input", "label"],
    },
    files: [
      {
        templatePath: path.resolve(__dirname, "templates", "hub.tsx"),
        outputFile: "hub.tsx",
        outputBase: "components",
      },
      {
        templatePath: path.resolve(__dirname, "templates", "wire-panel.tsx"),
        outputFile: "wire.tsx",
        outputBase: "components",
      },
      {
        templatePath: path.resolve(__dirname, "templates", "var-panel.tsx"),
        outputFile: "var-panel.tsx",
        outputBase: "components",
      },
    ],
  },
  "plug-debugger": {
    name: "plug-debugger",
    description:
      "Dev-only debug panel for testing plug requests interactively",
    requiresShadcn: true,
    requires: ["plug"],
    dependencies: {
      shadcnComponents: ["card", "badge", "button", "input", "label"],
    },
    files: [
      {
        templatePath: path.resolve(__dirname, "templates", "plug-debugger.tsx"),
        outputFile: "plug-debugger.tsx",
        outputBase: "components",
      },
    ],
  },
};

const BLOCKS: Record<string, ComponentEntry> = {
  "config-page-1": {
    name: "config-page-1",
    description: "Page route at /config that renders the KhotanHub dashboard",
    requires: ["hub"],
    files: [
      {
        templatePath: path.resolve(__dirname, "templates", "config-page.tsx"),
        outputFile: "config/page.tsx",
        outputBase: "appRoot",
      },
    ],
  },
};

export type EntryKind = "component" | "block";

export function getComponent(name: string): ComponentEntry | undefined {
  return COMPONENTS[name];
}

export function getBlock(name: string): ComponentEntry | undefined {
  return BLOCKS[name];
}

export function getEntry(
  name: string,
): { entry: ComponentEntry; kind: EntryKind } | undefined {
  const comp = COMPONENTS[name];
  if (comp) return { entry: comp, kind: "component" };
  const block = BLOCKS[name];
  if (block) return { entry: block, kind: "block" };
  return undefined;
}

export function getTemplateContent(
  entry: ComponentEntry | ComponentFile,
): string {
  const templatePath = "templatePath" in entry ? entry.templatePath : undefined;
  if (!templatePath) {
    throw new Error("No templatePath on entry");
  }
  return fs.readFileSync(templatePath, "utf-8");
}

export function listComponents(): ComponentEntry[] {
  return Object.values(COMPONENTS);
}

export function listBlocks(): ComponentEntry[] {
  return Object.values(BLOCKS);
}

export function isMultiFile(
  entry: ComponentEntry,
): entry is ComponentEntry & { files: ComponentFile[] } {
  return Array.isArray(entry.files) && entry.files.length > 0;
}
