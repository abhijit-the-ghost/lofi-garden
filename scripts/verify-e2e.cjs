/* Runs every Playwright smoke test sequentially against a dev server.
 *
 *   bun run verify:e2e
 *
 * Uses an already-running server on :5180 if there is one (handy while
 * developing); otherwise starts its own. Each smoke test launches a fresh
 * browser profile, so no save state leaks between them.
 */
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 5180;
const SCRIPTS = [
  'test-interact.cjs',
  'test-m1.cjs',
  'test-m2.cjs',
  'test-m3.cjs',
  'test-m4.cjs',
  'test-m5.cjs',
  'test-m6.cjs',
  'test-m7.cjs',
];

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ping(url)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('dev server did not come up at ' + url);
}

(async () => {
  const alreadyRunning = await ping('http://localhost:' + PORT);
  let dev = null;
  if (alreadyRunning) {
    console.log('using the dev server already on :' + PORT);
  } else {
    dev = spawn('bun', ['run', 'dev'], { cwd: ROOT, stdio: 'ignore' });
    await waitForServer('http://localhost:' + PORT, 40000);
  }

  const failed = [];
  for (const script of SCRIPTS) {
    console.log('\n=== ' + script + ' ===');
    const result = spawnSync('bun', [script], { cwd: ROOT, stdio: 'inherit' });
    if (result.status !== 0) failed.push(script);
  }

  if (dev) dev.kill('SIGTERM');

  console.log('\n=== verify:e2e summary ===');
  if (failed.length) {
    console.log('FAILED: ' + failed.join(', '));
    process.exit(1);
  }
  console.log('all ' + SCRIPTS.length + ' smoke tests passed');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
