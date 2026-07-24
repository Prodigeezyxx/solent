module.exports = {
  apps: [
    {
      // One process = full system: Worker API + D1 (local) + built React UI.
      name: 'solent',
      script: 'npx',
      args: 'wrangler dev --port 3000 --ip 0.0.0.0',
      cwd: '/home/user/webapp/worker',
      env: { NODE_ENV: 'development' },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
