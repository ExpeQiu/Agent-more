/**
 * PM2 Ecosystem Config — Agent编排引擎
 * 同时启动：主服务 + 质量评分服务 + 场景管理服务
 * M4-T44 + M4-T45
 */
module.exports = {
  apps: [
    // ─── 主服务（Prisma + Redis Bootstrap）───────────────────────────────
    {
      name: 'agent-engine-main',
      script: 'apps/server/dist/index.js',
      cwd: '/app',
      instances: 1,
      autorestart: true,
      watch: false,
      exp_backoff_restart_delay: 1000,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
      },
    },

    // ─── 质量评分服务 (port 3001) — P1-T33 ─────────────────────────────
    {
      name: 'agent-engine-quality',
      script: 'apps/server/dist/services/quality-server.js',
      cwd: '/app',
      instances: 1,
      autorestart: true,
      watch: false,
      exp_backoff_restart_delay: 1000,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        QUALITY_PORT: '3001',
      },
    },

    // ─── 场景管理服务 (port 3002) — M4-T44 + M4-T45 ───────────────────
    {
      name: 'agent-engine-scenes',
      script: 'apps/server/dist/services/scene-server.js',
      cwd: '/app',
      instances: 1,
      autorestart: true,
      watch: false,
      exp_backoff_restart_delay: 1000,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        SCENE_PORT: '3002',
      },
    },
  ],
};
