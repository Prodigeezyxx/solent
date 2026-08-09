module.exports = {
  apps: [
    {
      // One process = full system: Worker API + D1 (local) + built React UI.
      name: 'solent',
      script: 'npx',
      // Run from the repo ROOT with the root wrangler.jsonc — the exact same
      // config production deploys use (wrangler ≥3.114 walks up and finds the
      // root jsonc anyway; running from worker/ made its `npm run build`
      // custom-build step fail because worker/package.json has no build script).
      // --persist-to keeps using the existing local D1 data under worker/.wrangler
      args: 'wrangler dev --port 3000 --ip 0.0.0.0 --persist-to worker/.wrangler/state',
      cwd: '/home/user/webapp',
      env: { NODE_ENV: 'development' },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
