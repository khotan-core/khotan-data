import fs from "node:fs";
import path from "node:path";

export const BINDINGS_FILE = "khotan.bindings.json";

export interface DatabaseBinding {
  id: string;
  alias: string;
  urlEnv: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppEnvBinding {
  app: string;
  envKey: string;
  databaseAlias: string;
  databaseId: string;
  preparedAt: string;
}

export interface BindingRegistry {
  version: 1;
  databases: Record<string, DatabaseBinding>;
  apps: Record<string, { env: Record<string, AppEnvBinding> }>;
}

export function emptyBindingRegistry(): BindingRegistry {
  return { version: 1, databases: {}, apps: {} };
}

export function bindingsPath(cwd: string): string {
  return path.join(cwd, BINDINGS_FILE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRegistry(raw: unknown): BindingRegistry {
  if (!isRecord(raw)) return emptyBindingRegistry();

  const databases: Record<string, DatabaseBinding> = {};
  const rawDatabases = raw["databases"];
  if (isRecord(rawDatabases)) {
    for (const [alias, value] of Object.entries(rawDatabases)) {
      if (!isRecord(value)) continue;
      const id = value["id"];
      const urlEnv = value["urlEnv"];
      const createdAt = value["createdAt"];
      const updatedAt = value["updatedAt"];
      if (
        typeof id !== "string" ||
        typeof urlEnv !== "string" ||
        typeof createdAt !== "string" ||
        typeof updatedAt !== "string"
      ) {
        continue;
      }
      databases[alias] = { alias, id, urlEnv, createdAt, updatedAt };
    }
  }

  const apps: BindingRegistry["apps"] = {};
  const rawApps = raw["apps"];
  if (isRecord(rawApps)) {
    for (const [app, value] of Object.entries(rawApps)) {
      if (!isRecord(value) || !isRecord(value["env"])) continue;
      const env: Record<string, AppEnvBinding> = {};
      for (const [envKey, binding] of Object.entries(value["env"])) {
        if (!isRecord(binding)) continue;
        const databaseAlias = binding["databaseAlias"];
        const databaseId = binding["databaseId"];
        const preparedAt = binding["preparedAt"];
        if (
          typeof databaseAlias !== "string" ||
          typeof databaseId !== "string" ||
          typeof preparedAt !== "string"
        ) {
          continue;
        }
        env[envKey] = { app, envKey, databaseAlias, databaseId, preparedAt };
      }
      apps[app] = { env };
    }
  }

  return { version: 1, databases, apps };
}

export function readBindingRegistry(cwd: string): BindingRegistry {
  const filePath = bindingsPath(cwd);
  if (!fs.existsSync(filePath)) return emptyBindingRegistry();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return normalizeRegistry(raw);
  } catch {
    throw new Error(`${BINDINGS_FILE} is not valid JSON.`);
  }
}

export function writeBindingRegistry(
  cwd: string,
  registry: BindingRegistry,
): void {
  fs.writeFileSync(
    bindingsPath(cwd),
    `${JSON.stringify(registry, null, 2)}\n`,
    "utf-8",
  );
}

export function bindDatabase(
  cwd: string,
  alias: string,
  id: string,
  opts: { urlEnv?: string } = {},
): DatabaseBinding {
  const registry = readBindingRegistry(cwd);
  const now = new Date().toISOString();
  const existing = registry.databases[alias];
  const binding: DatabaseBinding = {
    alias,
    id,
    urlEnv: opts.urlEnv ?? existing?.urlEnv ?? "DATABASE_URL",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  registry.databases[alias] = binding;
  writeBindingRegistry(cwd, registry);
  return binding;
}

export function unbindDatabase(cwd: string, alias: string): boolean {
  const registry = readBindingRegistry(cwd);
  if (!registry.databases[alias]) return false;
  registry.databases = Object.fromEntries(
    Object.entries(registry.databases).filter(([key]) => key !== alias),
  );
  writeBindingRegistry(cwd, registry);
  return true;
}

export function prepareAppEnv(
  cwd: string,
  app: string,
  databaseAlias: string,
  opts: { envKey?: string } = {},
): AppEnvBinding {
  const registry = readBindingRegistry(cwd);
  const database = registry.databases[databaseAlias];
  if (!database) {
    throw new Error(`Database binding "${databaseAlias}" does not exist.`);
  }

  const envKey = opts.envKey ?? database.urlEnv;
  const binding: AppEnvBinding = {
    app,
    envKey,
    databaseAlias,
    databaseId: database.id,
    preparedAt: new Date().toISOString(),
  };
  registry.apps[app] = registry.apps[app] ?? { env: {} };
  registry.apps[app].env[envKey] = binding;
  writeBindingRegistry(cwd, registry);
  return binding;
}
