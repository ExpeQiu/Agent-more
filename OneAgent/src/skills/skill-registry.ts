import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { LocalSkill, SkillFrontmatter, SkillSummary } from "../types/skill.js";
import type { Logger } from "../logging/logger.js";

function splitFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match?.[1] || match[2] === undefined) {
    throw new Error("SKILL.md must contain YAML frontmatter");
  }
  const frontmatter = parseYaml(match[1]) as SkillFrontmatter;
  if (!frontmatter.id) {
    throw new Error("SKILL.md frontmatter requires id");
  }
  return { frontmatter, body: match[2].trim() };
}

function findSkillFiles(skillsDir: string): string[] {
  const entries = readdirSync(skillsDir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(skillsDir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      const skillFile = join(fullPath, "SKILL.md");
      try {
        statSync(skillFile);
        files.push(skillFile);
      } catch {
        // 跳过无 SKILL.md 的目录
      }
    }
  }
  return files;
}

export class SkillRegistry {
  private readonly skills = new Map<string, LocalSkill>();

  constructor(
    private readonly skillsDir: string,
    private readonly logger: Logger,
  ) {}

  loadAll(): void {
    this.skills.clear();
    let files: string[] = [];
    try {
      files = findSkillFiles(this.skillsDir);
    } catch {
      this.logger.warn("skills directory not found, skipping", { dir: this.skillsDir });
      return;
    }

    for (const filePath of files) {
      const content = readFileSync(filePath, "utf8");
      const { frontmatter, body } = splitFrontmatter(content);
      const skill: LocalSkill = {
        id: frontmatter.id,
        name: frontmatter.name ?? frontmatter.id,
        roles: frontmatter.roles ?? [],
        priority: frontmatter.priority ?? 0,
        body,
        dirPath: join(filePath, ".."),
        filePath,
      };
      if (this.skills.has(skill.id)) {
        throw new Error(`Duplicate skill id: ${skill.id}`);
      }
      this.skills.set(skill.id, skill);
      this.logger.info("loaded skill", { skillId: skill.id, file: filePath });
    }
  }

  get(skillId: string): LocalSkill {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }
    return skill;
  }

  tryGet(skillId: string): LocalSkill | undefined {
    return this.skills.get(skillId);
  }

  list(): SkillSummary[] {
    return [...this.skills.values()]
      .sort((left, right) => right.priority - left.priority)
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        roles: skill.roles,
        priority: skill.priority,
        preview: skill.body.slice(0, 160),
      }));
  }

  resolveForAgent(agentId: string, autoLoadIds: string[]): LocalSkill[] {
    const resolved: LocalSkill[] = [];
    for (const skillId of autoLoadIds) {
      const skill = this.get(skillId);
      if (skill.roles.length > 0 && !skill.roles.includes(agentId)) {
        continue;
      }
      resolved.push(skill);
    }
    return resolved.sort((left, right) => right.priority - left.priority);
  }

  buildInjectionBlock(skills: LocalSkill[], maxChars: number): string | undefined {
    if (!skills.length) {
      return undefined;
    }
    const sections = skills.map((skill) => `[Skill: ${skill.name} (${skill.id})]\n${skill.body}`);
    let combined = sections.join("\n\n");
    if (combined.length > maxChars) {
      combined = `${combined.slice(0, maxChars)}\n\n...[skills truncated]`;
    }
    return `[Loaded Skills]\n${combined}`;
  }
}
