/* M6 smoke: day/night cycle renders, fireflies & petals spawn, golden hour persists, sliders work. */
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

  await page.goto('http://localhost:5180', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /your farm/i }).click();
  await page.waitForTimeout(400);

  // --- dawn (world starts at elapsed 0)
  await page.screenshot({ path: 'shots/lofi6-dawn.png' });

  // --- late morning clear sky
  await page.evaluate(() => { window.__lofi.elapsed = 62; });
  await page.waitForTimeout(1800);
  const petals = await page.evaluate(() => window.__lofi.petals.length);
  console.log('petals in morning air:', petals);
  await page.screenshot({ path: 'shots/lofi6-morning.png' });

  // --- golden hour
  await page.evaluate(() => { window.__lofi.elapsed = 144; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/lofi6-golden.png' });

  // --- dusk / night: force the dark, expect fireflies
  await page.evaluate(() => {
    window.__lofi.elapsed = 186; // ~0.775 through, deep night
    window.__lofi.grid.placeBarn(40, 27, 4, 3, 99);
    window.__lofi.barns.push({ id: 99, x: 40, y: 27 });
  });
  await page.waitForTimeout(2500);
  const fireflies = await page.evaluate(() => window.__lofi.fireflies.length);
  console.log('fireflies at night:', fireflies);
  await page.screenshot({ path: 'shots/lofi6-night.png' });

  // --- settings: golden hour switch persists across reload
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('switch', { name: 'Always golden hour' }).click();
  await page.waitForTimeout(200);
  console.log('goldenHour after toggle:', await page.evaluate(() => window.__lofi.goldenHour));
  console.log('prefs on disk:', await page.evaluate(() => localStorage.getItem('lofi-garden-audio')));

  // --- SFX slider → 30 (scoped to the dialog — the corner player has its own Music slider)
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('slider', { name: 'Sound effects volume' }).fill('30');
  await page.waitForTimeout(300);
  console.log('sfx volume (0..1):', await page.evaluate(() => window.__audio.getSfxVolume()));

  // --- music slider → 80
  await settings.getByRole('slider', { name: 'Music volume' }).fill('80');
  await page.waitForTimeout(200);
  console.log('music volume (0..1):', await page.evaluate(() => window.__audio.getVolume()));
  await page.screenshot({ path: 'shots/lofi6-settings.png' });

  // --- reload: golden hour must still be on
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  console.log('goldenHour after reload:', await page.evaluate(() => window.__lofi.goldenHour));
  await page.getByRole('button', { name: /your farm/i }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/lofi6-eternal.png' });

  console.log('console/page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((err) => {
  console.error('M6 SMOKE FAIL:', err);
  process.exit(1);
});
