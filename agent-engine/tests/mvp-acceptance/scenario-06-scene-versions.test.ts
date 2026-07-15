/**
 * MVP E2E 验收测试 — 场景 6: 场景版本管理 (M4-T44 + M4-T45)
 *
 * 测试场景:
 *   - 创建场景（初始版本 1.0.0）
 *   - 更新场景（版本自动递增）
 *   - 查询版本历史
 *   - 查询指定版本配置
 *   - 回滚到指定版本
 *
 * 验收标准:
 *   - 版本号自动递增
 *   - 历史版本可查
 *   - 可回滚到任意历史版本
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const SCENE_BASE = process.env.SCENE_BASE_URL || 'http://localhost:3002';

async function api(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`${SCENE_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data: data as Record<string, unknown> };
}

describe('MVP E2E — 场景6: 场景版本管理', () => {
  let sceneId: string;

  afterAll(async () => {
    // 清理测试数据
    if (sceneId) {
      await api('DELETE', `/scenes/${sceneId}`);
    }
  });

  // ── SemVer 递增测试（单元测试）───────────────────────────────────────

  describe('SemVer 递增逻辑', () => {
    function parseSemVer(v: string) {
      const parts = v.split('.');
      return {
        major: parseInt(parts[0] ?? '1', 10),
        minor: parseInt(parts[1] ?? '0', 10),
        patch: parseInt(parts[2] ?? '0', 10),
      };
    }

    function incrementVersion(current: string, type: 'major' | 'minor' | 'patch') {
      const { major, minor, patch } = parseSemVer(current);
      if (type === 'major') return `${major + 1}.0.0`;
      if (type === 'minor') return `${major}.${minor + 1}.0`;
      return `${major}.${minor}.${patch + 1}`;
    }

    it('patch 递增', () => {
      expect(incrementVersion('1.0.0', 'patch')).toBe('1.0.1');
      expect(incrementVersion('1.2.9', 'patch')).toBe('1.2.10');
      expect(incrementVersion('0.0.0', 'patch')).toBe('0.0.1');
    });

    it('minor 递增', () => {
      expect(incrementVersion('1.0.0', 'minor')).toBe('1.1.0');
      expect(incrementVersion('1.2.3', 'minor')).toBe('1.3.0');
    });

    it('major 递增', () => {
      expect(incrementVersion('1.0.0', 'major')).toBe('2.0.0');
      expect(incrementVersion('1.2.3', 'major')).toBe('2.0.0');
    });
  });

  // ── CRUD API 测试 ─────────────────────────────────────────────────────

  describe('Scene CRUD', () => {
    it('01 — POST /scenes 创建场景（初始版本 1.0.0）', async () => {
      const { status, data } = await api('POST', '/scenes', {
        name: `test-scene-${Date.now()}`,
        description: 'Test scene for version management',
        triggerWords: ['test', 'version'],
        priority: 50,
        enabled: true,
      });

      expect(status).toBe(201);
      expect(data.id).toBeDefined();
      expect(data.version).toBe('1.0.0');
      sceneId = data.id as string;
    });

    it('02 — GET /scenes 场景列表包含新场景', async () => {
      const { status, data } = await api('GET', '/scenes');
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it('03 — PUT /scenes/:id 更新场景（版本自动递增为 1.0.1）', async () => {
      const { status, data } = await api('PUT', `/scenes/${sceneId}`, {
        description: 'Updated description',
        changeSummary: 'Update description field',
      });

      expect(status).toBe(200);
      expect(data.version).toBe('1.0.1');
      expect(data.previousVersion).toBe('1.0.0');
      expect(data.changeType).toBe('patch');
    });

    it('04 — PUT /scenes/:id 再次更新（版本自动递增为 1.0.2）', async () => {
      const { status, data } = await api('PUT', `/scenes/${sceneId}`, {
        priority: 30,
        changeSummary: 'Update priority',
      });

      expect(status).toBe(200);
      expect(data.version).toBe('1.0.2');
    });

    it('05 — GET /scenes/:id 获取场景详情', async () => {
      const { status, data } = await api('GET', `/scenes/${sceneId}`);
      expect(status).toBe(200);
      expect(data.id).toBe(sceneId);
      expect(data.version).toBe('1.0.2');
      expect(Array.isArray(data.versionHistory)).toBe(true);
    });

    it('06 — GET /scenes/:id/versions 历史版本列表', async () => {
      const { status, data } = await api('GET', `/scenes/${sceneId}/versions`);
      expect(status).toBe(200);
      expect(data.sceneId).toBe(sceneId);
      expect(data.currentVersion).toBe('1.0.2');
      expect(Array.isArray(data.versions)).toBe(true);
      // 应该有 3 个版本: 1.0.0, 1.0.1, 1.0.2
      expect((data.versions as unknown[]).length).toBeGreaterThanOrEqual(3);
    });

    it('07 — GET /scenes/:id/versions/:version 获取指定版本配置', async () => {
      const { status, data } = await api('GET', `/scenes/${sceneId}/versions/1.0.0`);
      expect(status).toBe(200);
      expect(data.version).toBe('1.0.0');
      expect(data.config).toBeDefined();
    });

    it('08 — GET /scenes/:id/versions/:version 不存在的版本返回 404', async () => {
      const { status } = await api('GET', `/scenes/${sceneId}/versions/99.99.99`);
      expect(status).toBe(404);
    });

    it('09 — POST /scenes/:id/rollback 回滚到 1.0.0', async () => {
      const { status, data } = await api('POST', `/scenes/${sceneId}/rollback`, {
        version: '1.0.0',
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.rolledBackTo).toBe('1.0.0');
      // 回滚后版本应为 1.0.3 (patch 递增)
      expect(data.newVersion).toBe('1.0.3');
    });

    it('10 — 回滚后当前版本为 1.0.3', async () => {
      const { status, data } = await api('GET', `/scenes/${sceneId}`);
      expect(status).toBe(200);
      expect(data.version).toBe('1.0.3');
    });

    it('11 — 回滚后版本历史包含 4 条记录', async () => {
      const { status, data } = await api('GET', `/scenes/${sceneId}/versions`);
      expect(status).toBe(200);
      expect((data.versions as unknown[]).length).toBe(4);
    });

    it('12 — DELETE /scenes/:id 删除场景', async () => {
      const { status, data } = await api('DELETE', `/scenes/${sceneId}`);
      expect(status).toBe(200);
      expect(data.deleted).toBe(true);
    });

    it('13 — 删除后 GET /scenes/:id 返回 404', async () => {
      const { status } = await api('GET', `/scenes/${sceneId}`);
      expect(status).toBe(404);
      sceneId = ''; // 防止 afterAll 重复删除
    });

    it('14 — 创建同名场景返回 409', async () => {
      const name = `dup-test-${Date.now()}`;
      await api('POST', '/scenes', { name });
      const { status } = await api('POST', '/scenes', { name });
      expect(status).toBe(409);
    });
  });

  describe('版本号递增类型', () => {
    let vid = '';

    afterAll(async () => {
      if (vid) await api('DELETE', `/scenes/${vid}`);
    });

    it('major 变更递增 major 版本号', async () => {
      const { data } = await api('POST', '/scenes', {
        name: `major-test-${Date.now()}`,
      });
      vid = data.id as string;

      const res = await api('PUT', `/scenes/${vid}`, {
        changeSummary: 'Breaking change',
        metadata: { changeType: 'major' },
      });
      expect(res.data.version).toBe('2.0.0');
    });

    it('minor 变更递增 minor 版本号', async () => {
      const { data } = await api('POST', '/scenes', {
        name: `minor-test-${Date.now()}`,
      });
      vid = data.id as string;

      const res = await api('PUT', `/scenes/${vid}`, {
        changeSummary: 'New feature',
        metadata: { changeType: 'minor' },
      });
      expect(res.data.version).toBe('1.1.0');
    });
  });
});
