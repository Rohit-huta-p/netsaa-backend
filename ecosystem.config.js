// PM2 ecosystem — all 7 services on one VM
// Deploy: pm2 start ecosystem.config.js
// Reload:  pm2 reload all
// Logs:    pm2 logs --lines 100
// Status:  pm2 status

module.exports = {
  apps: [
    {
      name: 'users',
      script: './users-service/dist/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5001,
      },
      // Socket.IO needs sticky sessions — single instance only
      max_memory_restart: '400M',
      restart_delay: 3000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'gigs',
      script: './gigs-service/dist/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5002,
      },
      max_memory_restart: '300M',
      restart_delay: 2000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'events',
      script: './events-service/dist/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5003,
      },
      max_memory_restart: '300M',
      restart_delay: 2000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'payment',
      script: './payment-service/dist/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5005,
      },
      max_memory_restart: '200M',
      restart_delay: 2000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'media',
      script: './media-service/dist/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4005,
      },
      max_memory_restart: '200M',
      restart_delay: 2000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'search',
      script: './search-service/dist/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // PYMK + similarity workers run inside this process
      max_memory_restart: '400M',
      restart_delay: 3000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'support',
      script: './support-service/dist/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5006,
      },
      max_memory_restart: '200M',
      restart_delay: 2000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
