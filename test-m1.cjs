/* M1 visual smoke test: start overlay -> dismiss -> drag-till -> farmer works -> screenshots. */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('http://localhost:5180', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'shots/lofi-title.png' });

  await page.getByRole('button', { name: /click to tend your farm/i }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/lofi-game.png' });

  // Drag across the meadow to queue till tasks (camera opens centered on starter)
  const canvas = await page.locator('canvas.game-canvas').boundingBox();
  const cx = canvas.x + canvas.width / 2;
  const cy = canvas.y + canvas.height / 2;
  await page.mouse.move(cx - 200, cy - 80);
  await page.mouse.down();
  await page.mouse.move(cx - 200, cy + 80, { steps: 24 });
  await page.mouse.move(cx - 120, cy + 80, { steps: 12 });
  await page.mouse.move(cx - 40, cy + 80, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shots/lofi-queued.png' });

  // Let the farmer walk and till
  await page.waitForTimeout(4500);
  await page.screenshot({ path: 'shots/lofi-working.png' });

  const t = await page.waitForTimeout(4000);
  await page.screenshot({ path: 'shots/lofi-done.png' });

  console.log('console/page errors:', errors.length ? errors : 'none');
  await browser.close();
  process.exit(0);
})().catch((err) => {
  console.error('SMOKE FAIL:', err);
  process.exit(1);
});
