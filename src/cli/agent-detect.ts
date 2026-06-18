import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AgentTarget {
  agent: string;
  skillPath: (skillName: string) => string;
}

const AGENT_TARGETS: AgentTarget[] = [
  {
    agent: "cursor",
    skillPath: (name) => `.cursor/skills/${name}/SKILL.md`,
  },
  {
    agent: "claude",
    skillPath: (name) => `.claude/skills/${name}/SKILL.md`,
  },
  {
    agent: "codex",
    skillPath: (name) => `.agents/skills/${name}/SKILL.md`,
  },
  {
    agent: "copilot",
    skillPath: (name) => `.github/skills/${name}/SKILL.md`,
  },
  {
    agent: "kiro",
    skillPath: (name) => `.kiro/skills/${name}/SKILL.md`,
  },
  {
    agent: "roo",
    skillPath: (name) => `.roo/rules/${name}/SKILL.md`,
  },
];

const AGENT_MARKERS: Record<string, string> = {
  cursor: ".cursor",
  claude: ".claude",
  codex: ".agents",
  copilot: ".github",
  kiro: ".kiro",
  roo: ".roo",
};

/** Version stamp comment embedded in skill files for upgrade detection. */
const VERSION_STAMP_RE = /<!-- khotan-skill-version: (.+) -->/;

function readPackageVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "..", "..", "package.json");
    const content = fs.readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(content) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Detect which coding agents are present in the project by checking for
 * their config directories. Returns at least one target — if none are
 * detected, defaults to `.cursor` + `.claude` (the two most common).
 */
export function detectAgents(cwd: string): AgentTarget[] {
  const detected = AGENT_TARGETS.filter((t) => {
    const marker = AGENT_MARKERS[t.agent];
    return marker && fs.existsSync(path.join(cwd, marker));
  });

  if (detected.length > 0) return detected;

  return AGENT_TARGETS.filter(
    (t) => t.agent === "cursor" || t.agent === "claude",
  );
}

export interface SkillDefinition {
  name: string;
  templatePath: string;
}

export interface InstallResult {
  created: string[];
  skipped: string[];
  refreshed: string[];
  agents: string[];
}

export interface InstallOptions {
  autoYes?: boolean;
}

/**
 * Install skill files to all detected agent directories, plus AGENTS.md
 * at the project root.
 *
 * - Creates missing skill files
 * - Refreshes existing skill files whose version stamp is older than the
 *   current package version
 * - Skips files that are already up to date
 */
export function installSkills(
  cwd: string,
  skills: SkillDefinition[],
  agentsTemplatePath: string,
  options: InstallOptions = {},
): InstallResult {
  const targets = detectAgents(cwd);
  const detectedExplicitly = AGENT_TARGETS.some((t) => {
    const marker = AGENT_MARKERS[t.agent];
    return marker && fs.existsSync(path.join(cwd, marker));
  });

  if (!detectedExplicitly && !options.autoYes) {
    console.log(
      "⚠ No agent directories detected. Defaulting to .cursor + .claude.",
    );
  }

  const currentVersion = readPackageVersion();
  const result: InstallResult = {
    created: [],
    skipped: [],
    refreshed: [],
    agents: targets.map((t) => t.agent),
  };

  for (const target of targets) {
    for (const skill of skills) {
      const relPath = target.skillPath(skill.name);
      const absPath = path.resolve(cwd, relPath);

      const templateContent = fs.readFileSync(skill.templatePath, "utf-8");
      const stamped = stampContent(templateContent, currentVersion);

      if (fs.existsSync(absPath)) {
        const existing = fs.readFileSync(absPath, "utf-8");
        const existingVersion = extractVersion(existing);

        if (existingVersion && existingVersion === currentVersion) {
          result.skipped.push(relPath);
          continue;
        }

        // Refresh stale skill file
        fs.writeFileSync(absPath, stamped, "utf-8");
        result.refreshed.push(relPath);
        continue;
      }

      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, stamped, "utf-8");
      result.created.push(relPath);
    }
  }

  // Write AGENTS.md — rewrite links for ALL detected agents
  const agentsPath = path.resolve(cwd, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) {
    const content = fs.readFileSync(agentsTemplatePath, "utf-8");
    const resolved = resolveAgentsMdPaths(content, targets);
    fs.writeFileSync(agentsPath, resolved, "utf-8");
    result.created.push("AGENTS.md");
  } else {
    result.skipped.push("AGENTS.md");
  }

  return result;
}

/**
 * Add a version stamp comment to skill content.
 */
function stampContent(content: string, version: string): string {
  if (VERSION_STAMP_RE.test(content)) {
    return content.replace(
      VERSION_STAMP_RE,
      `<!-- khotan-skill-version: ${version} -->`,
    );
  }
  return `<!-- khotan-skill-version: ${version} -->\n${content}`;
}

/**
 * Extract the version stamp from an existing skill file.
 */
function extractVersion(content: string): string | null {
  const match = VERSION_STAMP_RE.exec(content);
  return match?.[1] ?? null;
}

/**
 * Rewrite relative skill paths in AGENTS.md to point to ALL detected
 * agent skill directories (not just the primary one).
 */
function resolveAgentsMdPaths(content: string, targets: AgentTarget[]): string {
  if (targets.length === 0) return content;

  const primary = targets[0]!;

  // Replace generic skill paths with the primary agent's path
  let resolved = content.replace(
    /skills\/(khotan-[\w-]+)\/SKILL\.md/g,
    (_match, name: string) => primary.skillPath(name),
  );

  // If multiple agents are detected, append a note about the other locations
  if (targets.length > 1) {
    const otherAgents = targets.slice(1);
    const note =
      `\n---\n\n` +
      `> Skills are also installed to: ${otherAgents.map((t) => t.agent).join(", ")}.\n` +
      `> Each agent reads skills from its own directory.\n`;
    resolved += note;
  }

  return resolved;
}
