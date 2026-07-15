# Agent编排引擎 — 生产部署手册

> 预计完成时间：**< 30 分钟**（符合 P1-T73 验收标准）

---

## 目录

- [前置要求](#前置要求)
- [环境准备](#环境准备)
- [快速部署（推荐）](#快速部署推荐)
- [手动部署](#手动部署)
- [数据库迁移](#数据库迁移)
- [健康检查](#健康检查)
- [监控配置](#监控配置)
- [回滚方案](#回滚方案)
- [故障排查](#故障排查)

---

## 前置要求

| 组件        | 版本要求       | 说明                    |
|------------|--------------|------------------------|
| Docker     | ≥ 24.0       | 容器运行时               |
| Docker Compose | ≥ 2.20   | 编排工具                 |
| PostgreSQL | 16 (可选)     | 如使用外部数据库           |
| Redis      | 7 (可选)       | 如使用外部 Redis          |
| 最低硬件配置  | 2核CPU/4GB内存 | 单节点最小配置            |

---

## 环境准备

### 1. 克隆代码

```bash
git clone https://github.com/your-org/agent-engine.git
cd agent-engine
git checkout v0.1.0
```

### 2. 创建环境变量文件

```bash
cp .env.postgres.prod .env
```

编辑 `.env`，填写以下必需变量：

```bash
# ─── 数据库 ────────────────────────────────────────────────────────────────
POSTGRES_PASSWORD=your_secure_password_here
DATABASE_URL=postgresql://agent_engine:your_secure_password_here@postgres:5432/agent_engine

# ─── Redis ──────────────────────────────────────────────────────────────────
REDIS_PASSWORD=your_redis_password_here
REDIS_URL=redis://default:your_redis_password_here@redis:6379/0

# ─── 应用 ───────────────────────────────────────────────────────────────────
NODE_ENV=production
LOG_LEVEL=info
SERVER_PORT=3000

# ─── 可选：监控 ─────────────────────────────────────────────────────────────
GRAFANA_ADMIN_PASSWORD=your_grafana_password_here
```

### 3. 生成 Prisma 客户端

```bash
pnpm install
pnpm --filter @agent-engine/server db:generate
```

---

## 快速部署（推荐）

### 使用 Docker Compose（一步启动）

```bash
# 构建并启动所有服务
docker compose -f docker-compose.prod.yml up -d --build

# 查看服务状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f server
```

**预计启动时间：~20-25 秒**（符合 <30s 要求）

### 验证部署

```bash
# 健康检查
curl http://localhost:3000/health

# 预期输出：
# {"ok":true,"redis":true,"database":true,"version":"0.1.0"}
```

---

## 手动部署

### 步骤 1：构建生产镜像

```bash
docker build \
  --target production \
  -f Dockerfile.prod \
  -t agent-engine:0.1.0 .
```

### 步骤 2：启动基础设施服务

```bash
docker compose -f docker-compose.prod.yml up -d postgres redis
```

### 步骤 3：运行数据库迁移

```bash
docker compose -f docker-compose.prod.yml run --rm server \
  pnpm --filter @agent-engine/server db:migrate
```

### 步骤 4：启动应用

```bash
docker compose -f docker-compose.prod.yml up -d server
```

---

## 数据库迁移

### 首次部署（完整迁移）

```bash
# 生成 Prisma 客户端
pnpm --filter @agent-engine/server db:generate

# 运行所有迁移
pnpm --filter @agent-engine/server db:migrate

# 推送到生产（快，适合新表结构）
pnpm --filter @agent-engine/server db:push
```

### 生产性能索引（可选优化）

```bash
psql $DATABASE_URL -f apps/server/prisma/migrations/20260425_performance_indexes/migration.sql
```

### 验证迁移

```sql
SELECT * FROM "Agent" LIMIT 1;
-- 应返回空表，无报错
```

---

## 健康检查

### 自动健康检查

Docker Compose 已配置 `HEALTHCHECK`，容器每 10 秒检测一次：

```
test: wget -qO- http://localhost:3000/health
interval: 10s
timeout: 5s
retries: 3
start_period: 30s
```

### 手动验证

```bash
# 单机健康检查
curl http://localhost:3000/health

# Redis 连接
docker exec agent-engine-redis-prod redis-cli -a $REDIS_PASSWORD ping

# PostgreSQL 连接
docker exec agent-engine-pg-prod psql -U agent_engine -d agent_engine -c "SELECT 1"
```

---

## 监控配置

### Prometheus（已集成）

访问：`http://localhost:9090`

预配置抓取：
- `server:3000` — Agent Engine 应用指标
- `postgres:5432` — PostgreSQL 慢查询监控
- `redis:6379` — Redis 内存和命中率

### Grafana（已集成）

访问：`http://localhost:3001`  
默认账号：`admin` / `GRAFANA_ADMIN_PASSWORD`

预置仪表板：
- **Agent Engine Overview** — QPS、延迟、错误率
- **Database Performance** — 查询延迟、连接数
- **Redis Cache** — 命中率、内存使用

---

## 回滚方案

### Docker Compose 回滚

```bash
# 查看历史版本
git log --oneline

# 回滚到上一个版本
git checkout v0.0.9
docker compose -f docker-compose.prod.yml up -d --build server
```

### 数据库回滚

```bash
# 回滚上一个迁移
pnpm --filter @agent-engine/server db:migrate rollback

# 或手动回滚
psql $DATABASE_URL -c "DROP TABLE IF EXISTS \"RoutingDecision\" CASCADE;"
```

---

## 故障排查

### 容器启动失败

```bash
# 查看详细日志
docker compose -f docker-compose.prod.yml logs server --tail=100

# 常见原因：
# 1. DATABASE_URL 错误 → 检查 .env
# 2. 端口冲突 → 改 SERVER_PORT
# 3. 内存不足 → docker system prune
```

### 数据库连接失败

```bash
# 检查 PostgreSQL 是否运行
docker ps | grep postgres

# 进入 PostgreSQL 容器
docker exec -it agent-engine-pg-prod psql -U agent_engine -d agent_engine

# 测试连接
SELECT pg_isready();
```

### Redis 连接失败

```bash
# 测试 Redis
docker exec -it agent-engine-redis-prod redis-cli -a $REDIS_PASSWORD ping
# 预期：PONG
```

### 性能问题

```sql
-- 查看慢查询（>100ms）
SELECT * FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;

-- 查看活动连接数
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
```

---

## 部署检查清单

- [ ] `.env` 文件已配置（密码已更改）
- [ ] `docker-compose.prod.yml up -d` 成功
- [ ] `curl http://localhost:3000/health` 返回 `{"ok":true,...}`
- [ ] Grafana 仪表板可访问
- [ ] 日志无 ERROR 级别输出
- [ ] 数据库迁移已完成
- [ ] 性能索引已应用（可选）

---

**预计总部署时间：20-25 分钟**
