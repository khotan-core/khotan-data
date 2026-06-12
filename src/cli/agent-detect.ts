import fs from "node:fs";
import path from "node:path";

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
  agents: string[];
}

/**
 * Install skill files to all detected agent directories, plus AGENTS.md
 * at the project root. Skips files that already exist.
 */
export function installSkills(
  cwd: string,
  skills: SkillDefinition[],
  agentsTemplatePath: string,
): InstallResult {
  const targets = detectAgents(cwd);
  const result: InstallResult = {
    created: [],
    skipped: [],
    agents: targets.map((t) => t.agent),
  };

  for (const target of targets) {
    for (const skill of skills) {
      const relPath = target.skillPath(skill.name);
      const absPath = path.resolve(cwd, relPath);

      if (fs.existsSync(absPath)) {
        result.skipped.push(relPath);
        continue;
      }

      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      const content = fs.readFileSync(skill.templatePath, "utf-8");
      fs.writeFileSync(absPath, content, "utf-8");
      result.created.push(relPath);
    }
  }

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
 * Rewrite relative skill paths in AGENTS.md to point to the first
 * detected agent's skill directory.
 */
function resolveAgentsMdPaths(content: string, targets: AgentTarget[]): string {
  if (targets.length === 0) return content;
  const primary = targets[0]!;

  return content.replace(
    /skills\/(khotan-[\w-]+)\/SKILL\.md/g,
    (_match, name: string) => primary.skillPath(name),
  );
}
