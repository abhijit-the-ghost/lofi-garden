/* M2 smoke: full farming loop — till, sow turnips, force-ripen, inspect, harvest, coins. */
const { chromium } = require('playwright');

const TILE = 16;
const VIEW_W = 480;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('http://localhost:5180', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /click to tend your farm/i }).click();
  await page.waitForTimeout(300);

  const tileToScreen = (tx, ty) =>
    page.evaluate(([tx, ty]) => {
      const canvas = document.querySelector('canvas.game-canvas');
      const rect = canvas.getBoundingClientRect();
      const cam = window.__lofi.camera;
      const scale = rect.width / 480;
      return {
        x: rect.left + (tx * 16 + 8 - cam.x) * scale,
        y: rect.top + (ty * 16 + 8 - cam.y) * scale,
      };
    }, [tx, ty]);

  // --- 1) Till two tiles near the farmer (he stands at 32,24)
  await page.keyboard.press('Digit2');
  const a = await tileToScreen(28, 22);
  const b = await tileToScreen(29, 22);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  console.log('tilled queue:', await page.evaluate(() => window.__lofi.queue.size));

  // Wait for the farmer to till both tiles
  await page.waitForFunction(
    () => window.__lofi.grid.at(28, 22).tilled && window.__lofi.grid.at(29, 22).tilled,
    { timeout: 30000 },
  );
  console.log('farmer tilled both tiles');

  // --- 2) Seeds popover + sow two turnips
  await page.keyboard.press('Digit5');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'shots/lofi2-popover.png' });
  await page.getByRole('button', { name: /Turnip/ }).click();
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  console.log('after sowing: coins =', await page.evaluate(() => window.__lofi.coins), '(expect 12)');

  await page.waitForFunction(
    () => window.__lofi.grid.at(28, 22).crop && window.__lofi.grid.at(29, 22).crop,
    { timeout: 30000 },
  );
  console.log('farmer planted both tiles');
  await page.screenshot({ path: 'shots/lofi2-planted.png' });

  // --- 3) Water both tiles (drag across)
  await page.keyboard.press('Digit3');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(
    () => window.__lofi.grid.at(28, 22).moisture > 0.9 && window.__lofi.grid.at(29, 22).moisture > 0.9,
    { timeout: 30000 },
  );
  console.log('farmer watered both tiles');

  // --- 4) Simulate the slow part of the afternoon: set growth near ripe
  await page.evaluate(() => {
    window.__lofi.grid.at(28, 22).crop.growth = 44.6;
    window.__lofi.grid.at(29, 22).crop.growth = 44.6;
  });
  await page.waitForTimeout(1200);
  console.log('ripe?', await page.evaluate(() => ({
    a: window.__lofi.grid.at(28, 22).crop?.growth,
    b: window.__lofi.grid.at(29, 22).crop?.growth,
  })));

  // --- 5) Inspect a ripe turnip — pin card should read Ripe
  await page.keyboard.press('Escape'); // close seeds popover if open
  await page.keyboard.press('Digit1');
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(200);
  console.log('pin title:', await page.locator('.pin-title').textContent());
  await page.screenshot({ path: 'shots/lofi2-ripe-pin.png' });

  // --- 6) Harvest both — coins should go 12 → 30
  await page.keyboard.press('Digit4');
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.waitForFunction(
    () => !window.__lofi.grid.at(28, 22).crop && !window.__lofi.grid.at(29, 22).crop,
    { timeout: 30000 },
  );
  console.log('after harvest: coins =', await page.evaluate(() => window.__lofi.coins), '(expect 30)');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'shots/lofi2-harvested.png' });

  console.log('console/page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((err) => {
  console.error('M2 SMOKE FAIL:', err);
  process.exit(1);
});
