module.exports = {
  apps: [
    {
      name: 'agent-gongchuang-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 8031',
      env: {
        NODE_ENV: 'production',
        PORT: 8031,
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
  ],
}
