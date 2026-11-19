import { Camera } from './camera';
import {
  BARN_H,
  BARN_QUEUE_BONUS,
  BARN_W,
  BUILD_COSTS,
  DEED_PARCELS,
  ORDER_BOARD,
  QUEUE_CAP,
  RAIN_MAX_DURATION,
  RAIN_MAX_GAP,
  RAIN_MIN_DURATION,
  RAIN_MIN_GAP,
  SPRINKLER_INTERVAL,
  SPRINKLER_RADIUS,
  STARTER_COINS,
  TILE,
  WORLD_H,
  WORLD_W,
  type BuildableId,
  type ParcelId,
} from './constants';
import { TileGrid } from './grid';
import { Farmer, type FarmerWorld } from './farmer';
import { TaskQueue, type Task } from './tasks';
import { Particles } from './particles';
import { CROPS, WELCOME_ORDER, generateOrder, isMature, progressPct, stageName, type CropId, type OrdersState } from './crops';
import { checkDeedPurchase } from './deeds';
import { VIEW_H, VIEW_W } from './constants';
import { nightFactorAt } from './lighting';
import { sfx } from '../audio/sfx';

export type ToolId = 'inspect' | 'till' | 'water' | 'harvest' | 'seeds' | 'build' | 'clear';

export interface PinnedInfo {
  title: string;
  lines: string[];
}

export interface SignPost {
  x: number;
  y: number;
  parcel: ParcelId;
  name: string;
  price: number;
}

export interface Barn {
  id: number;
  x: number;
  y: number;
}

export interface WorldEvents {
  /** Called when any UI-visible state changes (queue, coins, pin, toast, tool). */
  onUiDirty(): void;
}

/** Floating combat-text style label that rises and fades (e.g. "+9c"). */
export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

/** Daylight drifting petal — purely ambient, no gameplay. */
export interface Petal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  life: number;
}

/** Night-time firefly — wanders on a lissajous drift, blinks, recycles. */
export interface Firefly {
  x: number;
  y: number;
  phase: number;
  life: number;
}

/** One diagonal rain streak — spawn high, fall fast. */
export interface RainStreak {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

/** Brief splash ping where a streak lands. */
export interface RainSplash {
  x: number;
  y: number;
  life: number;
}

export interface Sprinkler {
  x: number;
  y: number;
  timer: number;
}

const MOIST_FULL = 0.98;

export class World implements FarmerWorld {
  readonly grid = new TileGrid();
  readonly camera = new Camera();
  readonly queue = new TaskQueue(QUEUE_CAP);
  readonly particles = new Particles();
  readonly farmer = new Farmer();
  readonly keys = new Set<string>();
  readonly signs: SignPost[];
  readonly floaters: Floater[] = [];

  tool: ToolId = 'till';
  coins = STARTER_COINS;
  selectedSeed: CropId = 'turnip';
  seedsOpen = false;
  selectedBuild: BuildableId = 'path';
  buildOpen = false;
  /** Purchased deed parcels (starter is always unlocked and never listed here). */
  readonly ownedDeeds = new Set<ParcelId>();
  readonly barns: Barn[] = [];
  private nextBarnId = 1;
  /** Non-null while the "tear down the barn?" dialog is up. */
  barnConfirm: { x: number; y: number } | null = null;

  hover: { x: number; y: number } | null = null;
  pinnedTile: { x: number; y: number } | null = null;
  toastText: string | null = null;
  toastUntil = 0;
  elapsed = 0;
  /** Freeze the world at honeyed late afternoon forever. */
  goldenHour = false;
  readonly petals: Petal[] = [];
  readonly fireflies: Firefly[] = [];
  private petalTimer = 0;
  private fireflyTimer = 0;
  /** Independent sprinkler heads — each ticks its own 30s timer from a random phase. */
  readonly sprinklers: Sprinkler[] = [];
  /** Rain state — silent bookkeeping, no forecast. */
  rain = { remaining: 0, untilNext: 28 + Math.random() * 40 };
  readonly rainStreaks: RainStreak[] = [];
  readonly splashes: RainSplash[] = [];
  private streakAcc = 0;
  /** The mayor's board on the south edge of the starter plot. */
  readonly orders: OrdersState = { active: { ...WELCOME_ORDER }, completed: 0 };
  orderFresh = true; // a fresh farm opens with the mayor's first hello
  orderCardOpen = false;
  /** Lifetime tallies — saved, shown in settings. */
  readonly stats = { harvested: 0, earned: 0 };

  constructor(private events: WorldEvents) {
    this.camera.centerOn((WORLD_W / 2) * TILE, (WORLD_H / 2) * TILE);
    this.signs = DEED_PARCELS.map((d) => ({
      x: d.signX,
      y: d.signY,
      parcel: d.id,
      name: d.name,
      price: d.price,
    }));
    this.grid.placeBoard(ORDER_BOARD.x, ORDER_BOARD.y);
  }

  boardAt(x: number, y: number): boolean {
    return x === ORDER_BOARD.x && y === ORDER_BOARD.y;
  }

  isRaining(): boolean {
    return this.rain.remaining > 0;
  }

  /** Deterministic ignition for tests & future debug hotkeys. */
  triggerRain(durationSeconds = 30): void {
    if (this.rain.remaining <= 0) sfx.rainStart();
    this.rain.remaining = durationSeconds;
  }

  onUiDirty = (): void => this.events.onUiDirty();

  currentQueueCap(): number {
    return QUEUE_CAP + BARN_QUEUE_BONUS * this.barns.length;
  }

  /** Counter for barn ids — exposed so the save file can round-trip it. */
  get barnIdCounter(): number {
    return this.nextBarnId;
  }

  /** Restore saved barns verbatim (tiles, caps, id counter). */
  restoreBarns(barns: Barn[], nextBarnId: number): void {
    this.barns.push(...barns);
    this.nextBarnId = Math.max(1, nextBarnId);
    this.syncQueueCap();
  }

  private syncQueueCap(): void {
    this.queue.setCapacity(this.currentQueueCap());
  }

  // ------------------------------------------------------------ time & update

  update(dt: number): void {
    this.elapsed += dt;
    this.camera.update(dt, this.keys);
    this.grid.updateCrops(dt);
    this.farmer.update(this, dt);
    this.particles.update(dt);
    this.updateRain(dt);
    this.updateSprinklers(dt);
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y -= 14 * dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
    this.spawnAmbient(dt);
    if (this.toastText && this.elapsed >= this.toastUntil) {
      this.toastText = null;
      this.events.onUiDirty();
    }
  }

  // ------------------------------------------------------------------ rain

  private updateRain(dt: number): void {
    const wasRaining = this.isRaining();

    if (wasRaining) {
      this.rain.remaining -= dt;
      if (this.rain.remaining <= 0) {
        this.rain.remaining = 0;
        this.rain.untilNext = RAIN_MIN_GAP + Math.random() * (RAIN_MAX_GAP - RAIN_MIN_GAP);
        sfx.rainStop();
      }
      // every owned tilled tile drinks its fill, forever, until the sky clears
      for (const tile of this.grid.tiles) {
        if (tile.tilled && tile.moisture < 1) tile.moisture = 1;
      }
      this.spawnStreaks(dt);
    } else {
      this.rain.untilNext -= dt;
      if (this.rain.untilNext <= 0) {
        this.rain.remaining = RAIN_MIN_DURATION + Math.random() * (RAIN_MAX_DURATION - RAIN_MIN_DURATION);
        sfx.rainStart();
      }
    }

    // retire streaks & splashes
    for (let i = this.rainStreaks.length - 1; i >= 0; i -= 1) {
      const s = this.rainStreaks[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life <= 0 || s.y > this.camera.y + 290) {
        if (s.y < this.camera.y + 280 && Math.random() < 0.45 && this.splashes.length < 48) {
          this.splashes.push({ x: s.x, y: Math.min(s.y, this.camera.y + 268), life: 0.28 });
        }
        this.rainStreaks.splice(i, 1);
      }
    }
    for (let i = this.splashes.length - 1; i >= 0; i -= 1) {
      this.splashes[i].life -= dt;
      if (this.splashes[i].life <= 0) this.splashes.splice(i, 1);
    }
  }

  private spawnStreaks(dt: number): void {
    // ~150 streaks a second across the viewport — cozy, never blinding
    this.streakAcc += dt * 150;
    while (this.streakAcc >= 1 && this.rainStreaks.length < 170) {
      this.streakAcc -= 1;
      this.rainStreaks.push({
        x: this.camera.x - 40 + Math.random() * (VIEW_W + 80),
        y: this.camera.y - 30 - Math.random() * 40,
        vx: 26 + Math.random() * 18,
        vy: 400 + Math.random() * 90,
        life: 0.9,
      });
    }
  }

  // ------------------------------------------------------------- sprinklers

  private updateSprinklers(dt: number): void {
    for (const s of this.sprinklers) {
      s.timer += dt;
      if (s.timer < SPRINKLER_INTERVAL) continue;
      s.timer = 0;
      this.spray(s);
    }
  }

  private spray(s: Sprinkler): void {
    const cx = s.x * TILE + TILE / 2;
    const cy = s.y * TILE + TILE / 2;
    for (let dy = -SPRINKLER_RADIUS; dy <= SPRINKLER_RADIUS; dy += 1) {
      for (let dx = -SPRINKLER_RADIUS; dx <= SPRINKLER_RADIUS; dx += 1) {
        const t = this.grid.at(s.x + dx, s.y + dy);
        if (!t || !t.tilled || !this.grid.isUnlocked(t.parcel)) continue;
        t.moisture = 1;
        this.particles.burst('drop', s.x * TILE + dx * TILE + TILE / 2, s.y * TILE + dy * TILE + TILE / 2, 2);
      }
    }
    this.particles.burst('drop', cx, cy - 2, 9);
    sfx.sprinkler();
  }

  /** Rebuild the sprinkler roster from the grid after a load. */
  restoreSprinklers(): void {
    this.sprinklers.length = 0;
    for (let y = 0; y < WORLD_H; y += 1) {
      for (let x = 0; x < WORLD_W; x += 1) {
        if (this.grid.at(x, y)?.structure === 'sprinkler') {
          this.sprinklers.push({ x, y, timer: Math.random() * SPRINKLER_INTERVAL });
        }
      }
    }
  }

  private removeSprinklerAt(x: number, y: number): void {
    const i = this.sprinklers.findIndex((s) => s.x === x && s.y === y);
    if (i !== -1) this.sprinklers.splice(i, 1);
  }

  // ---------------------------------------------------------------- orders

  /** Rebuild or invent the mayor's board after a load. */
  restoreOrders(state: OrdersState): void {
    this.orders.completed = Math.max(0, Math.floor(state.completed));
    this.orders.active = state.active ? { ...state.active } : null;
    if (!this.orders.active) {
      this.orders.active = { ...WELCOME_ORDER };
      this.orderFresh = true;
    }
  }

  toggleOrderCard(): void {
    this.orderCardOpen = !this.orderCardOpen;
    if (this.orderCardOpen) this.orderFresh = false;
    sfx.ui();
    this.events.onUiDirty();
  }

  closeOrderCard(): void {
    if (!this.orderCardOpen) return;
    this.orderCardOpen = false;
    sfx.ui();
    this.events.onUiDirty();
  }

  // --------------------------------------------------------------- ui helpers

  toast(text: string, seconds = 2.6): void {
    this.toastText = text;
    this.toastUntil = this.elapsed + seconds;
    this.events.onUiDirty();
  }

  setTool(tool: ToolId): void {
    const changed = this.tool !== tool;
    this.tool = tool;
    if (tool !== 'seeds') this.seedsOpen = false;
    if (tool !== 'build') this.buildOpen = false;
    if (changed) this.events.onUiDirty();
  }

  toggleSeeds(): void {
    if (this.tool === 'seeds') {
      this.seedsOpen = !this.seedsOpen;
    } else {
      this.tool = 'seeds';
      this.seedsOpen = true;
      this.buildOpen = false;
    }
    this.events.onUiDirty();
  }

  toggleBuild(): void {
    if (this.tool === 'build') {
      this.buildOpen = !this.buildOpen;
    } else {
      this.tool = 'build';
      this.buildOpen = true;
      this.seedsOpen = false;
    }
    this.events.onUiDirty();
  }

  closePopups(): void {
    if (!this.seedsOpen && !this.buildOpen) return;
    this.seedsOpen = false;
    this.buildOpen = false;
    this.events.onUiDirty();
  }

  closeSeeds(): void {
    this.closePopups();
  }

  selectSeed(crop: CropId): void {
    this.selectedSeed = crop;
    this.tool = 'seeds';
    this.seedsOpen = false;
    this.events.onUiDirty();
  }

  selectBuild(build: BuildableId): void {
    this.selectedBuild = build;
    this.tool = 'build';
    this.buildOpen = false;
    this.events.onUiDirty();
  }

  signAt(x: number, y: number): SignPost | undefined {
    return this.signs.find((s) => s.x === x && s.y === y);
  }

  private signNear(x: number, y: number): boolean {
    return this.signs.some((s) => s.x === x && s.y === y);
  }

  hoverValid(): boolean {
    if (!this.hover) return false;
    const { x, y } = this.hover;
    switch (this.tool) {
      case 'till':
        return this.grid.canTill(x, y) && !this.queue.hasAt(x, y, 'till');
      case 'water':
        return this.grid.canWater(x, y) && !this.queue.hasAt(x, y, 'water');
      case 'harvest':
        return this.grid.canHarvest(x, y) && !this.queue.hasAt(x, y, 'harvest');
      case 'seeds':
        return (
          this.grid.canPlant(x, y) &&
          !this.queue.hasAt(x, y, 'plant') &&
          this.coins >= CROPS[this.selectedSeed].seedCost
        );
      case 'build':
        return this.buildCandidateValid(x, y);
      case 'clear': {
        const tile = this.grid.at(x, y);
        return tile !== null && tile.structure !== undefined;
      }
      default:
        return true; // inspect doesn't block the cursor
    }
  }

  /** True when the selected buildable can go on (x, y) right now. */
  buildCandidateValid(x: number, y: number): boolean {
    if (this.signNear(x, y)) return false;
    const cost = BUILD_COSTS[this.selectedBuild];
    if (this.coins < cost) return false;
    if (!this.grid.inBounds(x, y)) return false;
    if (this.queue.hasAt(x, y, 'build')) return false;
    if (this.selectedBuild === 'barn') {
      return this.grid.canPlaceBarn(x, y, BARN_W, BARN_H) && !this.barnSignCollision(x, y);
    }
    return this.grid.canBuildStructure(x, y);
  }

  private barnSignCollision(ax: number, ay: number): boolean {
    for (let dy = 0; dy < BARN_H; dy += 1) {
      for (let dx = 0; dx < BARN_W; dx += 1) {
        if (this.signNear(ax + dx, ay + dy)) return true;
      }
    }
    return false;
  }

  /** Footprint tiles for the current build ghost (cheap for renderer). */
  buildGhostTiles(): { x: number; y: number }[] {
    if (!this.hover) return [];
    const { x, y } = this.hover;
    if (this.selectedBuild === 'barn') {
      const tiles: { x: number; y: number }[] = [];
      for (let dy = 0; dy < BARN_H; dy += 1) {
        for (let dx = 0; dx < BARN_W; dx += 1) tiles.push({ x: x + dx, y: y + dy });
      }
      return tiles;
    }
    return [{ x, y }];
  }

  // ------------------------------------------------------------------ input

  /** Left click or drag-paint over a tile. */
  applyTool(x: number, y: number): void {
    // Signposts & the notice board take their clicks — deeds & orders before chores.
    const sign = this.signAt(x, y);
    if (sign) {
      this.attemptDeedPurchase(sign);
      return;
    }
    if (this.boardAt(x, y)) {
      this.toggleOrderCard();
      return;
    }
    switch (this.tool) {
      case 'till':
        this.queueTill(x, y);
        break;
      case 'water':
        this.queueWater(x, y);
        break;
      case 'harvest':
        this.queueHarvest(x, y);
        break;
      case 'seeds':
        this.queuePlant(x, y);
        break;
      case 'build':
        this.queueBuild(x, y);
        break;
      case 'clear':
        this.clearAt(x, y);
        break;
      case 'inspect':
        this.togglePin(x, y);
        break;
    }
  }

  /** Right-click: unqueue all pending work on a tile, else reset to inspect. */
  rightClick(x: number, y: number): void {
    const removed = this.queue.removeAtTile(x, y);
    if (removed.length > 0) {
      this.refundRemoved(removed);
      this.toast(removed.length === 1 ? 'Task removed' : `${removed.length} tasks removed`);
      this.events.onUiDirty();
      return;
    }
    this.setTool('inspect');
    this.unpin();
  }

  cancelTask(id: number): void {
    const removed = this.queue.removeById(id);
    if (removed) {
      this.refundRemoved([removed]);
      this.events.onUiDirty();
    }
  }

  private refundRemoved(tasks: Task[]): void {
    for (const task of tasks) {
      if (task.type === 'plant' && task.crop) {
        this.coins += CROPS[task.crop].seedCost;
      } else if (task.type === 'build' && task.build) {
        this.coins += BUILD_COSTS[task.build];
      }
    }
  }

  // --------------------------------------------------------- ambient life

  private spawnAmbient(dt: number): void {
    const camX = this.camera.x;
    const camY = this.camera.y;
    const raining = this.isRaining();
    const night = nightFactorAt(this.elapsed, this.goldenHour);

    if (night < 0.4 && !raining) {
      // drowsy drifting petals in daylight & the eternal afternoon
      this.petalTimer += dt;
      if (this.petals.length < 7 && this.petalTimer > 1.05) {
        this.petalTimer = 0;
        this.petals.push({
          x: camX + Math.random() * VIEW_W,
          y: camY - 6,
          vx: -6 + Math.random() * 12,
          vy: 12 + Math.random() * 7,
          phase: Math.random() * Math.PI * 2,
          life: 14,
        });
      }
    }
    if (night > 0.55 && !raining) {
      // blink-and-wander fireflies once the meadow goes dark
      this.fireflyTimer += dt;
      if (this.fireflies.length < 12 && this.fireflyTimer > 0.65) {
        this.fireflyTimer = 0;
        this.fireflies.push({
          x: camX + Math.random() * VIEW_W,
          y: camY + Math.random() * VIEW_H,
          phase: Math.random() * Math.PI * 2,
          life: 24,
        });
      }
    }

    for (let i = this.petals.length - 1; i >= 0; i -= 1) {
      const p = this.petals[i];
      p.life -= dt;
      p.x += (p.vx + Math.sin(this.elapsed * 1.4 + p.phase) * 10) * dt;
      p.y += p.vy * dt;
      if (p.life <= 0 || p.y > camY + VIEW_H + 12) this.petals.splice(i, 1);
    }
    for (let i = this.fireflies.length - 1; i >= 0; i -= 1) {
      const f = this.fireflies[i];
      f.life -= dt;
      f.x += Math.sin(this.elapsed * 0.6 + f.phase) * 10 * dt;
      f.y += Math.cos(this.elapsed * 0.45 + f.phase * 1.7) * 8 * dt;
      if (f.life <= 0) this.fireflies.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ deeds

  private attemptDeedPurchase(sign: SignPost): void {
    if (this.grid.isUnlocked(sign.parcel)) {
      this.toast(`${sign.name} is already yours`);
      return;
    }
    const check = checkDeedPurchase(this.ownedDeeds, this.coins);
    if (!check.ok) {
      sfx.denied();
      this.toast(check.reason);
      return;
    }
    if (check.deed.id !== sign.parcel) {
      sfx.denied();
      this.toast(`${check.deed.name}'s deed sells first — ${check.deed.price}c`);
      return;
    }
    this.coins -= check.deed.price;
    this.ownedDeeds.add(check.deed.id);
    this.grid.unlocked.add(check.deed.id);
    this.grid.clearParcelDecor(check.deed.id);
    // A little celebration scattered across the new land
    for (let i = 0; i < 14; i += 1) {
      const tx = Math.floor(Math.random() * WORLD_W);
      const ty = Math.floor(Math.random() * WORLD_H);
      if (this.grid.at(tx, ty)?.parcel === check.deed.id) {
        this.particles.burst('sparkle', tx * TILE + TILE / 2, ty * TILE + TILE / 2, 2);
      }
    }
    this.toast(`${check.deed.name} is yours!`, 3.2);
    sfx.coin();
    sfx.arpeggio();
    this.events.onUiDirty();
  }

  // ------------------------------------------------------- queue operations

  private queueTill(x: number, y: number): void {
    if (!this.grid.inBounds(x, y)) return;
    const tile = this.grid.at(x, y)!;
    if (!this.grid.isUnlocked(tile.parcel)) {
      this.toast('Wild meadow — buy the deed first');
      return;
    }
    if (tile.tilled || tile.blocked || tile.structure) return;
    const result = this.queue.add('till', x, y);
    if (result === 'full') this.toast(`Task queue full (${this.currentQueueCap()})`);
    else if (result === 'added') this.events.onUiDirty();
  }

  private queueWater(x: number, y: number): void {
    if (!this.grid.inBounds(x, y)) return;
    if (!this.grid.at(x, y)!.tilled) return; // only soil holds water — silent on grass
    if (this.grid.at(x, y)!.moisture >= MOIST_FULL && !this.queue.hasAt(x, y, 'water')) {
      return; // already soaked — quiet during drags
    }
    const result = this.queue.add('water', x, y);
    if (result === 'full') this.toast(`Task queue full (${this.currentQueueCap()})`);
    else if (result === 'added') this.events.onUiDirty();
  }

  private queueHarvest(x: number, y: number): void {
    if (!this.grid.canHarvest(x, y)) {
      const tile = this.grid.at(x, y);
      if (tile?.crop) this.toast('Still growing…');
      return;
    }
    const result = this.queue.add('harvest', x, y);
    if (result === 'full') this.toast(`Task queue full (${this.currentQueueCap()})`);
    else if (result === 'added') this.events.onUiDirty();
  }

  private queuePlant(x: number, y: number): void {
    if (!this.grid.inBounds(x, y)) return;
    const tile = this.grid.at(x, y)!;
    if (!tile.tilled) {
      this.toast('Till the soil first');
      return;
    }
    if (tile.crop) return; // already growing — quiet
    const def = CROPS[this.selectedSeed];
    if (this.coins < def.seedCost) {
      sfx.denied();
      this.toast(`Need ${def.seedCost}c for ${def.name} seeds`);
      return;
    }
    const result = this.queue.add('plant', x, y, this.selectedSeed);
    if (result === 'full') {
      this.toast(`Task queue full (${this.currentQueueCap()})`);
      return;
    }
    if (result === 'added') {
      this.coins -= def.seedCost; // seeds are paid up front; refunded if cancelled
      this.events.onUiDirty();
    }
  }

  private queueBuild(x: number, y: number): void {
    if (!this.grid.inBounds(x, y)) return;
    const cost = BUILD_COSTS[this.selectedBuild];
    if (this.signNear(x, y)) {
      this.toast('The signpost occupies that spot');
      return;
    }
    if (this.selectedBuild === 'barn') {
      if (this.barnSignCollision(x, y)) {
        this.toast('The barn would crowd the signpost');
        return;
      }
      if (!this.grid.canPlaceBarn(x, y, BARN_W, BARN_H)) return; // no room — quiet
    } else if (!this.grid.canBuildStructure(x, y)) {
      return; // occupied — quiet during drags
    }
    if (this.coins < cost) {
      sfx.denied();
      this.toast(`Need ${cost}c for the ${this.selectedBuild}`);
      return;
    }
    const result = this.queue.add('build', x, y, undefined, this.selectedBuild);
    if (result === 'full') {
      this.toast(`Task queue full (${this.currentQueueCap()})`);
      return;
    }
    if (result === 'added') {
      this.coins -= cost; // materials paid up front; refunded if cancelled
      this.events.onUiDirty();
    }
  }

  clearAt(x: number, y: number): void {
    const tile = this.grid.at(x, y);
    if (!tile?.structure) return; // nothing to clear — quiet during drags
    if (tile.structure === 'barn') {
      this.barnConfirm = { x, y }; // the modal takes it from here
      this.events.onUiDirty();
      return;
    }
    if (tile.structure === 'sprinkler' || tile.structure === 'lantern' || tile.structure === 'planter' || tile.structure === 'bench') {
      const removed = this.grid.removeStructure(x, y);
      if (removed === 'sprinkler') this.removeSprinklerAt(x, y);
      this.particles.burst('dirt', x * TILE + TILE / 2, y * TILE + TILE / 2, 5);
      this.events.onUiDirty();
      return;
    }
    if (tile.structure === 'board') {
      this.toast("The notice board isn't going anywhere");
      return;
    }
    this.grid.removeStructure(x, y);
    this.particles.burst('dirt', x * TILE + TILE / 2, y * TILE + TILE / 2, 5);
    this.events.onUiDirty();
  }

  /** Barn teardown confirmed from the modal — the 400c is gone forever. */
  demolishBarnAt(x: number, y: number): void {
    const tile = this.grid.at(x, y);
    const barnId = tile?.barnId;
    this.barnConfirm = null;
    if (barnId === undefined) {
      this.events.onUiDirty();
      return;
    }
    this.grid.removeBarn(barnId);
    const i = this.barns.findIndex((b) => b.id === barnId);
    if (i !== -1) {
      const [barn] = this.barns.splice(i, 1);
      this.particles.burst('dirt', barn.x * TILE + 32, barn.y * TILE + 24, 14);
    }
    this.syncQueueCap();
    this.toast('The barn came down');
    this.events.onUiDirty();
  }

  cancelBarnConfirm(): void {
    if (!this.barnConfirm) return;
    this.barnConfirm = null;
    this.events.onUiDirty();
  }

  // --------------------------------------------------------- farmer callbacks

  isTaskValid(task: Task): boolean {
    switch (task.type) {
      case 'till':
        return this.grid.canTill(task.x, task.y);
      case 'water':
        return this.grid.canWater(task.x, task.y);
      case 'harvest':
        return this.grid.canHarvest(task.x, task.y);
      case 'plant':
        return this.grid.canPlant(task.x, task.y) && !!task.crop;
      case 'build':
        if (task.build === 'barn') return this.grid.canPlaceBarn(task.x, task.y, BARN_W, BARN_H);
        if (task.build === 'path' || task.build === 'fence' || task.build === 'sprinkler'
          || task.build === 'lantern' || task.build === 'planter' || task.build === 'bench') {
          return this.grid.canBuildStructure(task.x, task.y);
        }
        return false;
    }
  }

  onTaskRefunded(task: Task): void {
    if (task.type === 'plant' && task.crop) {
      const refund = CROPS[task.crop].seedCost;
      this.coins += refund;
      this.toast(`Seeds refunded (+${refund}c)`);
    } else if (task.type === 'build' && task.build) {
      const refund = BUILD_COSTS[task.build];
      this.coins += refund;
      this.toast(`Materials refunded (+${refund}c)`);
    }
  }

  onHarvest(x: number, y: number, crop: CropId): void {
    const def = CROPS[crop];
    this.coins += def.sellPrice;
    this.stats.harvested += 1;
    this.stats.earned += def.sellPrice;
    this.floaters.push({
      x: x * TILE + TILE / 2,
      y: y * TILE + 2,
      text: `+${def.sellPrice}c`,
      color: '#ffd76a',
      life: 1.4,
      maxLife: 1.4,
    });
    this.trackOrder(crop, x, y);
    sfx.coin(0.13);
    this.events.onUiDirty();
  }

  private trackOrder(crop: CropId, x: number, y: number): void {
    const o = this.orders.active;
    if (!o || o.crop !== crop) return;
    o.have = Math.min(o.needed, o.have + 1);
    if (o.have < o.needed) {
      this.events.onUiDirty();
      return;
    }
    // Bundle complete — the mayor pays the bonus and asks for the next one.
    this.coins += o.reward;
    this.stats.earned += o.reward;
    this.orders.completed += 1;
    this.floaters.push({
      x: x * TILE + TILE / 2,
      y: y * TILE,
      text: `+${o.reward}c`,
      color: '#ffc4ec',
      life: 1.6,
      maxLife: 1.6,
    });
    for (let i = 0; i < 3; i += 1) {
      this.particles.burst('sparkle', ORDER_BOARD.x * TILE + TILE / 2, ORDER_BOARD.y * TILE + 2, 5);
    }
    this.toast(`Bundle delivered! +${o.reward}c`, 3);
    sfx.arpeggio();
    this.orders.active = generateOrder(this.orders.completed);
    this.orderFresh = true;
  }

  onBuildPlaced(task: Task): void {
    if (!task.build) return;
    const { x, y } = task;
    sfx.knock();
    if (task.build === 'barn') {
      const id = this.nextBarnId;
      this.nextBarnId += 1;
      if (this.grid.placeBarn(x, y, BARN_W, BARN_H, id)) {
        this.barns.push({ id, x, y });
        this.syncQueueCap();
        this.toast('The barn is up! +16 queue slots', 3.2);
        sfx.arpeggio();
      }
    } else {
      this.grid.placeStructure(x, y, task.build);
      if (task.build === 'sprinkler') {
        this.sprinklers.push({ x, y, timer: Math.random() * SPRINKLER_INTERVAL });
        this.toast('Sprinkler down — it waters the 3×3 around itself', 3);
      }
    }
    this.events.onUiDirty();
  }

  /** If the farmer is standing inside something that just became blocked, step him aside. */
  nudgeFarmerIfStuck(): void {
    if (this.grid.canStand(this.farmer.tileX, this.farmer.tileY)) return;
    for (let radius = 1; radius <= 6; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const tx = this.farmer.tileX + dx;
          const ty = this.farmer.tileY + dy;
          if (this.grid.canStand(tx, ty)) {
            this.farmer.px = tx * TILE;
            this.farmer.py = ty * TILE;
            this.farmer.tileX = tx;
            this.farmer.tileY = ty;
            this.particles.burst('sparkle', tx * TILE + TILE / 2, ty * TILE + TILE / 2, 5);
            return;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------- pin & toast

  togglePin(x: number, y: number): void {
    if (!this.grid.inBounds(x, y)) {
      this.unpin();
      return;
    }
    if (this.pinnedTile && this.pinnedTile.x === x && this.pinnedTile.y === y) {
      this.unpin();
      return;
    }
    this.pinnedTile = { x, y };
    this.events.onUiDirty();
  }

  unpin(): void {
    if (!this.pinnedTile) return;
    this.pinnedTile = null;
    this.events.onUiDirty();
  }

  /** Live info for the pinned tile — recomputed so growth can tick on screen. */
  describeTile(x: number, y: number): PinnedInfo {
    const sign = this.signAt(x, y);
    if (sign) {
      if (this.grid.isUnlocked(sign.parcel)) {
        return { title: `${sign.name} — yours`, lines: ['Bought and paid for.', 'Wild tilled under — the soil is yours to keep.'] };
      }
      const check = checkDeedPurchase(this.ownedDeeds, this.coins);
      const nextNote = !check.ok ? check.reason
        : check.deed.id === sign.parcel ? 'Click the signpost to buy it.'
        : `Deeds sell in order — ${check.deed.name} (${check.deed.price}c) first.`;
      return {
        title: `${sign.name} deed`,
        lines: [`Expand the farm here for ${sign.price}c.`, nextNote],
      };
    }
    const tile = this.grid.at(x, y)!;
    if (this.boardAt(x, y)) {
      const o = this.orders.active;
      if (o) {
        const def = CROPS[o.crop];
        return {
          title: 'The Notice Board',
          lines: [`The mayor wants ${o.needed} × ${def.name} — ${o.have}/${o.needed} in.`, `Reward: ${o.reward}c · Click to see the bundle.`],
        };
      }
      return { title: 'The Notice Board', lines: ['The mayor will have something to say soon.', 'Click to check.'] };
    }
    if (tile.structure === 'barn') {
      return { title: 'The Barn', lines: ['A cozy centerpiece, warm inside.', '+16 task queue slots. Clear tool removes it (no refund).'] };
    }
    if (tile.structure === 'sprinkler') {
      return { title: 'Sprinkler', lines: ['A merry metronome of water.', 'Every 30s, a 3×3 soak — owned soil only.'] };
    }
    if (tile.structure === 'lantern') {
      return { title: 'Stone lantern', lines: ['A small warm candle against the night.', 'Glows after dusk.'] };
    }
    if (tile.structure === 'planter') {
      return { title: 'Flower planter', lines: ['Marigolds, cornflowers and one suspicious daisy.'] };
    }
    if (tile.structure === 'bench') {
      return { title: 'Garden bench', lines: ['A fine spot to watch turnips happen.'] };
    }
    if (tile.structure === 'fence') {
      return { title: 'Wooden fence', lines: ['Keeps the wildflowers corralled.', 'Clear tool removes it.'] };
    }
    if (tile.structure === 'path') {
      return { title: 'Garden path', lines: ['Packed earth, easy on boots.', 'Walking here is ~35% faster.'] };
    }
    if (!this.grid.isUnlocked(tile.parcel)) {
      return { title: 'Wild meadow', lines: ['Unclaimed land.', 'Buyers beyond the starter plot need a deed.'] };
    }
    if (tile.crop) {
      const def = CROPS[tile.crop.crop];
      const crop = tile.crop;
      const moist = tile.moisture > 0.05;
      if (isMature(crop)) {
        return {
          title: `${def.name} — Ripe!`,
          lines: ['Ready to harvest.', `Sells for ${def.sellPrice}c · Slot 4 to collect.`],
        };
      }
      return {
        title: `${def.name} — ${stageName(crop.crop, crop.growth)}`,
        lines: [
          `Growth ${progressPct(crop.crop, crop.growth)}% · ${moist ? 'moist, drinking' : 'dry — paused'}`,
          `Sells for ${def.sellPrice}c when ripe.`,
        ],
      };
    }
    if (tile.tilled) {
      const moist = tile.moisture > 0.05;
      return {
        title: 'Tilled soil',
        lines: [
          moist ? 'Dark and moist.' : 'Pale and dry.',
          'Slot 5 sows seeds · Slot 3 waters.',
        ],
      };
    }
    return { title: 'Meadow grass', lines: ['Soft turf, ready for the hoe.', 'Drag with the Till tool to queue work.'] };
  }

  clearPin(): void {
    this.unpin();
  }
}
