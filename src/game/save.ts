import { BARN_H, BARN_W, DEED_PARCELS, QUEUE_CAP, WORLD_H, WORLD_W, type BuildableId, type ParcelId } from './constants';
import type { CropId } from './crops';
import { CROPS, parseOrders, type Order } from './crops';
import type { StructureId } from './grid';
import type { TaskType } from './tasks';
import type { World } from './world';

/**
 * localStorage persistence, versioned under `lofi-garden-save-v1`.
 * Sparse tile encoding (only modified tiles are written). Loading is
 * schema-validated: broken files are set aside untouched and the farm
 * starts fresh — never a crash, never a half-loaded world.
 */
export const SAVE_KEY = 'lofi-garden-save-v1';
export const CORRUPT_BACKUP_KEY = 'lofi-garden-save-corrupt';
/** v2 adds the day/night clock (`elapsed`) and notice-board order state. v1 files are migrated on load. */
export const SAVE_VERSION = 2;

export interface SaveTileEntry {
  i: number; // y * WORLD_W + x
  tilled?: boolean;
  moisture?: number;
  crop?: { crop: CropId; growth: number };
  structure?: StructureId;
}

export interface SaveFile {
  version: number;
  savedAt: number;
  coins: number;
  deeds: ParcelId[];
  farmer: { x: number; y: number };
  selectedSeed: CropId;
  selectedBuild: BuildableId;
  stats: { harvested: number; earned: number };
  tiles: SaveTileEntry[];
  barns: { id: number; x: number; y: number }[];
  queue: { type: TaskType; x: number; y: number; crop?: CropId; build?: BuildableId }[];
  nextBarnId: number;
  /** v2 — the farm's day/night clock, in seconds. */
  elapsed: number;
  /** v2 — the mayor's current bundle + lifetime completions. */
  orders: { active: Order | null; completed: number };
}

export type LoadResult = 'loaded' | 'fresh' | 'failed';

const CROP_IDS: readonly CropId[] = ['turnip', 'carrot', 'pumpkin'];
const BUILD_IDS: readonly BuildableId[] = ['path', 'fence', 'sprinkler', 'lantern', 'planter', 'bench', 'barn'];
const TILE_STRUCTURES: readonly StructureId[] = ['path', 'fence', 'sprinkler', 'lantern', 'planter', 'bench'];
const TASK_TYPES: readonly TaskType[] = ['till', 'water', 'harvest', 'plant', 'build'];
const DEED_ORDER = DEED_PARCELS.map((d) => d.id);
const TILE_COUNT = WORLD_W * WORLD_H;

// ------------------------------------------------------------------ write

export function saveGame(world: World): boolean {
  try {
    const tiles: SaveTileEntry[] = [];
    for (let i = 0; i < TILE_COUNT; i += 1) {
      const t = world.grid.tiles[i];
      const entry: SaveTileEntry = { i };
      let dirty = false;
      if (t.tilled) {
        entry.tilled = true;
        dirty = true;
      }
      if (t.moisture > 0.005) {
        entry.moisture = Math.round(t.moisture * 100) / 100;
        dirty = true;
      }
      if (t.crop) {
        entry.crop = { crop: t.crop.crop, growth: Math.round(t.crop.growth * 100) / 100 };
        dirty = true;
      }
      // 1×1 structures live per-tile; barns are stored in `barns`
      if (t.structure && t.structure !== 'barn' && t.structure !== 'board') {
        entry.structure = t.structure;
        dirty = true;
      }
      if (dirty) tiles.push(entry);
    }
    const data: SaveFile = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      coins: world.coins,
      deeds: [...world.ownedDeeds],
      farmer: { x: world.farmer.tileX, y: world.farmer.tileY },
      selectedSeed: world.selectedSeed,
      selectedBuild: world.selectedBuild,
      stats: { ...world.stats },
      tiles,
      barns: world.barns.map((b) => ({ ...b })),
      queue: world.queue.list().map((t) => ({ type: t.type, x: t.x, y: t.y, crop: t.crop, build: t.build })),
      nextBarnId: world.barnIdCounter,
      elapsed: world.elapsed,
      orders: { active: world.orders.active ? { ...world.orders.active } : null, completed: world.orders.completed },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // storage full / private mode — the farm carries on unsaved
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(CORRUPT_BACKUP_KEY);
  } catch {
    // ignore
  }
}

// ------------------------------------------------------------- validate

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function parseCrop(v: unknown): CropId | null {
  return CROP_IDS.includes(v as CropId) ? (v as CropId) : null;
}

function parseBuild(v: unknown): BuildableId | null {
  return BUILD_IDS.includes(v as BuildableId) ? (v as BuildableId) : null;
}

function parseDeeds(v: unknown): ParcelId[] {
  if (!Array.isArray(v)) return [];
  const requested = new Set<ParcelId>();
  for (const item of v) {
    if (DEED_ORDER.includes(item as ParcelId)) requested.add(item as ParcelId);
  }
  // keep only a prefix — deeds sell in order, so an out-of-order save is repaired
  const kept: ParcelId[] = [];
  for (const id of DEED_ORDER) {
    if (requested.has(id)) kept.push(id);
    else break;
  }
  return kept;
}

function parseTiles(v: unknown): SaveTileEntry[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<number>();
  const out: SaveTileEntry[] = [];
  for (const item of v) {
    if (!isRecord(item)) continue;
    const i = Math.floor(clampNumber(item.i, 0, TILE_COUNT - 1, -1));
    if (i < 0 || seen.has(i)) continue;
    seen.add(i);
    const entry: SaveTileEntry = { i };
    if (item.tilled === true) entry.tilled = true;
    if (item.moisture !== undefined) {
      entry.moisture = Math.round(clampNumber(item.moisture, 0, 1, 0) * 100) / 100;
    }
    if (isRecord(item.crop)) {
      const crop = parseCrop(item.crop.crop);
      if (crop) {
        const max = CROPS[crop].growTime;
        entry.crop = { crop, growth: clampNumber(item.crop.growth, 0, max, 0) };
      }
    }
    if (TILE_STRUCTURES.includes(item.structure as StructureId)) {
      entry.structure = item.structure as StructureId;
    }
    out.push(entry);
  }
  return out;
}

function parseBarns(v: unknown): SaveFile['barns'] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<number>();
  const out: SaveFile['barns'] = [];
  for (const item of v) {
    if (!isRecord(item)) continue;
    const id = Math.floor(clampNumber(item.id, 1, Number.MAX_SAFE_INTEGER, -1));
    const x = Math.floor(clampNumber(item.x, 0, WORLD_W - BARN_W, -1));
    const y = Math.floor(clampNumber(item.y, 0, WORLD_H - BARN_H, -1));
    if (id < 1 || x < 0 || y < 0 || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, x, y });
    if (out.length >= 64) break;
  }
  return out;
}

function parseQueue(v: unknown): SaveFile['queue'] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: SaveFile['queue'] = [];
  for (const item of v) {
    if (!isRecord(item)) continue;
    const x = Math.floor(clampNumber(item.x, 0, WORLD_W - 1, -1));
    const y = Math.floor(clampNumber(item.y, 0, WORLD_H - 1, -1));
    const type = item.type as TaskType;
    if (x < 0 || y < 0 || !TASK_TYPES.includes(type)) continue;
    const key = `${x},${y},${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const task: SaveFile['queue'][number] = { type, x, y };
    if (type === 'plant') {
      const crop = parseCrop(item.crop);
      if (!crop) continue; // an unsowable task is a skipped task
      task.crop = crop;
    }
    if (type === 'build') {
      const build = parseBuild(item.build);
      if (!build) continue;
      task.build = build;
    }
    out.push(task);
    if (out.length >= QUEUE_CAP + 16) break;
  }
  return out;
}

/** Exported for tests: parse unknown input into a clean save, or null if unusable. v1 files are migrated in place. */
export function parseSave(raw: unknown): SaveFile | null {
  if (!isRecord(raw)) return null;
  const version = raw.version;
  if (version !== 1 && version !== 2) return null;
  const coins = clampNumber(raw.coins, 0, 1_000_000_000, NaN);
  if (Number.isNaN(coins)) return null;
  const farmerRaw = isRecord(raw.farmer) ? raw.farmer : {};
  const statsRaw = isRecord(raw.stats) ? raw.stats : {};
  return {
    version: SAVE_VERSION,
    savedAt: clampNumber(raw.savedAt, 0, Date.now() + 60_000, Date.now()),
    coins,
    deeds: parseDeeds(raw.deeds),
    farmer: {
      x: Math.floor(clampNumber(farmerRaw.x, 0, WORLD_W - 1, WORLD_W / 2)),
      y: Math.floor(clampNumber(farmerRaw.y, 0, WORLD_H - 1, WORLD_H / 2)),
    },
    selectedSeed: parseCrop(raw.selectedSeed) ?? 'turnip',
    selectedBuild: parseBuild(raw.selectedBuild) ?? 'path',
    stats: {
      harvested: Math.floor(clampNumber(statsRaw.harvested, 0, 1_000_000, 0)),
      earned: Math.floor(clampNumber(statsRaw.earned, 0, 1_000_000_000, 0)),
    },
    tiles: parseTiles(raw.tiles),
    barns: parseBarns(raw.barns),
    queue: parseQueue(raw.queue),
    nextBarnId: Math.floor(clampNumber(raw.nextBarnId, 1, Number.MAX_SAFE_INTEGER, 1)),
    // v1 files simply don't carry these — they get fresh-farm defaults
    elapsed: clampNumber(raw.elapsed, 0, 10_000_000, 0),
    orders: parseOrders(raw.orders),
  };
}

// ------------------------------------------------------------------ read

export function readSave(): SaveFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return parseSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Apply a validated save onto a fresh world. */
export function applySave(world: World, save: SaveFile): void {
  world.coins = save.coins;
  for (const deed of save.deeds) {
    world.ownedDeeds.add(deed);
    world.grid.unlocked.add(deed);
    world.grid.clearParcelDecor(deed);
  }
  world.selectedSeed = save.selectedSeed;
  world.selectedBuild = save.selectedBuild;
  world.stats.harvested = save.stats.harvested;
  world.stats.earned = save.stats.earned;

  // barns first — they also seed the barn id counter and the queue cap
  const placed: { id: number; x: number; y: number }[] = [];
  for (const barn of save.barns) {
    if (world.grid.placeBarn(barn.x, barn.y, BARN_W, BARN_H, barn.id)) {
      placed.push(barn);
    }
  }
  const maxBarnId = placed.reduce((m, b) => Math.max(m, b.id), 0);
  world.restoreBarns(placed, Math.max(save.nextBarnId, maxBarnId + 1));

  for (const entry of save.tiles) {
    const tile = world.grid.tiles[entry.i];
    if (!tile) continue;
    if (entry.tilled) tile.tilled = true;
    if (entry.moisture !== undefined) tile.moisture = entry.moisture;
    if (entry.crop) tile.crop = { ...entry.crop };
    if (entry.structure && TILE_STRUCTURES.includes(entry.structure)) {
      tile.structure = entry.structure;
      if (entry.structure === 'fence' || entry.structure === 'planter' || entry.structure === 'bench') {
        tile.blocked = true;
      }
    }
  }

  world.elapsed = save.elapsed;
  world.restoreOrders(save.orders);
  world.restoreSprinklers();

  world.farmer.tileX = save.farmer.x;
  world.farmer.tileY = save.farmer.y;
  if (!world.grid.canStand(save.farmer.x, save.farmer.y)) {
    world.farmer.tileX = 32;
    world.farmer.tileY = 24;
  }
  world.farmer.px = world.farmer.tileX * 16;
  world.farmer.py = world.farmer.tileY * 16;

  for (const task of save.queue) {
    world.queue.add(task.type, task.x, task.y, task.crop, task.build);
  }
}

/**
 * Load and apply the save onto a fresh world.
 * 'fresh' = no save; 'loaded' = ok; 'failed' = corrupt save (set aside, farm starts fresh).
 */
export function applySavedGame(world: World): LoadResult {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return 'fresh';
  }
  if (!raw) return 'fresh';
  const save = readSave();
  if (!save) {
    // keep the broken file around for forensics, out of the way of new saves
    try {
      localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // ignore
    }
    return 'failed';
  }
  applySave(world, save);
  return 'loaded';
}
