/**
 * Expo web against the local API: `pnpm --filter @curtain-crm/mobile web:local`.
 *
 * `extra.apiUrl` in app.json points at production; this sets
 * EXPO_PUBLIC_API_URL for one dev server only, so the config never changes.
 * Port 8083: 8081 is the phone tunnel, 8082 is taken on the dev machine.
 */
const { spawnSync } = require('node:child_process');

const result = spawnSync('npx', ['expo', 'start', '--web', '--port', process.env.PORT ?? '8083'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4123/trpc' },
});
process.exit(result.status ?? 1);
