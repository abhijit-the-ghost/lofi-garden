export type CropId = 'turnip' | 'carrot' | 'pumpkin';

export interface Order {
  crop: CropId;
  needed: number;
  have: number;
  reward: number;
}

export interface OrdersState {
  active: Order | null;
  completed: number;
}

const CROP_CYCLE: CropId[] = ['turnip', 'carrot', 'pumpkin'];
const MAX_NEED = 6;
const REWARD_MULTIPLIER = 1.5;

export function generateOrder(completed: number): Order {
  const crop = CROP_CYCLE[Math.floor(Math.random() * CROP_CYCLE.length)];
  const needed = Math.min(MAX_NEED, 2 + Math.floor(completed / 2));
  const reward = Math.ceil(CROPS[crop].sellPrice * needed * REWARD_MULTIPLIER);
  return { crop, needed, have: 0, reward };
}

/** Every fresh farm — and every farm migrating from v1 — starts with the same hello. */
export const WELCOME_ORDER: Order = { crop: 'turnip', needed: 2, have: 0, reward: 27 };

export function parseOrder(v: unknown): Order | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.crop !== 'turnip' && o.crop !== 'carrot' && o.crop !== 'pumpkin') return null;
  const needed = Math.floor(Number(o.needed));
  const reward = Math.floor(Number(o.reward));
  if (!Number.isFinite(needed) || needed < 1 || needed > 24) return null;
  // have is clamped into need — a bloated save is repaired, not rejected
  const have = Math.min(needed, Math.max(0, Math.floor(Number(o.have)) || 0));
  if (!Number.isFinite(reward) || reward < 0 || reward > 10_000) return null;
  return { crop: o.crop, needed, have, reward };
}

export function parseOrders(v: unknown): OrdersState {
  if (typeof v !== 'object' || v === null) return { active: null, completed: 0 };
  const o = v as Record<string, unknown>;
  const completed = Math.max(0, Math.floor(Number(o.completed) || 0));
  return { active: parseOrder(o.active), completed };
}

export interface CropDef {
  id: CropId;
  name: string;
  seedCost: number;
  /** Total water-gated seconds from planting to ripe. */
  growTime: number;
  sellPrice: number;
  stageNames: [string, string, string, string];
}

export const CROPS: Record<CropId, CropDef> = {
  turnip: {
    id: 'turnip',
    name: 'Turnip',
    seedCost: 4,
    growTime: 45,
    sellPrice: 9,
    stageNames: ['Sowing', 'Sprout', 'Leafy', 'Ripe'],
  },
  carrot: {
    id: 'carrot',
    name: 'Carrot',
    seedCost: 10,
    growTime: 90,
    sellPrice: 22,
    stageNames: ['Sowing', 'Sprout', 'Leafy', 'Ripe'],
  },
  pumpkin: {
    id: 'pumpkin',
    name: 'Pumpkin',
    seedCost: 25,
    growTime: 180,
    sellPrice: 60,
    stageNames: ['Sowing', 'Sprout', 'Flowering', 'Ripe'],
  },
};

export const CROP_LIST: CropDef[] = [CROPS.turnip, CROPS.carrot, CROPS.pumpkin];

/** Seconds for a fully-soaked tile to dry out. */
export const MOISTURE_DECAY = 75;
/** Below this moisture the crop pauses (no penalty). */
export const MOISTURE_THRESHOLD = 0.05;

export interface CropInstance {
  crop: CropId;
  /** Water-gated seconds accumulated — capped at growTime. */
  growth: number;
}

export type CropStage = 0 | 1 | 2 | 3;

export function stageFor(crop: CropId, growth: number): CropStage {
  const t = Math.min(1, growth / CROPS[crop].growTime);
  if (t >= 1) return 3;
  return Math.min(3, Math.floor(t * 4)) as CropStage;
}

export function isMature(instance: CropInstance): boolean {
  return instance.growth >= CROPS[instance.crop].growTime;
}

export function stageName(crop: CropId, growth: number): string {
  return CROPS[crop].stageNames[stageFor(crop, growth)];
}

export function progressPct(crop: CropId, growth: number): number {
  return Math.floor(Math.min(1, growth / CROPS[crop].growTime) * 100);
}

/** Advance one tile's soil/crop simulation. Pure — no DOM. */
export function tickTile(tile: { moisture: number; crop?: CropInstance }, dt: number): boolean {
  let changed = false;
  if (tile.moisture > 0) {
    tile.moisture = Math.max(0, tile.moisture - dt / MOISTURE_DECAY);
    changed = true;
  }
  const crop = tile.crop;
  if (crop) {
    const def = CROPS[crop.crop];
    if (crop.growth < def.growTime && tile.moisture > MOISTURE_THRESHOLD) {
      crop.growth = Math.min(def.growTime, crop.growth + dt);
      changed = true;
    }
  }
  return changed;
}
