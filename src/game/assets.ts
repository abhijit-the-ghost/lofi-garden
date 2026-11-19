import { DEED_PARCELS, TILE, BARN_W, BARN_H } from './constants';
import { hash2 } from './grid';
import { BIT_N, BIT_E, BIT_S, BIT_W } from './autotile';

export interface AssetManifest {
  grass: HTMLCanvasElement[];
  tilled: HTMLCanvasElement;
  wild: { base: HTMLCanvasElement[]; flowerPink: HTMLCanvasElement; flowerYellow: HTMLCanvasElement; rock: HTMLCanvasElement };
  sign: HTMLCanvasElement;
  farmer: Record<'idle' | 'walkA' | 'walkB' | 'tillA' | 'tillB', HTMLCanvasElement>;
  crops: Record<'turnip' | 'carrot' | 'pumpkin', [HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement, HTMLCanvasElement]>;
  paths: HTMLCanvasElement[];
  fences: HTMLCanvasElement[];
  barn: HTMLCanvasElement;
  sprinkler: HTMLCanvasElement;
  lantern: HTMLCanvasElement;
  bench: HTMLCanvasElement;
  planters: [HTMLCanvasElement, HTMLCanvasElement];
  board: HTMLCanvasElement;
  particleDirt: HTMLCanvasElement;
  particleSparkle: HTMLCanvasElement;
  particleDrop: HTMLCanvasElement;
  icons: Record<string, string>;
  coinIcon: string;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Scatter `count` 1px speckles of `colors` deterministically, avoiding the very edge. */
function speckle(
  ctx: CanvasRenderingContext2D,
  count: number,
  colors: string[],
  x0: number,
  y0: number,
  w: number,
  h: number,
  salt: number,
): void {
  for (let i = 0; i < count; i += 1) {
    const hx = hash2(i, salt, 11) % w;
    const hy = hash2(i, salt, 23) % h;
    px(ctx, x0 + hx, y0 + hy, 1, 1, colors[i % colors.length]);
  }
}

// ---------------------------------------------------------------- grass tiles

function drawGrassVariant(variant: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  px(ctx, 0, 0, TILE, TILE, '#7d9c57');
  // broad tonal patches for richness
  if (variant === 1) px(ctx, 2, 3, 5, 4, '#74955a');
  if (variant === 2) px(ctx, 9, 10, 5, 4, '#74955a');
  if (variant === 3) px(ctx, 5, 13, 6, 2, '#74955a');
  // blades: two-pixel vertical strokes
  const blade = (x: number, y: number, color: string) => {
    px(ctx, x, y, 1, 3, color);
    px(ctx, x - 1, y + 1, 1, 2, color);
  };
  if (variant === 0) {
    blade(3, 4, '#93b169');
    blade(11, 9, '#6a8748');
    blade(6, 12, '#93b169');
  } else if (variant === 1) {
    blade(12, 2, '#93b169');
    blade(4, 9, '#6a8748');
    blade(9, 13, '#93b169');
    blade(7, 6, '#87a75f');
  } else if (variant === 2) {
    blade(2, 11, '#6a8748');
    blade(10, 3, '#93b169');
    blade(13, 12, '#6a8748');
    blade(6, 5, '#87a75f');
  } else {
    // clover patch
    px(ctx, 4, 4, 2, 2, '#87b268');
    px(ctx, 10, 8, 2, 2, '#87b268');
    px(ctx, 6, 12, 2, 2, '#6a8748');
    blade(13, 3, '#93b169');
  }
  speckle(ctx, 8, ['#86a860', '#74955a', '#8fb268'], 1, 1, TILE - 2, TILE - 2, variant + 40);
  return c;
}

function drawTilled(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  px(ctx, 0, 0, TILE, TILE, '#6d4b31');
  // three mounded rows with dark furrows between
  for (const y of [2, 8, 14]) {
    px(ctx, 0, y, TILE, 1, '#7d5838');
    px(ctx, 0, y + 1, TILE, 2, '#553824');
  }
  speckle(ctx, 10, ['#553824', '#7d5838', '#654327'], 0, 0, TILE, TILE, 99);
  return c;
}

function drawWildVariant(variant: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  px(ctx, 0, 0, TILE, TILE, '#5c7347');
  if (variant % 2 === 0) px(ctx, 3, 4, 6, 5, '#52683e');
  if (variant >= 2) px(ctx, 9, 11, 5, 4, '#52683e');
  const blade = (x: number, y: number, color: string) => {
    px(ctx, x, y, 1, 3, color);
    px(ctx, x - 1, y + 1, 1, 2, color);
  };
  blade(4, 3, '#6d8457');
  blade(12, 7, '#46583a');
  blade(7, 11, '#6d8457');
  blade(2, 13, '#46583a');
  speckle(ctx, 7, ['#52683e', '#6d8457'], 1, 1, TILE - 2, TILE - 2, variant + 70);
  return c;
}

function drawWildDecor(kind: 'flowerPink' | 'flowerYellow' | 'rock'): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  px(ctx, 0, 0, TILE, TILE, '#5c7347');
  px(ctx, 3, 4, 6, 5, '#52683e');
  speckle(ctx, 6, ['#52683e', '#6d8457'], 1, 1, TILE - 2, TILE - 2, kind.length * 13);
  if (kind === 'rock') {
    px(ctx, 5, 7, 6, 4, '#7d786a');
    px(ctx, 6, 6, 4, 1, '#96917f');
    px(ctx, 6, 10, 4, 1, '#5d594e');
  } else {
    const petal = kind === 'flowerPink' ? '#c9808e' : '#d9b356';
    const cx = 8;
    const cy = 7;
    px(ctx, cx, cy, 1, 1, '#8a5a2b');
    px(ctx, cx - 1, cy - 1, 1, 1, petal);
    px(ctx, cx + 1, cy - 1, 1, 1, petal);
    px(ctx, cx - 1, cy + 1, 1, 1, petal);
    px(ctx, cx + 1, cy + 1, 1, 1, petal);
    px(ctx, cx, cy - 2, 1, 1, petal);
    px(ctx, cx, cy + 2, 1, 1, petal);
    px(ctx, cx, cy + 3, 1, 3, '#46583a'); // stem
  }
  return c;
}

// ------------------------------------------------------------------- sign

function drawSign(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  // post
  px(ctx, 7, 6, 2, 9, '#5d4126');
  px(ctx, 7, 6, 1, 9, '#6d5133');
  // plank
  px(ctx, 2, 2, 12, 6, '#8a6a44');
  px(ctx, 2, 2, 12, 1, '#a3805a');
  px(ctx, 2, 7, 12, 1, '#5d4126');
  px(ctx, 3, 4, 10, 1, '#6d5133');
  // nails
  px(ctx, 3, 3, 1, 1, '#3a2a1c');
  px(ctx, 12, 3, 1, 1, '#3a2a1c');
  return c;
}

// ----------------------------------------------------------------- farmer

/** Draw the farmer facing right. `frame` selects leg pose / hoe pose. */
function drawFarmer(frame: 'idle' | 'walkA' | 'walkB' | 'tillA' | 'tillB'): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  const cx = 8;
  const top = 1;

  // boots & legs (16 = bottom row, farmer is ~13px tall)
  const legY = 12;
  const skin = '#e0a878';
  const overall = '#46598c';
  const overallDark = '#37476f';

  if (frame === 'walkA') {
    px(ctx, cx - 3, legY, 2, 3, overallDark);
    px(ctx, cx + 1, legY - 1, 2, 4, overallDark);
    px(ctx, cx - 4, legY + 2, 3, 2, '#4a3626');
    px(ctx, cx + 1, legY + 2, 3, 2, '#4a3626');
  } else if (frame === 'walkB') {
    px(ctx, cx - 3, legY - 1, 2, 4, overallDark);
    px(ctx, cx + 1, legY, 2, 3, overallDark);
    px(ctx, cx - 4, legY + 2, 3, 2, '#4a3626');
    px(ctx, cx + 1, legY + 2, 3, 2, '#4a3626');
  } else {
    // standing legs (idle & tilling)
    px(ctx, cx - 3, legY, 2, 3, overallDark);
    px(ctx, cx + 1, legY, 2, 3, overallDark);
    px(ctx, cx - 4, legY + 2, 3, 2, '#4a3626');
    px(ctx, cx + 1, legY + 2, 3, 2, '#4a3626');
  }

  // torso: shirt + overalls
  px(ctx, cx - 4, top + 6, 8, 5, '#a5533c'); // shirt
  px(ctx, cx - 4, top + 8, 8, 3, overall); // overall bib/body
  px(ctx, cx - 1, top + 8, 2, 2, overallDark);
  px(ctx, cx - 3, top + 6, 1, 2, overall); // straps
  px(ctx, cx + 2, top + 6, 1, 2, overall);

  // head
  px(ctx, cx - 3, top + 1, 6, 5, skin);
  px(ctx, cx + 2, top + 3, 1, 1, '#3a2a1c'); // eye (facing right)
  // straw hat
  px(ctx, cx - 4, top, 8, 2, '#d9b356');
  px(ctx, cx - 5, top + 1, 10, 1, '#b3854a');
  px(ctx, cx - 2, top - 1, 4, 1, '#d9b356');

  // arm + hoe (per frame)
  if (frame === 'tillA') {
    // hoe raised
    px(ctx, cx + 3, top + 6, 2, 2, skin); // arm out
    px(ctx, cx + 4, top + 2, 1, 5, '#6d5133'); // hoe handle up
    px(ctx, cx + 3, top + 1, 3, 1, '#b9b3a4'); // hoe head
  } else if (frame === 'tillB') {
    // hoe struck downward
    px(ctx, cx + 3, top + 9, 2, 2, skin);
    px(ctx, cx + 4, top + 9, 1, 4, '#6d5133');
    px(ctx, cx + 4, top + 13, 2, 2, '#b9b3a4');
  } else {
    // arm relaxed, hoe resting on shoulder
    px(ctx, cx + 3, top + 6, 2, 4, skin);
    px(ctx, cx + 3, top + 2, 1, 5, '#6d5133');
    px(ctx, cx + 3, top + 1, 2, 1, '#b9b3a4');
  }

  return c;
}

// ------------------------------------------------------------------ crops

/** Shared s0 "freshly sown" mound for all crops. */
function drawSeedMound(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  px(ctx, 5, 11, 6, 2, '#7d5838');
  px(ctx, 6, 10, 4, 1, '#8a6242');
  px(ctx, 6, 12, 1, 1, '#2e2015');
  px(ctx, 9, 12, 1, 1, '#2e2015');
  px(ctx, 7, 11, 1, 1, '#2e2015');
  return c;
}

function leafStroke(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: string): void {
  px(ctx, x, y, 1, h, color);
  px(ctx, x - 1, y + h - 2, 1, 2, color);
  if (h >= 4) px(ctx, x + 1, y + h - 3, 1, 2, color);
}

function drawTurnip(stage: 0 | 1 | 2 | 3): HTMLCanvasElement {
  if (stage === 0) return drawSeedMound();
  const [c, ctx] = makeCanvas(TILE, TILE);
  if (stage === 1) {
    leafStroke(ctx, 7, 8, 4, '#6d8457');
    leafStroke(ctx, 9, 9, 3, '#93b169');
    return c;
  }
  if (stage === 2) {
    leafStroke(ctx, 5, 6, 6, '#52703f');
    leafStroke(ctx, 8, 4, 8, '#6d8457');
    leafStroke(ctx, 10, 6, 6, '#93b169');
    leafStroke(ctx, 6, 7, 5, '#87b268');
    return c;
  }
  // ripe — purple-shouldered white bulb half out of the soil
  const g = '#52703f';
  leafStroke(ctx, 5, 3, 7, g);
  leafStroke(ctx, 8, 1, 9, '#6d8457');
  leafStroke(ctx, 11, 3, 7, '#93b169');
  px(ctx, 5, 9, 6, 1, '#b98ac9');
  px(ctx, 4, 10, 8, 1, '#c9a3d4');
  px(ctx, 4, 11, 8, 2, '#efe8dc');
  px(ctx, 5, 13, 6, 1, '#d9cfc0');
  px(ctx, 5, 11, 2, 1, '#ffffff');
  return c;
}

function drawCarrot(stage: 0 | 1 | 2 | 3): HTMLCanvasElement {
  if (stage === 0) return drawSeedMound();
  const [c, ctx] = makeCanvas(TILE, TILE);
  if (stage === 1) {
    leafStroke(ctx, 6, 9, 3, '#52703f');
    leafStroke(ctx, 8, 8, 4, '#6d8457');
    leafStroke(ctx, 10, 9, 3, '#52703f');
    return c;
  }
  if (stage === 2) {
    leafStroke(ctx, 5, 6, 6, '#52703f');
    leafStroke(ctx, 7, 4, 8, '#6d8457');
    leafStroke(ctx, 9, 5, 7, '#87b268');
    leafStroke(ctx, 11, 6, 6, '#52703f');
    leafStroke(ctx, 6, 7, 5, '#93b169');
    return c;
  }
  // ripe — bright root shoulders above the soil, tall greens
  leafStroke(ctx, 5, 3, 7, '#52703f');
  leafStroke(ctx, 8, 1, 8, '#6d8457');
  leafStroke(ctx, 11, 3, 7, '#52703f');
  leafStroke(ctx, 7, 4, 6, '#87b268');
  px(ctx, 6, 9, 4, 1, '#e08a35');
  px(ctx, 5, 10, 6, 1, '#d97b3f');
  px(ctx, 5, 11, 6, 1, '#c9662e');
  px(ctx, 6, 12, 4, 1, '#a8542a');
  px(ctx, 7, 13, 2, 1, '#8a3f1d');
  return c;
}

function drawPumpkin(stage: 0 | 1 | 2 | 3): HTMLCanvasElement {
  if (stage === 0) return drawSeedMound();
  const [c, ctx] = makeCanvas(TILE, TILE);
  if (stage === 1) {
    px(ctx, 6, 9, 1, 3, '#52703f'); // stem
    px(ctx, 5, 8, 3, 2, '#6d8457'); // leaf
    px(ctx, 10, 9, 1, 3, '#52703f');
    px(ctx, 9, 8, 3, 2, '#87b268');
    return c;
  }
  if (stage === 2) {
    // sprawling vine with leaves and a tiny bloom
    px(ctx, 2, 12, 5, 1, '#52703f');
    px(ctx, 9, 12, 5, 1, '#52703f');
    px(ctx, 3, 10, 1, 2, '#52703f');
    px(ctx, 4, 9, 2, 2, '#6d8457');
    px(ctx, 12, 10, 1, 2, '#52703f');
    px(ctx, 11, 9, 2, 2, '#87b268');
    px(ctx, 7, 6, 1, 6, '#52703f');
    px(ctx, 6, 5, 3, 2, '#6d8457');
    px(ctx, 8, 7, 1, 1, '#e7c46a'); // bloom
    return c;
  }
  // ripe — big ribbed pumpkin
  px(ctx, 7, 4, 2, 2, '#4a5d2f'); // stem
  px(ctx, 5, 6, 6, 1, '#d97b2e');
  px(ctx, 3, 7, 10, 2, '#e08a35');
  px(ctx, 2, 9, 12, 3, '#d97b2e');
  px(ctx, 3, 12, 10, 1, '#b8552a');
  px(ctx, 5, 13, 6, 1, '#96421f');
  px(ctx, 5, 7, 1, 6, '#a8542a'); // ribs
  px(ctx, 8, 6, 1, 7, '#a8542a');
  px(ctx, 11, 7, 1, 6, '#a8542a');
  px(ctx, 4, 8, 2, 1, '#f0a050'); // highlight
  return c;
}

  // ------------------------------------------------------------- structures

/** One working sprinkler — low brass post with a gentle T-head mid-spray. */
function drawSprinkler(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  // base & post
  px(ctx, 5, 13, 6, 2, '#5d4126');
  px(ctx, 7, 8, 2, 6, '#8a6a44');
  px(ctx, 7, 8, 1, 6, '#a3805a');
  // brass T head
  px(ctx, 4, 6, 8, 2, '#d9b356');
  px(ctx, 4, 7, 8, 1, '#b3854a');
  px(ctx, 6, 4, 4, 2, '#c9a24b');
  // permanent mid-spray arc pixels
  px(ctx, 2, 3, 1, 1, '#a9cdea');
  px(ctx, 13, 3, 1, 1, '#a9cdea');
  px(ctx, 1, 5, 1, 1, '#6f9fd4');
  px(ctx, 14, 5, 1, 1, '#6f9fd4');
  return c;
}

/** Stone lantern — cool stone, warm heart. */
function drawLantern(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  // base
  px(ctx, 4, 12, 8, 3, '#8a8578');
  px(ctx, 3, 13, 10, 2, '#7d786a');
  // post
  px(ctx, 6, 7, 4, 6, '#96917f');
  px(ctx, 6, 7, 1, 6, '#a9a493');
  // cap roof
  px(ctx, 3, 4, 10, 2, '#6d6960');
  px(ctx, 5, 2, 6, 2, '#7d786a');
  px(ctx, 7, 0, 2, 2, '#8a8578');
  // glowing window
  px(ctx, 5, 7, 6, 2, '#ffb45e');
  px(ctx, 7, 6, 2, 3, '#ffd98a');
  return c;
}

/** Garden bench — two planks and a friendly cushion. */
function drawBench(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  // legs
  px(ctx, 3, 9, 2, 6, '#4a3421');
  px(ctx, 11, 9, 2, 6, '#4a3421');
  // seat planks
  px(ctx, 1, 7, 14, 2, '#7d5530');
  px(ctx, 1, 7, 14, 1, '#a3805a');
  px(ctx, 1, 8, 14, 1, '#553824');
  // backrest
  px(ctx, 2, 2, 2, 5, '#6d5133');
  px(ctx, 12, 2, 2, 5, '#6d5133');
  px(ctx, 2, 2, 12, 2, '#7d5530');
  px(ctx, 2, 2, 12, 1, '#a3805a');
  // cushion
  px(ctx, 4, 5, 8, 2, '#c96f5a');
  px(ctx, 4, 5, 8, 1, '#e08a75');
  return c;
}

/** Flower planter (two palettes — the farm stays colorful). */
function drawPlanter(variant: 0 | 1): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  // wooden box
  px(ctx, 2, 9, 12, 5, '#6d5133');
  px(ctx, 2, 9, 12, 1, '#8a6a44');
  px(ctx, 2, 13, 12, 1, '#3a2a1c');
  px(ctx, 3, 11, 10, 1, '#553824');
  // soil + sprouts
  px(ctx, 3, 8, 10, 1, '#3a2a1c');
  const petals = variant === 0 ? ['#c9808e', '#e7c46a', '#c9808e'] : ['#a8c6e8', '#c9808e', '#a8c6e8'];
  const greens = ['#52703f', '#6d8457'];
  const stems = [4, 8, 12];
  for (let i = 0; i < stems.length; i += 1) {
    px(ctx, stems[i], 5 + i, 1, 4, greens[i % 2]);
    px(ctx, stems[i] - 1, 4 + i, 3, 1, petals[i]);
    px(ctx, stems[i], 3 + i, 1, 1, petals[i]);
  }
  return c;
}

/** The mayor's notice board — a plank, a post, a parchment. */
function drawBoard(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  // post
  px(ctx, 7, 7, 2, 8, '#5d4126');
  px(ctx, 7, 7, 1, 8, '#6d5133');
  // board plank
  px(ctx, 1, 1, 14, 8, '#8a6a44');
  px(ctx, 1, 1, 14, 1, '#a3805a');
  px(ctx, 1, 8, 14, 1, '#553824');
  // the parchment with its two polite lines
  px(ctx, 3, 3, 10, 4, '#f2e3c6');
  px(ctx, 4, 4, 8, 1, '#a3805a');
  px(ctx, 5, 6, 6, 1, '#a3805a');
  // pin dot
  px(ctx, 8, 2, 1, 1, '#c96f5a');
  return c;
}

/** Packed-earth path, one of 16 bitmask variants. Sits on grass — arms reach the edges for smooth joins. */
function drawPathVariant(mask: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  const mid = '#8a6242';
  const lite = '#a3805a';
  const dark = '#5d4126';
  // center blob — rounded-ish octagon
  px(ctx, 3, 4, 10, 8, mid);
  px(ctx, 4, 3, 8, 10, mid);
  // arms toward connected neighbours
  if (mask & BIT_N) px(ctx, 5, 0, 6, 4, mid);
  if (mask & BIT_E) px(ctx, 12, 5, 4, 6, mid);
  if (mask & BIT_S) px(ctx, 5, 12, 6, 4, mid);
  if (mask & BIT_W) px(ctx, 0, 5, 4, 6, mid);
  // pebble texture, unique per variant for organic feel
  speckle(ctx, 14, [lite, dark, '#97744e'], 0, 0, TILE, TILE, 500 + mask);
  // a couple of bigger stones
  px(ctx, 4 + (mask * 7) % 8, 4 + (mask * 5) % 8, 2, 2, lite);
  px(ctx, 5 + (mask * 11) % 7, 9 + (mask * 3) % 4, 1, 1, dark);
  return c;
}

/** Wooden fence, one of 16 bitmask variants. Transparent — the grass shows through. */
function drawFenceVariant(mask: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(TILE, TILE);
  const post = '#6d5133';
  const lite = '#8a5f3d';
  const rail = '#7d5530';
  const shadow = '#4a3421';
  // rails (behind the post)
  if (mask & BIT_N) {
    px(ctx, 5, 0, 2, 9, rail);
    px(ctx, 9, 0, 2, 9, rail);
    px(ctx, 5, 0, 1, 9, lite);
  }
  if (mask & BIT_S) {
    px(ctx, 5, 7, 2, 9, rail);
    px(ctx, 9, 7, 2, 9, rail);
    px(ctx, 5, 7, 1, 9, lite);
  }
  if (mask & BIT_E) {
    px(ctx, 7, 5, 9, 2, rail);
    px(ctx, 7, 6, 9, 1, shadow);
    px(ctx, 7, 10, 9, 2, rail);
    px(ctx, 7, 11, 9, 1, shadow);
  }
  if (mask & BIT_W) {
    px(ctx, 0, 5, 9, 2, rail);
    px(ctx, 0, 6, 9, 1, shadow);
    px(ctx, 0, 10, 9, 2, rail);
    px(ctx, 0, 11, 9, 1, shadow);
  }
  // contact shadow at the base
  px(ctx, 3, 14, 10, 1, shadow);
  // the post, on top of everything
  px(ctx, 6, 3, 4, 12, post);
  px(ctx, 6, 3, 1, 12, lite);
  px(ctx, 9, 3, 1, 12, shadow);
  // pointed cap
  px(ctx, 7, 1, 2, 2, post);
  px(ctx, 6, 2, 4, 1, post);
  px(ctx, 7, 0, 2, 1, lite);
  return c;
}

/** The centerpiece. 64×48 — four tiles wide, three tall. */
function drawBarn(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(BARN_W * TILE, BARN_H * TILE);
  const wall = '#a8542a';
  const wallDark = '#8a3f1d';
  const trim = '#e8dcc0';
  const roof = '#4a3428';
  const roofLite = '#54402e';
  const frame = '#33241a';
  const brace = '#6d5133';
  const glow = '#e7c46a';

  // foundation
  px(ctx, 0, 44, 64, 4, '#57402c');
  // walls
  px(ctx, 2, 13, 60, 32, wall);
  // plank seams
  for (const y of [19, 25, 31, 37]) px(ctx, 2, y, 60, 1, wallDark);
  // corner shading
  px(ctx, 2, 13, 2, 32, wallDark);
  px(ctx, 60, 13, 2, 32, wallDark);
  // gambrel roof — stepped, three slopes
  px(ctx, 26, 0, 12, 3, roofLite);          // ridge
  px(ctx, 19, 3, 26, 3, roof);              // upper slope
  px(ctx, 11, 6, 42, 3, roofLite);          // mid slope
  px(ctx, 4, 9, 56, 4, roof);               // eave
  px(ctx, 4, 12, 56, 1, '#3a2a20');         // eave shadow
  px(ctx, 4, 9, 56, 1, '#6d5133');          // eave highlight
  // loft door + round hay-glow window
  px(ctx, 27, 4, 10, 6, frame);
  px(ctx, 29, 6, 6, 3, '#57402c');
  px(ctx, 30, 4, 4, 1, brace);
  // big sliding door
  px(ctx, 24, 26, 16, 19, frame);
  px(ctx, 29, 26, 1, 19, '#241a12');
  px(ctx, 34, 26, 1, 19, '#241a12');
  // Z brace on the door
  px(ctx, 24, 28, 16, 2, brace);
  px(ctx, 24, 41, 16, 2, brace);
  for (let i = 0; i < 15; i += 1) {
    px(ctx, 24 + i, 30 + Math.floor(i * 0.75), 1, 2, brace);
  }
  // left window, warm light inside
  px(ctx, 9, 24, 9, 8, frame);
  px(ctx, 10, 25, 7, 6, glow);
  px(ctx, 13, 25, 1, 6, frame);
  px(ctx, 10, 27, 7, 1, frame);
  // right window, dark
  px(ctx, 46, 24, 9, 8, frame);
  px(ctx, 47, 25, 7, 6, '#241a30');
  px(ctx, 50, 25, 1, 6, frame);
  px(ctx, 47, 27, 7, 1, frame);
  // hay bale by the door
  px(ctx, 42, 38, 9, 7, '#c9a24b');
  px(ctx, 42, 40, 9, 1, '#a3805a');
  px(ctx, 42, 43, 9, 1, '#a3805a');
  px(ctx, 45, 38, 1, 7, '#a3805a');
  // trim line under the eave
  px(ctx, 2, 14, 60, 1, trim);
  return c;
}

// -------------------------------------------------------------- particles

function drawParticleDirt(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(4, 4);
  px(ctx, 1, 1, 2, 2, '#553824');
  px(ctx, 1, 0, 1, 1, '#7d5838');
  return c;
}

function drawParticleSparkle(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(5, 5);
  px(ctx, 2, 0, 1, 5, '#ffe9a3');
  px(ctx, 0, 2, 5, 1, '#ffe9a3');
  px(ctx, 2, 2, 1, 1, '#fff7d6');
  return c;
}

function drawParticleDrop(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(4, 4);
  px(ctx, 1, 0, 2, 1, '#a9cdea');
  px(ctx, 0, 1, 4, 2, '#6f9fd4');
  px(ctx, 1, 3, 2, 1, '#4a76a8');
  return c;
}

// -------------------------------------------------------------------- icons

type IconPainter = (ctx: CanvasRenderingContext2D) => void;

const ICON_PAINTERS: Record<string, IconPainter> = {
  inspect: (ctx) => {
    px(ctx, 2, 2, 7, 7, '#f5e9d0');
    px(ctx, 3, 3, 5, 5, '#8fb6c9');
    px(ctx, 4, 4, 3, 3, '#c9e4ec');
    px(ctx, 9, 9, 5, 2, '#e8dcc0');
    px(ctx, 10, 10, 4, 2, '#a3805a');
  },
  till: (ctx) => {
    // diagonal hoe
    px(ctx, 3, 11, 2, 3, '#6d5133');
    px(ctx, 5, 8, 2, 3, '#6d5133');
    px(ctx, 7, 5, 2, 3, '#6d5133');
    px(ctx, 9, 2, 3, 2, '#6d5133');
    px(ctx, 10, 1, 4, 2, '#b9b3a4');
    px(ctx, 12, 3, 2, 2, '#b9b3a4');
    px(ctx, 1, 12, 3, 2, '#553824');
  },
  water: (ctx) => {
    px(ctx, 6, 1, 4, 2, '#6f9fd4');
    px(ctx, 4, 3, 8, 2, '#6f9fd4');
    px(ctx, 3, 5, 10, 4, '#5a8ac0');
    px(ctx, 3, 9, 10, 2, '#4a76a8');
    px(ctx, 5, 11, 6, 2, '#3a6290');
    px(ctx, 5, 4, 2, 3, '#a9cdea');
  },
  harvest: (ctx) => {
    px(ctx, 3, 6, 10, 6, '#a3703f');
    px(ctx, 3, 6, 10, 1, '#c8965c');
    px(ctx, 2, 8, 1, 3, '#7d5530');
    px(ctx, 13, 8, 1, 3, '#7d5530');
    px(ctx, 6, 9, 1, 2, '#7d5530');
    px(ctx, 9, 9, 1, 2, '#7d5530');
  },
  seeds: (ctx) => {
    px(ctx, 5, 2, 6, 2, '#7d5530');
    px(ctx, 4, 4, 8, 3, '#a3703f');
    px(ctx, 3, 7, 10, 6, '#8a5a2b');
    px(ctx, 5, 8, 1, 1, '#d9b356');
    px(ctx, 8, 10, 1, 1, '#d9b356');
    px(ctx, 10, 8, 1, 1, '#d9b356');
  },
  build: (ctx) => {
    px(ctx, 2, 10, 3, 4, '#6d5133');
    px(ctx, 5, 7, 3, 3, '#6d5133');
    px(ctx, 8, 4, 3, 3, '#6d5133');
    px(ctx, 9, 1, 5, 4, '#b9b3a4');
    px(ctx, 9, 4, 2, 2, '#8f8a7d');
  },
  clear: (ctx) => {
    px(ctx, 3, 3, 3, 3, '#c96f5a');
    px(ctx, 11, 3, 3, 3, '#c96f5a');
    px(ctx, 6, 6, 4, 4, '#c96f5a');
    px(ctx, 11, 10, 3, 3, '#c96f5a');
    px(ctx, 2, 10, 3, 3, '#c96f5a');
  },
  turnip: (ctx) => {
    px(ctx, 7, 2, 1, 3, '#6d8457');
    px(ctx, 5, 3, 1, 2, '#52703f');
    px(ctx, 10, 3, 1, 2, '#52703f');
    px(ctx, 5, 7, 6, 1, '#b98ac9');
    px(ctx, 4, 8, 8, 1, '#c9a3d4');
    px(ctx, 4, 9, 8, 3, '#efe8dc');
    px(ctx, 5, 12, 6, 1, '#d9cfc0');
  },
  carrot: (ctx) => {
    px(ctx, 7, 2, 1, 3, '#52703f');
    px(ctx, 5, 3, 1, 2, '#6d8457');
    px(ctx, 10, 3, 1, 2, '#6d8457');
    px(ctx, 6, 6, 4, 2, '#e08a35');
    px(ctx, 5, 8, 6, 2, '#d97b3f');
    px(ctx, 6, 10, 4, 2, '#c9662e');
    px(ctx, 7, 12, 2, 2, '#a8542a');
  },
  pumpkin: (ctx) => {
    px(ctx, 7, 2, 2, 2, '#4a5d2f');
    px(ctx, 5, 4, 6, 1, '#d97b2e');
    px(ctx, 3, 5, 10, 2, '#e08a35');
    px(ctx, 2, 7, 12, 4, '#d97b2e');
    px(ctx, 4, 11, 8, 1, '#b8552a');
    px(ctx, 5, 5, 1, 6, '#a8542a');
    px(ctx, 8, 4, 1, 7, '#a8542a');
    px(ctx, 11, 5, 1, 6, '#a8542a');
  },
  path: (ctx) => {
    px(ctx, 2, 3, 5, 3, '#8a8578');
    px(ctx, 3, 2, 3, 1, '#96917f');
    px(ctx, 8, 7, 5, 3, '#7d786a');
    px(ctx, 9, 6, 3, 1, '#8a8578');
    px(ctx, 3, 11, 5, 3, '#6d6960');
    px(ctx, 10, 12, 4, 2, '#7d786a');
  },
  sprinkler: (ctx) => {
    px(ctx, 7, 7, 2, 5, '#8a6a44');
    px(ctx, 5, 6, 6, 2, '#d9b356');
    px(ctx, 6, 5, 4, 1, '#c9a24b');
    px(ctx, 3, 2, 1, 1, '#a9cdea');
    px(ctx, 12, 2, 1, 1, '#a9cdea');
    px(ctx, 1, 4, 1, 2, '#6f9fd4');
    px(ctx, 14, 4, 1, 2, '#6f9fd4');
    px(ctx, 5, 12, 6, 2, '#5d4126');
  },
  lantern: (ctx) => {
    px(ctx, 4, 12, 8, 2, '#8a8578');
    px(ctx, 6, 6, 4, 6, '#96917f');
    px(ctx, 3, 4, 10, 2, '#6d6960');
    px(ctx, 5, 2, 6, 2, '#7d786a');
    px(ctx, 7, 0, 2, 2, '#8a8578');
    px(ctx, 5, 6, 6, 2, '#ffb45e');
    px(ctx, 7, 5, 2, 3, '#ffd98a');
  },
  planter: (ctx) => {
    px(ctx, 2, 9, 12, 5, '#6d5133');
    px(ctx, 2, 9, 12, 1, '#8a6a44');
    px(ctx, 4, 5, 1, 4, '#52703f');
    px(ctx, 8, 4, 1, 5, '#6d8457');
    px(ctx, 12, 5, 1, 4, '#52703f');
    px(ctx, 3, 3, 3, 2, '#c9808e');
    px(ctx, 7, 2, 3, 2, '#e7c46a');
    px(ctx, 11, 3, 3, 2, '#a8c6e8');
  },
  bench: (ctx) => {
    px(ctx, 3, 10, 2, 4, '#4a3421');
    px(ctx, 11, 10, 2, 4, '#4a3421');
    px(ctx, 2, 8, 12, 2, '#7d5530');
    px(ctx, 2, 8, 12, 1, '#a3805a');
    px(ctx, 2, 3, 2, 5, '#6d5133');
    px(ctx, 12, 3, 2, 5, '#6d5133');
    px(ctx, 2, 3, 12, 2, '#7d5530');
    px(ctx, 4, 6, 8, 2, '#c96f5a');
  },
  fence: (ctx) => {
    px(ctx, 2, 3, 2, 10, '#6d5133');
    px(ctx, 12, 3, 2, 10, '#6d5133');
    px(ctx, 2, 5, 12, 2, '#7d5530');
    px(ctx, 2, 9, 12, 2, '#7d5530');
    px(ctx, 3, 2, 1, 1, '#8a5f3d');
    px(ctx, 13, 2, 1, 1, '#8a5f3d');
  },
  barn: (ctx) => {
    px(ctx, 3, 7, 10, 6, '#a8542a');
    px(ctx, 5, 4, 6, 2, '#a8542a');
    px(ctx, 2, 8, 12, 1, '#8a3f1d');
    px(ctx, 4, 4, 8, 2, '#4a3428');
    px(ctx, 6, 3, 4, 1, '#54402e');
    px(ctx, 6, 9, 4, 4, '#33241a');
    px(ctx, 10, 8, 2, 2, '#e7c46a');
  },
};

function drawIcons(): Record<string, string> {
  const icons: Record<string, string> = {};
  for (const [name, paint] of Object.entries(ICON_PAINTERS)) {
    const [c, ctx] = makeCanvas(TILE, TILE);
    paint(ctx);
    icons[name] = c.toDataURL();
  }
  return icons;
}

function drawCoin(): string {
  const [c, ctx] = makeCanvas(12, 12);
  // rough circle via stepped rows
  px(ctx, 3, 0, 6, 1, '#b3854a');
  px(ctx, 1, 2, 10, 1, '#b3854a');
  px(ctx, 0, 4, 12, 4, '#e7c46a');
  px(ctx, 1, 8, 10, 1, '#b3854a');
  px(ctx, 3, 10, 6, 1, '#b3854a');
  px(ctx, 1, 3, 10, 6, '#e7c46a');
  px(ctx, 3, 2, 6, 8, '#e7c46a');
  px(ctx, 2, 4, 2, 4, '#f7e19a'); // highlight
  px(ctx, 6, 3, 2, 6, '#c8965c'); // inner mark
  return c.toDataURL();
}

export function buildAssets(): AssetManifest {
  const wildBase = [drawWildVariant(0), drawWildVariant(1), drawWildVariant(2), drawWildVariant(3)];
  return {
    grass: [drawGrassVariant(0), drawGrassVariant(1), drawGrassVariant(2), drawGrassVariant(3)],
    tilled: drawTilled(),
    wild: {
      base: wildBase,
      flowerPink: drawWildDecor('flowerPink'),
      flowerYellow: drawWildDecor('flowerYellow'),
      rock: drawWildDecor('rock'),
    },
    sign: drawSign(),
    farmer: {
      idle: drawFarmer('idle'),
      walkA: drawFarmer('walkA'),
      walkB: drawFarmer('walkB'),
      tillA: drawFarmer('tillA'),
      tillB: drawFarmer('tillB'),
    },
    crops: {
      turnip: [drawTurnip(0), drawTurnip(1), drawTurnip(2), drawTurnip(3)],
      carrot: [drawCarrot(0), drawCarrot(1), drawCarrot(2), drawCarrot(3)],
      pumpkin: [drawPumpkin(0), drawPumpkin(1), drawPumpkin(2), drawPumpkin(3)],
    },
    paths: Array.from({ length: 16 }, (_, mask) => drawPathVariant(mask)),
    fences: Array.from({ length: 16 }, (_, mask) => drawFenceVariant(mask)),
    barn: drawBarn(),
    sprinkler: drawSprinkler(),
    lantern: drawLantern(),
    bench: drawBench(),
    planters: [drawPlanter(0), drawPlanter(1)],
    board: drawBoard(),
    particleDirt: drawParticleDirt(),
    particleSparkle: drawParticleSparkle(),
    particleDrop: drawParticleDrop(),
    icons: drawIcons(),
    coinIcon: drawCoin(),
  };
}

export { DEED_PARCELS };
