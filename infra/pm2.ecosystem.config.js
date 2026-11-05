// pm2 process definitions for hosting CheckNBook on this machine's IP.
// Usage (from repo root, after `cd backend && pnpm build` and
// `cd frontend && pnpm build`):
//   pm2 start infra/pm2.ecosystem.config.js
//
// API   -> http://<server-ip>:4000  (CORS_ORIGIN must match the web origin below)
// Web   -> http://<server-ip>:5000  (static build served from frontend/dist)
module.exports = {
  apps: [
    {
      name: 'checknbook-api',
      cwd: __dirname + '/../backend',
      script: 'dist/index.js',
      instances: process.env.API_INSTANCES || 'max',
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        HOST: '0.0.0.0',
        CORS_ORIGIN: 'http://122.173.84.19:5000',
        DB_POOL_SIZE: 5,
      },
    },
    {
      name: 'checknbook-web',
      cwd: __dirname + '/../frontend',
      script: process.env.APPDATA + '\\npm\\node_modules\\serve\\build\\main.js',
      args: '-s dist -l tcp://0.0.0.0:5000',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
