/* M7 smoke: rain, sprinkler, lantern, bench/planter, notice board order card. */
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
  await page.getByRole('button', { name: /your farm/i }).click();
  await page.waitForTimeout(300);

  // --- 1) Notice board: camera over, bubble visible, click → order card
  await page.evaluate(() => window.__lofi.camera.centerOn(32 * 16 + 8, 33 * 16));
  await page.waitForTimeout(200);
  console.log('order fresh at boot:', await page.evaluate(() => window.__lofi.orderFresh));
  await page.screenshot({ path: 'shots/lofi7-board-fresh.png' });
  const boardPt = await tileToScreen(32, 34);
  await page.mouse.click(boardPt.x, boardPt.y);
  await page.waitForTimeout(300);
  console.log('order card open:', await page.locator('.order-card').count());
  console.log('card text:', (await page.locator('.order-card').innerText()).replace(/\n+/g, ' | '));
  await page.screenshot({ path: 'shots/lofi7-order-card.png' });

  // close the card with Esc
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  console.log('card after Esc:', await page.locator('.order-card').count());

  // --- 2) Fund the farm and build a sprinkler
  await page.evaluate(() => { window.__lofi.coins = 500; });
  await page.evaluate(() => window.__lofi.camera.centerOn(26 * 16, 22 * 16));
  await page.keyboard.press('Digit6');
  await page.getByRole('button', { name: /Sprinkler/ }).click();
  const sp = await tileToScreen(26, 22);
  await page.mouse.click(sp.x, sp.y);
  await page.waitForFunction(() => window.__lofi.grid.at(26, 22).structure === 'sprinkler', { timeout: 15000 });
  console.log('sprinkler built, coins →', await page.evaluate(() => window.__lofi.coins));

  // till the row around the sprinkler (the post itself refuses the hoe)
  await page.keyboard.press('Digit2');
  const t0 = await tileToScreen(25, 22);
  const t1 = await tileToScreen(27, 22);
  await page.mouse.move(t0.x, t0.y);
  await page.mouse.down();
  await page.mouse.move(t1.x, t1.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__lofi.grid.at(25, 22).tilled && window.__lofi.grid.at(27, 22).tilled, { timeout: 30000 });
  await page.evaluate(() => {
    const s = window.__lofi.sprinklers[0];
    if (s) s.timer = 29.9;
  });
  await page.waitForTimeout(500);
  const soaked = await page.evaluate(() => window.__lofi.grid.at(25, 22).moisture > 0.99 && window.__lofi.grid.at(27, 22).moisture > 0.99);
  console.log('sprinkler soaked the ring:', soaked);
  await page.screenshot({ path: 'shots/lofi7-sprinkler.png' });

  // --- 3) Lantern at dusk
  await page.keyboard.press('Digit6');
  await page.getByRole('button', { name: /Lantern/ }).click();
  const la = await tileToScreen(28, 24);
  await page.mouse.click(la.x, la.y);
  await page.waitForFunction(() => window.__lofi.grid.at(28, 24).structure === 'lantern', { timeout: 15000 });
  await page.evaluate(() => { window.__lofi.elapsed = 186; }); // deep night
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'shots/lofi7-lantern-night.png' });

  // --- 4) Bench & planter
  await page.keyboard.press('Digit6');
  await page.getByRole('button', { name: /Planter/ }).click();
  const pl = await tileToScreen(30, 25);
  await page.mouse.click(pl.x, pl.y);
  await page.keyboard.press('Digit6');
  await page.getByRole('button', { name: /Bench/ }).click();
  const be = await tileToScreen(31, 25);
  await page.mouse.click(be.x, be.y);
  await page.waitForFunction(
    () => window.__lofi.grid.at(30, 25).structure === 'planter' && window.__lofi.grid.at(31, 25).structure === 'bench',
    { timeout: 15000 },
  );
  console.log('planter & bench placed; bench blocks pathing:', await page.evaluate(() => !window.__lofi.grid.canStand(31, 25)));

  // --- 5) Rain
  await page.evaluate(() => window.__lofi.triggerRain(40));
  await page.waitForTimeout(1500);
  console.log('raining:', await page.evaluate(() => window.__lofi.isRaining()));
  console.log('streaks on screen:', await page.evaluate(() => window.__lofi.rainStreaks.length));
  const soakedTile = await page.evaluate(() => window.__lofi.grid.at(20, 18).tilled ? window.__lofi.grid.at(20, 18).moisture : -1);
  await page.screenshot({ path: 'shots/lofi7-rain.png' });

  // rain toggle + volume
  await page.getByRole('button', { name: /Mute the rain|Unmute the rain/ }).click();
  await page.waitForTimeout(400);
  console.log('rainOn after toggle:', await page.evaluate(() => window.__audio.getRainOn()));
  await page.locator('.player-rain').fill('25');
  await page.waitForTimeout(200);
  console.log('rain volume (0..1):', await page.evaluate(() => window.__audio.getRainVolume()));
  await page.getByRole('button', { name: /Mute the rain|Unmute the rain/ }).click(); // restore

  // --- 6) Settings shows orders completed
  await page.evaluate(() => { window.__lofi.rain.remaining = 0; });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForTimeout(300);
  const settingsText = await page.locator('.settings-card').innerText();
  console.log('settings shows bundles:', /Bundle orders completed/i.test(settingsText));
  await page.screenshot({ path: 'shots/lofi7-settings.png' });

  console.log('console/page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((err) => {
  console.error('M7 SMOKE FAIL:', err);
  process.exit(1);
});
