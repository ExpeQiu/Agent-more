module.exports = {
  apps: [
    {
      name: 'agent-gongchuang-backend',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        DATABASE_URL: 'file:./dev.db',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
  ],
}
