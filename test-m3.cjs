/* M3 smoke: build paths/fence/barn, clear tool + barn confirm, deed purchases. */
const { chromium } = require('playwright');

const tileToScreen = (page, tx, ty) =>
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

  // --- 1) Build popover
  await page.keyboard.press('Digit6');
  await page.waitForTimeout(250);
  console.log('build popover visible:', await page.locator('.seeds-popover').count());
  await page.screenshot({ path: 'shots/lofi3-build-popover.png' });

  // --- 2) Place a fence run: select fence card
  await page.getByRole('button', { name: /Fence/ }).click();
  console.log('build tool:', await page.evaluate(() => window.__lofi.tool));

  // drag a fence run along y=21 from x=24 to x=29
  const f0 = await tileToScreen(page, 24, 21);
  const f1 = await tileToScreen(page, 29, 21);
  await page.mouse.move(f0.x, f0.y);
  await page.mouse.down();
  await page.mouse.move(f1.x, f1.y, { steps: 18 });
  await page.mouse.up();
  console.log('fence tasks queued:', await page.evaluate(() =>
    window.__lofi.queue.list().filter(t => t.type === 'build').length));
  await page.waitForFunction(
    () => [24, 25, 26, 27, 28, 29].every(x => window.__lofi.grid.at(x, 21).structure === 'fence'),
    { timeout: 45000 },
  );
  console.log('farmer placed the fence run');
  await page.screenshot({ path: 'shots/lofi3-fence.png' });

  // --- 3) Path: select path, click a couple tiles (fund a friendlier wallet first)
  await page.evaluate(() => { window.__lofi.coins = 50; });
  await page.keyboard.press('Digit6');
  await page.getByRole('button', { name: /Path/ }).click();
  const p0 = await tileToScreen(page, 26, 24);
  const p1 = await tileToScreen(page, 27, 24);
  await page.mouse.click(p0.x, p0.y);
  await page.mouse.click(p1.x, p1.y);
  await page.waitForFunction(
    () => [26, 27].every(x => window.__lofi.grid.at(x, 24).structure === 'path'),
    { timeout: 30000 },
  );
  console.log('farmer placed two paths');

  // --- 4) Barn: fund the wallet, place at (40, 27) — need empty 4x3
  await page.evaluate(() => { window.__lofi.coins = 500; });
  await page.keyboard.press('Digit6');
  await page.getByRole('button', { name: /Barn/ }).click();
  console.log('barn tool selected:', await page.evaluate(() => window.__lofi.selectedBuild));
  const barnAt = await tileToScreen(page, 40, 27);
  await page.mouse.click(barnAt.x, barnAt.y);
  console.log('after barn click: coins =', await page.evaluate(() => window.__lofi.coins), '(expect 100)');
  await page.waitForFunction(() => window.__lofi.barns.length === 1, { timeout: 45000 });
  await page.waitForFunction(() => window.__lofi.queue.capacity === 48, { timeout: 10000 });
  console.log('barn built — queue cap now', await page.evaluate(() => window.__lofi.queue.capacity));
  await page.screenshot({ path: 'shots/lofi3-barn.png' });

  // --- 5) Clear: remove one fence tile, then open + dismiss barn confirm
  await page.keyboard.press('Digit7');
  const clearAt = await tileToScreen(page, 26, 21);
  await page.mouse.click(clearAt.x, clearAt.y);
  console.log('fence at 26,21 after clear:', await page.evaluate(() => window.__lofi.grid.at(26, 21).structure));

  const barnTile = await tileToScreen(page, 41, 28);
  await page.mouse.click(barnTile.x, barnTile.y);
  await page.waitForTimeout(300);
  console.log('barn confirm dialog:', await page.locator('.confirm-card').count());
  await page.screenshot({ path: 'shots/lofi3-barn-confirm.png' });
  await page.getByRole('button', { name: /Keep the barn/ }).click();
  await page.waitForTimeout(200);
  console.log('barn survives keep:', await page.evaluate(() => window.__lofi.barns.length === 1));

  await page.mouse.click(barnTile.x, barnTile.y);
  await page.getByRole('button', { name: /Tear it down/ }).click();
  await page.waitForTimeout(300);
  console.log('barns after teardown:', await page.evaluate(() => window.__lofi.barns.length), 'cap:', await page.evaluate(() => window.__lofi.queue.capacity));

  // --- 6) Deeds: teleport the camera to the signposts and buy East + North
  await page.evaluate(() => window.__lofi.camera.centerOn(52 * 16 + 8, 24 * 16 + 8));
  await page.evaluate(() => { window.__lofi.coins = 200; });
  const eastSign = await tileToScreen(page, 52, 24);
  // count decor in east parcel before purchase
  const decorBefore = await page.evaluate(() =>
    window.__lofi.grid.tiles.filter(t => t.parcel === 'east' && t.decor !== 0).length);
  await page.mouse.click(eastSign.x, eastSign.y);
  await page.waitForTimeout(300);
  const decorAfter = await page.evaluate(() =>
    window.__lofi.grid.tiles.filter(t => t.parcel === 'east' && t.decor !== 0).length);
  console.log(`east deed: coins → ${await page.evaluate(() => window.__lofi.coins)} (expect 50), decor ${decorBefore} → ${decorAfter}, unlocked =`, await page.evaluate(() => window.__lofi.grid.isUnlocked('east')));

  // out-of-order purchase attempt: North sign with 50c — should refuse (needs 300c)
  await page.evaluate(() => window.__lofi.camera.centerOn(32 * 16 + 8, 7 * 16 + 8));
  const northSign = await tileToScreen(page, 32, 7);
  await page.mouse.click(northSign.x, northSign.y);
  await page.waitForTimeout(300);
  console.log('north view: pin-or-toast shown:', await page.locator('.toast').count() > 0 || await page.locator('.pin-card').count() > 0);
  await page.evaluate(() => { window.__lofi.coins = 300; });
  await page.mouse.click(northSign.x, northSign.y);
  await page.waitForTimeout(300);
  console.log('north deed: coins →', await page.evaluate(() => window.__lofi.coins), '(expect 0), unlocked =', await page.evaluate(() => window.__lofi.grid.isUnlocked('north')));
  await page.screenshot({ path: 'shots/lofi3-deeds.png' });

  console.log('console/page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((err) => {
  console.error('M3 SMOKE FAIL:', err);
  process.exit(1);
});
