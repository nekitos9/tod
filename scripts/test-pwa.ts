import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)),
  'test', 'tests/e2e/pwa.spec.ts', ...process.argv.slice(2),
], {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'inherit',
  env: {
    ...process.env,
    E2E_PWA: 'true',
    E2E_BASE_URL: 'http://127.0.0.1:4184/tod/',
    E2E_SERVER_COMMAND: 'npm run preview -- --host 127.0.0.1 --port 4184',
  },
})
if (result.error) console.error(result.error)
process.exitCode = result.status ?? 1
