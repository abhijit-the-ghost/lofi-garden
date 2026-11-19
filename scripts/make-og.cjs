/* Builds public/og.png (1200x630) — the social-preview card — from a live,
 * freshly-seeded in-game scene plus the bundled pixel fonts.
 *
 *   node scripts/make-og.cjs      (expects a node >= 18 on PATH; starts its own throwaway dev server on :5199)
 *
 * The capture happens on a dedicated port, so localStorage is fresh and the
 * card never touches the developer's real farm on :5180.
 * Everything is embedded as data URIs; fully offline apart from the dev server.
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DEV_PORT = 5199;
const DEV_URL = 'http://localhost:' + DEV_PORT;

const dataUri = (file, mime) =>
  'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');

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
  const dev = spawn('bun', ['run', 'dev', '--port', String(DEV_PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  try {
    await waitForServer(DEV_URL, 40000);

    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await page.click('.start-button');
    await page.waitForTimeout(600); // let the toast expire out of the frame

    const TILES = [];
    for (let y = 20; y <= 22; y++) for (let x = 24; x <= 28; x++) TILES.push([x, y]);

    // Seed the demo farm straight through the world API (throwaway origin),
    // so the card is deterministic and doesn't depend on pointer gymnastics.
    await page.evaluate((tiles) => {
      const w = window.__lofi;
      w.coins += 500; // enough for the whole demo patch
      for (const [x, y] of tiles) w.queueTill(x, y);
    }, TILES);
    await page.waitForFunction(
      (tiles) => tiles.every(([x, y]) => window.__lofi.grid.at(x, y).tilled),
      TILES,
      { timeout: 60000 }
    );

    await page.evaluate((tiles) => {
      const w = window.__lofi;
      for (const [x, y] of tiles) w.queuePlant(x, y);
      for (const [x, y] of tiles) w.queueWater(x, y);
    }, TILES);
    await page.waitForFunction(
      (tiles) => tiles.every(([x, y]) => window.__lofi.grid.at(x, y).crop),
      TILES,
      { timeout: 60000 }
    );

    // Skip the wait — set growth just shy of ripe so sparkles/stage-4 art show
    await page.evaluate((tiles) => {
      for (const [x, y] of tiles) {
        const t = window.__lofi.grid.at(x, y);
        if (t.crop) t.crop.growth = 55;
      }
    }, TILES);
    await page.waitForTimeout(1500);

    // 5) Hide all DOM chrome; the canvas alone is the art
    await page.addStyleTag({
      content: '#root * { visibility: hidden !important; } #root canvas.game-canvas { visibility: visible !important; }',
    });
    const box = await page.locator('canvas.game-canvas').boundingBox();
    const scenePath = path.join(ROOT, 'shots', 'og-scene.png');
    fs.mkdirSync(path.dirname(scenePath), { recursive: true });
    await page.screenshot({ path: scenePath, clip: box });
    await context.close();
    if (errors.length) console.warn('page errors during capture:', errors);

    // 6) Compose the card, fully embedded
    const cardCtx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
    const card = await cardCtx.newPage();
    const scene = dataUri(scenePath, 'image/png');
    const font2p = dataUri(
      path.join(ROOT, 'node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2'),
      'font/woff2'
    );
    const fontVt = dataUri(
      path.join(ROOT, 'node_modules/@fontsource/vt323/files/vt323-latin-400-normal.woff2'),
      'font/woff2'
    );
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      @font-face { font-family: 'Press Start 2P'; src: url('${font2p}') format('woff2'); }
      @font-face { font-family: 'VT323'; src: url('${fontVt}') format('woff2'); }
      * { box-sizing: border-box; }
      body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: radial-gradient(1200px 700px at 72% 40%, #382a44 0%, #2c1f33 60%); }
      .frame { position: absolute; right: 58px; top: 148px; padding: 12px; background: linear-gradient(#54402c, #3a2a1e); border-radius: 12px; box-shadow: 0 0 0 3px #241a29, 0 24px 48px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,255,255,0.08); transform: rotate(1.2deg); }
      .frame img { display: block; width: 565px; height: auto; image-rendering: pixelated; border-radius: 5px; }
      .frame figcaption { font-family: 'VT323', monospace; color: #cbb891; font-size: 19px; letter-spacing: 2px; text-align: center; padding-top: 10px; }
      .copy { position: absolute; left: 60px; top: 128px; width: 520px; }
      .kicker { font-family: 'VT323', monospace; color: #e7c46a; font-size: 27px; letter-spacing: 6px; margin: 0 0 18px; }
      h1 { font-family: 'Press Start 2P', monospace; color: #fff3c9; font-size: 56px; line-height: 1.35; margin: 0 0 26px; letter-spacing: 2px; text-shadow: 0 5px 0 #1d1420, 0 0 52px rgba(231,196,106,0.4); }
      .blurb { font-family: 'VT323', monospace; color: #d9c9b4; font-size: 25px; line-height: 1.45; margin: 0 0 30px; width: 450px; }
      .cta { font-family: 'Press Start 2P', monospace; font-size: 11px; letter-spacing: 1px; color: #241a29; background: #e7c46a; padding: 15px 20px; border-radius: 6px; box-shadow: 0 5px 0 #a97b2f; display: inline-block; }
      .foot { position: absolute; left: 64px; bottom: 38px; font-family: 'VT323', monospace; color: #9c8aa2; font-size: 21px; letter-spacing: 3px; }
    </style></head><body>
      <figure class="frame"><img src="${scene}" alt="A pixel-art meadow with a freshly tilled row of ripe turnips and the farmer walking past"><figcaption>ACTUAL GAMEPLAY · NO MODELS WERE HARMED</figcaption></figure>
      <div class="copy">
        <p class="kicker">A COZY FARMING POCKET</p>
        <h1>LOFI<br>GARDEN</h1>
        <p class="blurb">Queue the work — a little farmer tends it. Rain on the roof, coins in the pouch.</p>
        <span class="cta">PLAY FREE IN BROWSER</span>
      </div>
      <p class="foot">abhijit-the-ghost.github.io/lofi-garden</p>
    </body></html>`;
    await card.setContent(html);
    await card.waitForTimeout(300);
    await card.screenshot({ path: path.join(ROOT, 'public', 'og.png') });

    await browser.close();
    console.log('wrote public/og.png');
  } finally {
    dev.kill('SIGTERM');
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
