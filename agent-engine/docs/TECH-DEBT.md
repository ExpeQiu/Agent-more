# Agent编排引擎 — Phase 1 技术债务清单

> 记录人: QA-负责人  
> 记录时间: 2026-04-25  
> 用途: P1-T75 技术债务清单整理

---

## 🔴 高优先级（影响生产稳定性）

### TD-001: 测试脚本为空桩
- **模块**: `packages/*/package.json` → `test` scripts
- **现状**: 所有 `test` 脚本都是 `echo 'test xxx'` 桩实现，无真实测试
- **影响**: CI/CD 无法真正验证代码质量
- **修复方案**: 引入 Vitest，编写真实单元测试
- **工时估算**: 3人天
- **责任人**: coder

### TD-002: lint 脚本为空桩
- **模块**: `packages/*/package.json` → `lint` scripts
- **现状**: 所有 `lint` 脚本都是 `echo 'lint xxx'` 桩实现
- **影响**: 无法在 CI 中执行 ESLint 检查
- **修复方案**: 统一使用根目录 `eslint.config.mjs`，在根目录执行 lint
- **工时估算**: 0.5人天
- **责任人**: coder

### TD-003: 无 E2E 测试框架
- **模块**: `tests/` (缺失)
- **现状**: 没有端到端测试基础设施
- **影响**: 无法验证完整的用户场景
- **修复方案**: 引入 Playwright + E2E 测试用例
- **工时估算**: 3人天
- **责任人**: qa

### TD-004: Prisma Migrations 目录为空
- **模块**: `apps/server/prisma/migrations/`
- **现状**: 只有 `migration_lock.toml`，无实际迁移文件
- **影响**: 新环境部署无法自动建表
- **修复方案**: 运行 `prisma migrate dev` 生成初始迁移，或手动创建
- **工时估算**: 0.5人天
- **责任人**: coder

### TD-005: Expert Packages 内容为空
- **模块**: `packages/expert-packages/*/`
- **现状**: 目录存在但无实现文件
- **影响**: 专家智能体无法正常工作
- **修复方案**: 填充 expert-tools 实现
- **工时估算**: 5人天
- **责任人**: coder

---

## 🟡 中优先级（影响开发效率）

### TD-006: tsconfig 未统一
- **模块**: 根目录和各子包的 `tsconfig.json`
- **现状**: 未确认所有包的 TypeScript 配置一致性
- **影响**: 部分包可能存在隐式 any 或路径解析问题
- **修复方案**: 审查并统一 tsconfig 配置
- **工时估算**: 0.5人天
- **责任人**: coder

### TD-007: 无 API 文档自动生成
- **模块**: `docs/API.md`
- **现状**: 手工维护 OpenAPI/Swagger 文档
- **影响**: API 与文档容易不同步
- **修复方案**: 使用 `tRPC` + `zod` 自动生成 OpenAPI schema
- **工时估算**: 1人天
- **责任人**: coder

### TD-008: Qdrant 向量数据库未配置
- **模块**: `packages/scene-router/src/hierarchical-scene-router.ts`
- **现状**: 引用了 `@qdrant/js-client-rest` 但未实际使用
- **影响**: Layer 2 路由降级到 LLM，无法发挥向量检索优势
- **修复方案**: 配置 Qdrant 实例并实现向量存储/检索
- **工时估算**: 2人天
- **责任人**: coder

### TD-009: 无性能基准测试
- **模块**: 整体性能
- **现状**: 没有基准测试（benchmark）来衡量性能回归
- **影响**: 性能优化无法量化效果
- **修复方案**: 引入 `autocannon` 或 `wrk` 进行 API 压测
- **工时估算**: 1人天
- **责任人**: qa

### TD-010: 缺少错误追踪集成
- **模块**: `apps/server/src/index.ts`
- **现状**: 没有 Sentry / 错误监控系统
- **影响**: 生产问题难以定位
- **修复方案**: 集成 Sentry SDK
- **工时估算**: 0.5人天
- **责任人**: coder

---

## 🟢 低优先级（代码质量改进）

### TD-011: macOS 资源分叉文件 (`._*`)
- **模块**: 整个代码库
- **现状**: 大量 `._index.ts` 等 macOS Finder 生成的文件
- **影响**: 提交时容易污染仓库
- **修复方案**: 配置 `.gitignore` 并清理现有文件
- **工时估算**: 0.1人天
- **责任人**: coder

### TD-012: node_modules_broken 目录
- **模块**: 项目根目录
- **现状**: 存在废弃的 `node_modules_broken` 目录
- **影响**: 占用磁盘空间
- **修复方案**: 确认无引用后删除
- **工时估算**: 0.05人天
- **责任人**: coder

### TD-013: 无 CI/CD 代码覆盖率强制门禁
- **模块**: `.github/workflows/ci.yml`
- **现状**: CI 配置了覆盖率但未强制要求 ≥60%
- **影响**: 覆盖率可被绕过
- **修复方案**: 添加 `fail_ci_if_error: true` 在 codecov action
- **工时估算**: 0.05人天（已在 ci.yml 中修复）

### TD-014: Expert Tools 无类型定义
- **模块**: `packages/core/src/tools/expert-tools.ts`
- **现状**: 存在文件但实现可能不完整
- **影响**: Agent 调用时缺少类型安全保障
- **修复方案**: 完善 Zod schema 定义
- **工时估算**: 0.5人天
- **责任人**: coder

---

## 📊 汇总

| 优先级 | 数量 | 工时合计 |
|--------|------|----------|
| 🔴 高  | 5    | 12人天   |
| 🟡 中  | 5    | 5人天    |
| 🟢 低  | 4    | 1.7人天  |
| **总计** | **14** | **18.7人天** |

---

## 📋 WBS 任务分配建议

| TD编号  | 建议迭代 | 建议负责人 |
|---------|----------|-----------|
| TD-001  | Sprint 2 | coder     |
| TD-002  | Sprint 2 | coder     |
| TD-003  | Sprint 2 | qa        |
| TD-004  | Sprint 2 | coder     |
| TD-005  | Sprint 3 | coder     |
| TD-006  | Sprint 2 | coder     |
| TD-007  | Sprint 3 | coder     |
| TD-008  | Sprint 3 | coder     |
| TD-009  | Sprint 2 | qa        |
| TD-010  | Sprint 3 | coder     |
| TD-011  | Sprint 2 | coder     |
| TD-012  | Sprint 2 | coder     |
| TD-013  | ✅ 已修复 | —        |
| TD-014  | Sprint 2 | coder     |
