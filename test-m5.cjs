/* M5 smoke: farm persists across reload; settings shows lifetime stats; reset wipes. */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

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

  await page.goto('http://localhost:5180', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  // First visit: fresh world, fresh-farm button
  const firstButton = await page.getByRole('button', { name: /your farm/i }).textContent();
  console.log('first-visit button:', firstButton.trim());
  await page.getByRole('button', { name: /your farm/i }).click();
  await page.waitForTimeout(400);

  // Till + plant one turnip at (30,20)
  await page.keyboard.press('Digit2');
  const t = await tileToScreen(30, 20);
  await page.mouse.click(t.x, t.y);
  await page.waitForFunction(() => window.__lofi.grid.at(30, 20).tilled, { timeout: 20000 });
  await page.keyboard.press('Digit5');
  await page.mouse.click(t.x, t.y);
  await page.waitForFunction(() => !!window.__lofi.grid.at(30, 20).crop, { timeout: 20000 });

  // Distinctive growth state + a fence + the East deed
  await page.evaluate(() => {
    window.__lofi.grid.at(30, 20).crop.growth = 20;
    window.__lofi.coins = 200;
  });
  await page.keyboard.press('Digit6');
  await page.getByRole('button', { name: /Fence/ }).click();
  const f = await tileToScreen(26, 23);
  await page.mouse.click(f.x, f.y);
  await page.waitForFunction(() => window.__lofi.grid.at(26, 23).structure === 'fence', { timeout: 20000 });

  await page.evaluate(() => window.__lofi.camera.centerOn(52 * 16 + 8, 24 * 16 + 8));
  const eastSign = await tileToScreen(52, 24);
  await page.mouse.click(eastSign.x, eastSign.y);
  await page.waitForTimeout(300);
  console.log('after deed: coins =', await page.evaluate(() => window.__lofi.coins), '(expect 47 — fence cost 3c)');

  // Let autosave land (5s ticker)
  await page.waitForTimeout(5600);
  const saveShape = await page.evaluate(() => {
    const raw = localStorage.getItem('lofi-garden-save-v1');
    if (!raw) return null;
    const d = JSON.parse(raw);
    return { version: d.version, coins: d.coins, deeds: d.deeds, tiles: d.tiles.length, barns: d.barns.length, savedAt: d.savedAt };
  });
  console.log('save on disk:', saveShape);

  // ---- reload and continue
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const secondButton = await page.getByRole('button', { name: /your farm/i }).textContent();
  console.log('second-visit button:', secondButton.trim());
  await page.screenshot({ path: 'shots/lofi5-continue.png' });
  await page.getByRole('button', { name: /your farm/i }).click();
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => ({
    coins: window.__lofi.coins,
    growth: window.__lofi.grid.at(30, 20).crop?.growth,
    fence: window.__lofi.grid.at(26, 23).structure,
    eastUnlocked: window.__lofi.grid.isUnlocked('east'),
    ownedDeeds: [...window.__lofi.ownedDeeds],
  }));
  console.log('after reload:', JSON.stringify(after));
  console.log('assertions:', {
    coins50: after.coins === 47,
    growth20: Math.abs((after.growth ?? -1) - 20) < 0.5,
    fenceKept: after.fence === 'fence',
    eastKept: after.eastUnlocked && after.ownedDeeds.includes('east'),
  });

  // ---- settings modal + reset
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForTimeout(300);
  console.log('settings open:', await page.locator('.settings-card').count());
  await page.screenshot({ path: 'shots/lofi5-settings.png' });
  await page.getByRole('button', { name: /New Game \/ Reset Save/ }).click();
  await page.getByRole('button', { name: /Wipe it/ }).click();
  await page.waitForTimeout(900);

  const afterResetButton = await page.getByRole('button', { name: /your farm/i }).textContent();
  console.log('after reset button:', afterResetButton.trim());
  const resetState = await page.evaluate(() => ({
    coins: window.__lofi.coins,
    save: localStorage.getItem('lofi-garden-save-v1'),
  }));
  console.log('after reset: coins =', resetState.coins, '| save on disk:', resetState.save);

  console.log('console/page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((err) => {
  console.error('M5 SMOKE FAIL:', err);
  process.exit(1);
});
