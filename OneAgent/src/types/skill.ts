export type SkillFrontmatter = {
  id: string;
  name?: string;
  roles?: string[];
  priority?: number;
};

export type LocalSkill = {
  id: string;
  name: string;
  roles: string[];
  priority: number;
  body: string;
  dirPath: string;
  filePath: string;
};

export type SkillSummary = {
  id: string;
  name: string;
  roles: string[];
  priority: number;
  preview: string;
};
