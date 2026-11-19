/* M4 smoke: audio unlocks on the start gesture, generative loop runs, controls work. */
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
  await page.waitForTimeout(600);
  console.log('audio state before start:', await page.evaluate(() => window.__audio?.state() ?? 'missing'));

  await page.getByRole('button', { name: /click to tend your farm/i }).click();
  await page.waitForTimeout(1200);
  const stateAfterStart = await page.evaluate(() => window.__audio.state());
  const onAfterStart = await page.evaluate(() => window.__audio.isOn());
  console.log('audio state after start:', stateAfterStart, '| isOn:', onAfterStart);

  console.log('player widget visible:', await page.locator('.player').count());
  console.log('toggle aria-label:', await page.getByRole('button', { name: /pause the lofi/i }).count());

  // let the generative loop run a few seconds while we till a tile
  await page.keyboard.press('Digit2');
  const a = await tileToScreen(page, 30, 20);
  await page.mouse.click(a.x, a.y);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'shots/lofi4-playing.png' });

  // pause the lofi
  await page.getByRole('button', { name: /pause the lofi/i }).click();
  await page.waitForTimeout(600);
  console.log('after pause — isOn:', await page.evaluate(() => window.__audio.isOn()),
    '| aria flipped:', await page.getByRole('button', { name: /play the lofi/i }).count());

  // volume slider → 20
  await page.locator('.player-volume:not(.player-rain)').fill('20');
  await page.waitForTimeout(300);
  console.log('volume (0..100):', await page.evaluate(() => Math.round(window.__audio.getVolume() * 100)));

  // resume
  await page.getByRole('button', { name: /play the lofi/i }).click();
  await page.waitForTimeout(400);
  console.log('after resume — isOn:', await page.evaluate(() => window.__audio.isOn()));
  await page.screenshot({ path: 'shots/lofi4-player.png' });

  console.log('console/page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((err) => {
  console.error('M4 SMOKE FAIL:', err);
  process.exit(1);
});
