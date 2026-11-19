export const TILE = 16;
export const VIEW_W = 480;
export const VIEW_H = 270;
export const WORLD_W = 64;
export const WORLD_H = 48;
export const WORLD_PX_W = WORLD_W * TILE;
export const WORLD_PX_H = WORLD_H * TILE;

/** Starter plot bounds (inclusive x/y, exclusive end). Everything outside is a wild deed parcel. */
export const STARTER = { x: 14, y: 10, w: 36, h: 28 } as const;

export const QUEUE_CAP = 32;
export const BARN_QUEUE_BONUS = 16;
export const BARN_W = 4;
export const BARN_H = 3;

export const SPRINKLER_INTERVAL = 30;
export const SPRINKLER_RADIUS = 1; // 3×3, centred on the post
export const ORDER_BOARD = { x: 32, y: 34 } as const;
export const RAIN_MIN_GAP = 150; // seconds between showers
export const RAIN_MAX_GAP = 300;
export const RAIN_MIN_DURATION = 45;
export const RAIN_MAX_DURATION = 70;

export const BUILD_COSTS = {
  path: 2,
  fence: 3,
  sprinkler: 120,
  lantern: 35,
  planter: 25,
  bench: 15,
  barn: 400,
} as const;

export type BuildableId = keyof typeof BUILD_COSTS;
export const CAMERA_SPEED = 260; // px/s
export const FARMER_SPEED = 2.2 * TILE; // px/s
export const FARMER_TILE = { x: 32, y: 24 } as const; // spawn, center-ish of starter

export const STARTER_COINS = 20;

export interface ParcelDef {
  id: ParcelId;
  name: string;
  price: number;
  signX: number;
  signY: number;
}

export type ParcelId = 'starter' | 'east' | 'north' | 'west' | 'south';

export const DEED_PARCELS: ParcelDef[] = [
  { id: 'east', name: 'East Meadow', price: 150, signX: 52, signY: 24 },
  { id: 'north', name: 'North Orchard', price: 300, signX: 32, signY: 7 },
  { id: 'west', name: 'West Bramble', price: 500, signX: 11, signY: 24 },
  { id: 'south', name: 'South Thicket', price: 800, signX: 32, signY: 40 },
];
