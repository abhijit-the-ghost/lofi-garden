const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto('http://localhost:5180', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /click to tend your farm/i }).click();
  await page.waitForTimeout(300);

  const canvas = await page.locator('canvas.game-canvas').boundingBox();
  const cx = canvas.x + canvas.width / 2;
  const cy = canvas.y + canvas.height / 2;

  // 1) Inspect: click a fresh grass tile
  await page.getByRole('button', { name: 'Inspect' }).click();
  await page.mouse.click(cx + 150, cy - 120);
  await page.waitForTimeout(300);
  const pinTitle = await page.locator('.pin-title').textContent().catch(() => null);
  console.log('pin card title:', pinTitle);
  await page.screenshot({ path: 'lofi-garden/shots/lofi-inspect.png' });

  // 2) Queue a row of till tasks with Till tool
  await page.getByRole('button', { name: /^Till/ }).click();
  await page.mouse.move(cx - 300, cy + 60);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy + 60, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const capText = () => page.locator('.chips-cap').textContent();
  console.log('queued before right-click:', await capText());

  // 3) Right-click an un-started queued tile to unqueue it
  await page.mouse.click(cx - 260, cy + 60, { button: 'right' });
  await page.waitForTimeout(300);
  console.log('queued after right-click:', await capText());

  // 4) Esc returns to inspect
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const inspectPressed = await page.getByRole('button', { name: 'Inspect' }).getAttribute('aria-pressed');
  console.log('inspect selected after Esc:', inspectPressed);

  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
