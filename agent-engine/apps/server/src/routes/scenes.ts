/**
 * Scene Routes — M4-T44 (Scene CRUD) + M4-T45 (Scene Version Management)
 *
 * SemVer 规则:
 * - major: 不兼容 API 变更
 * - minor: 向后兼容功能新增
 * - patch: 向后兼容问题修复
 *
 * 路由:
 *   POST   /scenes              — 创建场景（初始版本 1.0.0）
 *   GET    /scenes              — 场景列表
 *   GET    /scenes/:id          — 获取场景
 *   PUT    /scenes/:id          — 更新场景（自动递增版本）
 *   DELETE /scenes/:id          — 删除场景
 *   GET    /scenes/:id/versions — 历史版本列表
 *   GET    /scenes/:id/versions/:version — 指定版本配置
 *   POST   /scenes/:id/rollback — 回滚到指定版本
 */

import { prisma } from '../index.js';
import { z } from 'zod';

// ─── Schema Validation ──────────────────────────────────────────────────────

const CreateSceneSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  triggerWords: z.array(z.string()).default([]),
  rules: z.record(z.unknown()).optional(),
  descriptionText: z.string().optional(),
  fewShotExamples: z.array(z.unknown()).optional(),
  priority: z.number().int().min(1).default(100),
  enabled: z.boolean().default(true),
  metadata: z.record(z.unknown()).optional(),
});

const UpdateSceneSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  triggerWords: z.array(z.string()).optional(),
  rules: z.record(z.unknown()).optional(),
  descriptionText: z.string().optional(),
  fewShotExamples: z.array(z.unknown()).optional(),
  priority: z.number().int().min(1).optional(),
  enabled: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
  /** 变更摘要（用于版本历史） */
  changeSummary: z.string().optional(),
  /** 强制指定版本号（一般不填，由系统自动递增） */
  forceVersion: z.string().optional(),
});

const RollbackSchema = z.object({
  version: z.string().min(1, 'version is required'),
  /** 可选：指定变更类型，默认为 patch */
  changeType: z.enum(['major', 'minor', 'patch']).optional().default('patch'),
});

// ─── SemVer Helpers ─────────────────────────────────────────────────────────

/**
 * 解析 SemVer 版本字符串为 { major, minor, patch }
 */
function parseSemVer(version: string): { major: number; minor: number; patch: number } {
  const parts = version.split('.');
  return {
    major: parseInt(parts[0] ?? '1', 10),
    minor: parseInt(parts[1] ?? '0', 10),
    patch: parseInt(parts[2] ?? '0', 10),
  };
}

/**
 * 递增 SemVer 版本号
 */
function incrementVersion(
  current: string,
  changeType: 'major' | 'minor' | 'patch'
): string {
  const { major, minor, patch } = parseSemVer(current);
  switch (changeType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
  }
}

// ─── Scene CRUD Handlers ────────────────────────────────────────────────────

/**
 * POST /scenes — 创建场景
 * 初始版本为 1.0.0
 */
export async function handleCreateScene(body: unknown): Promise<{
  status: number;
  data: unknown;
}> {
  try {
    const input = CreateSceneSchema.parse(body);

    // 检查名称是否已存在
    const existing = await prisma.scene.findUnique({ where: { name: input.name } });
    if (existing) {
      return { status: 409, data: { error: `Scene with name '${input.name}' already exists` } };
    }

    const initialVersion = '1.0.0';
    const config = {
      name: input.name,
      description: input.description,
      triggerWords: input.triggerWords,
      rules: input.rules,
      descriptionText: input.descriptionText,
      fewShotExamples: input.fewShotExamples,
      priority: input.priority,
      enabled: input.enabled,
      metadata: input.metadata,
    };

    const scene = await prisma.scene.create({
      data: {
        name: input.name,
        description: input.description,
        triggerWords: input.triggerWords,
        rules: input.rules,
        descriptionText: input.descriptionText,
        fewShotExamples: input.fewShotExamples ? JSON.stringify(input.fewShotExamples) : undefined,
        priority: input.priority,
        enabled: input.enabled,
        metadata: input.metadata,
        version: initialVersion,
        versions: {
          create: {
            version: initialVersion,
            config: config as object,
            changeSummary: 'Initial version',
            changeType: 'initial',
          },
        },
      },
      include: { versions: true },
    });

    return {
      status: 201,
      data: {
        id: scene.id,
        name: scene.name,
        description: scene.description,
        triggerWords: scene.triggerWords,
        rules: scene.rules,
        descriptionText: scene.descriptionText,
        priority: scene.priority,
        enabled: scene.enabled,
        version: scene.version,
        createdAt: scene.createdAt,
        updatedAt: scene.updatedAt,
      },
    };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { status: 400, data: { error: err.errors } };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 500, data: { error: msg } };
  }
}

/**
 * GET /scenes — 场景列表
 */
export async function handleListScenes(): Promise<{ status: number; data: unknown }> {
  try {
    const scenes = await prisma.scene.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        triggerWords: true,
        priority: true,
        enabled: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { status: 200, data: scenes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 500, data: { error: msg } };
  }
}

/**
 * GET /scenes/:id — 获取场景
 */
export async function handleGetScene(id: string): Promise<{ status: number; data: unknown }> {
  try {
    const scene = await prisma.scene.findUnique({
      where: { id },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          select: { version: true, changeSummary: true, changeType: true, createdAt: true },
        },
      },
    });
    if (!scene) {
      return { status: 404, data: { error: 'Scene not found' } };
    }
    return {
      status: 200,
      data: {
        id: scene.id,
        name: scene.name,
        description: scene.description,
        triggerWords: scene.triggerWords,
        rules: scene.rules,
        descriptionText: scene.descriptionText,
        priority: scene.priority,
        enabled: scene.enabled,
        version: scene.version,
        createdAt: scene.createdAt,
        updatedAt: scene.updatedAt,
        versionHistory: scene.versions,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 500, data: { error: msg } };
  }
}

/**
 * PUT /scenes/:id — 更新场景（自动递增版本号）
 */
export async function handleUpdateScene(
  id: string,
  body: unknown
): Promise<{ status: number; data: unknown }> {
  try {
    const input = UpdateSceneSchema.parse(body);

    const existing = await prisma.scene.findUnique({ where: { id } });
    if (!existing) {
      return { status: 404, data: { error: 'Scene not found' } };
    }

    // 检查名称冲突
    if (input.name && input.name !== existing.name) {
      const conflict = await prisma.scene.findUnique({ where: { name: input.name } });
      if (conflict) {
        return { status: 409, data: { error: `Scene with name '${input.name}' already exists` } };
      }
    }

    // 判断变更类型并递增版本号
    const changeType: 'major' | 'minor' | 'patch' =
      input.metadata?.changeType as 'major' | 'minor' | 'patch' ?? 'patch';
    const newVersion = input.forceVersion ?? incrementVersion(existing.version, changeType);

    // 构建新配置快照
    const config = {
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      triggerWords: input.triggerWords ?? existing.triggerWords,
      rules: input.rules ?? existing.rules,
      descriptionText: input.descriptionText ?? existing.descriptionText,
      priority: input.priority ?? existing.priority,
      enabled: input.enabled ?? existing.enabled,
      metadata: input.metadata ?? existing.metadata,
    };

    // 事务：更新场景 + 创建版本记录
    const updated = await prisma.$transaction(async (tx) => {
      const scene = await tx.scene.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          triggerWords: input.triggerWords,
          rules: input.rules,
          descriptionText: input.descriptionText,
          fewShotExamples: input.fewShotExamples
            ? JSON.stringify(input.fewShotExamples)
            : undefined,
          priority: input.priority,
          enabled: input.enabled,
          metadata: input.metadata,
          version: newVersion,
        },
      });

      await tx.sceneVersion.create({
        data: {
          sceneId: id,
          version: newVersion,
          config: config as object,
          changeSummary: input.changeSummary ?? `Updated to ${newVersion}`,
          changeType,
        },
      });

      return scene;
    });

    return {
      status: 200,
      data: {
        id: updated.id,
        name: updated.name,
        version: updated.version,
        previousVersion: existing.version,
        changeType,
        updatedAt: updated.updatedAt,
      },
    };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { status: 400, data: { error: err.errors } };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 500, data: { error: msg } };
  }
}

/**
 * DELETE /scenes/:id — 删除场景
 */
export async function handleDeleteScene(id: string): Promise<{ status: number; data: unknown }> {
  try {
    const existing = await prisma.scene.findUnique({ where: { id } });
    if (!existing) {
      return { status: 404, data: { error: 'Scene not found' } };
    }
    await prisma.scene.delete({ where: { id } });
    return { status: 200, data: { deleted: true, id } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 500, data: { error: msg } };
  }
}

// ─── Version Management Handlers (M4-T45) ───────────────────────────────────

/**
 * GET /scenes/:id/versions — 历史版本列表
 */
export async function handleListVersions(id: string): Promise<{ status: number; data: unknown }> {
  try {
    const scene = await prisma.scene.findUnique({ where: { id } });
    if (!scene) {
      return { status: 404, data: { error: 'Scene not found' } };
    }

    const versions = await prisma.sceneVersion.findMany({
      where: { sceneId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        version: true,
        changeSummary: true,
        changeType: true,
        createdAt: true,
      },
    });

    return {
      status: 200,
      data: {
        sceneId: id,
        currentVersion: scene.version,
        versions,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 500, data: { error: msg } };
  }
}

/**
 * GET /scenes/:id/versions/:version — 指定版本配置
 */
export async function handleGetVersion(
  id: string,
  version: string
): Promise<{ status: number; data: unknown }> {
  try {
    const scene = await prisma.scene.findUnique({ where: { id } });
    if (!scene) {
      return { status: 404, data: { error: 'Scene not found' } };
    }

    const versionRecord = await prisma.sceneVersion.findUnique({
      where: { sceneId_version: { sceneId: id, version } },
    });

    if (!versionRecord) {
      return { status: 404, data: { error: `Version ${version} not found` } };
    }

    return {
      status: 200,
      data: {
        sceneId: id,
        currentVersion: scene.version,
        version: versionRecord.version,
        config: versionRecord.config,
        changeSummary: versionRecord.changeSummary,
        changeType: versionRecord.changeType,
        createdAt: versionRecord.createdAt,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 500, data: { error: msg } };
  }
}

/**
 * POST /scenes/:id/rollback — 回滚到指定版本
 */
export async function handleRollback(
  id: string,
  body: unknown
): Promise<{ status: number; data: unknown }> {
  try {
    const input = RollbackSchema.parse(body);

    const scene = await prisma.scene.findUnique({ where: { id } });
    if (!scene) {
      return { status: 404, data: { error: 'Scene not found' } };
    }

    // 获取目标版本
    const targetVersion = await prisma.sceneVersion.findUnique({
      where: { sceneId_version: { sceneId: id, version: input.version } },
    });

    if (!targetVersion) {
      return {
        status: 404,
        data: { error: `Version ${input.version} not found` },
      };
    }

    const config = targetVersion.config as Record<string, unknown>;

    // 递增 patch 版本号作为回滚后的新版本
    const newVersion = incrementVersion(scene.version, input.changeType);

    const updated = await prisma.$transaction(async (tx) => {
      const updatedScene = await tx.scene.update({
        where: { id },
        data: {
          name: config.name as string ?? scene.name,
          description: config.description as string | null,
          triggerWords: (config.triggerWords as string[]) ?? scene.triggerWords,
          rules: config.rules as object | null,
          descriptionText: config.descriptionText as string | null,
          priority: (config.priority as number) ?? scene.priority,
          enabled: (config.enabled as boolean) ?? scene.enabled,
          metadata: config.metadata as object | null,
          version: newVersion,
        },
      });

      // 记录回滚版本
      await tx.sceneVersion.create({
        data: {
          sceneId: id,
          version: newVersion,
          config: {
            ...targetVersion.config,
            rolledBackFrom: input.version,
          },
          changeSummary: `Rollback to ${input.version}`,
          changeType: 'patch',
        },
      });

      return updatedScene;
    });

    return {
      status: 200,
      data: {
        success: true,
        sceneId: id,
        rolledBackTo: input.version,
        newVersion: updated.version,
        message: `Successfully rolled back to ${input.version} (now at ${updated.version})`,
      },
    };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { status: 400, data: { error: err.errors } };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 500, data: { error: msg } };
  }
}
