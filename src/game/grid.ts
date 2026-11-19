import { STARTER, WORLD_H, WORLD_W, type ParcelId } from './constants';
import { isMature, tickTile, type CropInstance, type CropId } from './crops';
import { maskFromNeighbors } from './autotile';

export type StructureId = 'path' | 'fence' | 'barn' | 'sprinkler' | 'lantern' | 'planter' | 'bench' | 'board';

export interface Tile {
  /** Deterministic 0..3 grass variant (drives sprite choice). */
  variant: number;
  /** 0 = no decor, 1 = pink flower, 2 = yellow flower, 3 = rock (wild parcels only). */
  decor: number;
  parcel: ParcelId;
  tilled: boolean;
  /** Blocks pathing (barn footprint, fences). Crops never block. */
  blocked: boolean;
  /** Soil moisture 0..1 — 0 on untilled ground. */
  moisture: number;
  crop?: CropInstance;
  /** Placed structure, if any — barn tiles reference their barnId. */
  structure?: StructureId;
  barnId?: number;
}

/** Integer hash → deterministic per-tile variation without storing noise tables. */
export function hash2(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 1442695040888963407) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

export function parcelAt(x: number, y: number): ParcelId {
  const inStarterX = x >= STARTER.x && x < STARTER.x + STARTER.w;
  const inStarterY = y >= STARTER.y && y < STARTER.y + STARTER.h;
  if (inStarterX && inStarterY) return 'starter';
  if (y < STARTER.y) return 'north';
  if (y >= STARTER.y + STARTER.h) return 'south';
  if (x < STARTER.x) return 'west';
  return 'east';
}

export class TileGrid {
  readonly tiles: Tile[] = new Array(WORLD_W * WORLD_H);
  readonly unlocked = new Set<ParcelId>(['starter']);

  constructor() {
    for (let y = 0; y < WORLD_H; y += 1) {
      for (let x = 0; x < WORLD_W; x += 1) {
        const parcel = parcelAt(x, y);
        const variant = hash2(x, y, 1) % 4;
        let decor = 0;
        if (parcel !== 'starter') {
          const roll = hash2(x, y, 7) % 16;
          if (roll === 0) decor = 1;
          else if (roll === 1) decor = 2;
          else if (roll === 2) decor = 3;
        }
        this.tiles[y * WORLD_W + x] = {
          variant,
          decor,
          parcel,
          tilled: false,
          blocked: false,
          moisture: 0,
        };
      }
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;
  }

  at(x: number, y: number): Tile | null {
    if (!this.inBounds(x, y)) return null;
    return this.tiles[y * WORLD_W + x];
  }

  isUnlocked(parcel: ParcelId): boolean {
    return this.unlocked.has(parcel);
  }

  /** Can the farmer walk onto this tile? (Crops and soil are always walkable.) */
  canStand(x: number, y: number): boolean {
    const t = this.at(x, y);
    return t !== null && !t.blocked;
  }

  /** Can a till task be queued on this tile? */
  canTill(x: number, y: number): boolean {
    const t = this.at(x, y);
    return t !== null && !t.blocked && !t.tilled && !t.structure && this.isUnlocked(t.parcel);
  }

  till(x: number, y: number): boolean {
    const t = this.at(x, y);
    if (!t || t.tilled || t.blocked) return false;
    t.tilled = true;
    return true;
  }

  canWater(x: number, y: number): boolean {
    const t = this.at(x, y);
    return (
      t !== null &&
      !t.blocked &&
      t.tilled &&
      this.isUnlocked(t.parcel) &&
      t.moisture < 0.98
    );
  }

  water(x: number, y: number): boolean {
    const t = this.at(x, y);
    if (!t || !t.tilled) return false;
    t.moisture = 1;
    return true;
  }

  canPlant(x: number, y: number): boolean {
    const t = this.at(x, y);
    return (
      t !== null &&
      !t.blocked &&
      t.tilled &&
      !t.crop &&
      this.isUnlocked(t.parcel)
    );
  }

  plant(x: number, y: number, crop: CropId): boolean {
    const t = this.at(x, y);
    if (!t || !t.tilled || t.crop || t.blocked) return false;
    t.crop = { crop, growth: 0 };
    return true;
  }

  canHarvest(x: number, y: number): boolean {
    const t = this.at(x, y);
    return t !== null && t.crop !== undefined && isMature(t.crop) && this.isUnlocked(t.parcel);
  }

  /** Remove and return the crop at a tile (harvest). */
  harvest(x: number, y: number): CropId | null {
    const t = this.at(x, y);
    if (!t || !t.crop) return null;
    const id = t.crop.crop;
    delete t.crop;
    t.moisture = 0; // harvested bed goes dry
    return id;
  }

  /** Advance soil moisture + crop growth. Called once per fixed step. */
  updateCrops(dt: number): void {
    for (const tile of this.tiles) {
      if (tile.moisture <= 0 && !tile.crop) continue;
      tickTile(tile, dt);
    }
  }
// ------------------------------------------------------------- structures

/** Can a path/fence sit here? (Grass only — no tilled beds, crops, structures, boulders of barn.) */
canBuildStructure(x: number, y: number): boolean {
  const t = this.at(x, y);
  return (
    t !== null &&
    this.isUnlocked(t.parcel) &&
    !t.blocked &&
    !t.tilled &&
    !t.crop &&
    !t.structure
  );
}

placeStructure(x: number, y: number, structure: StructureId): boolean {
  const t = this.at(x, y);
  if (!t || t.structure || t.blocked || t.tilled || t.crop) return false;
  t.structure = structure;
  if (structure === 'fence' || structure === 'planter' || structure === 'bench' || structure === 'board') {
    t.blocked = true;
  }
  return true;
}

/** Fixtures (notice board) — always blocked, never clearable. */
placeBoard(x: number, y: number): void {
  const t = this.at(x, y)!;
  t.structure = 'board';
  t.blocked = true;
}

/** Remove a path, fence or 1×1 prop. Barns & fixtures are refused here. */
removeStructure(x: number, y: number): StructureId | undefined {
  const t = this.at(x, y);
  if (!t || !t.structure) return undefined;
  if (t.structure === 'barn' || t.structure === 'board') return undefined;
  const removed = t.structure;
  t.structure = undefined;
  if (removed === 'fence' || removed === 'planter' || removed === 'bench') t.blocked = false;
  return removed;
}

canPlaceBarn(anchorX: number, anchorY: number, w: number, h: number): boolean {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      if (!this.canBuildStructure(anchorX + dx, anchorY + dy)) return false;
    }
  }
  return true;
}

placeBarn(anchorX: number, anchorY: number, w: number, h: number, barnId: number): boolean {
  if (!this.canPlaceBarn(anchorX, anchorY, w, h)) return false;
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      const t = this.at(anchorX + dx, anchorY + dy)!;
      t.structure = 'barn';
      t.barnId = barnId;
      t.blocked = true;
    }
  }
  return true;
}

removeBarn(barnId: number): void {
  for (const t of this.tiles) {
    if (t.barnId === barnId) {
      t.structure = undefined;
      t.barnId = undefined;
      t.blocked = false;
    }
  }
}

/** Buying a deed clears the wild flowers/rocks in that parcel. */
clearParcelDecor(parcel: ParcelId): void {
  for (const t of this.tiles) {
    if (t.parcel === parcel) t.decor = 0;
  }
}

/** True if the neighbor counts as a "connection" for autotiling `kind`. */
isConnector(x: number, y: number, kind: 'path' | 'fence'): boolean {
  const t = this.at(x, y);
  if (!t || !t.structure) return false;
  if (t.structure === 'barn') return true; // paths & fences happily meet the barn wall
  return t.structure === kind;
}

/** 4-bit neighbor mask (N=1, E=2, S=4, W=8) for autotiling sprites. */
maskAt(x: number, y: number, kind: 'path' | 'fence'): number {
  return maskFromNeighbors({
    n: this.isConnector(x, y - 1, kind),
    e: this.isConnector(x + 1, y, kind),
    s: this.isConnector(x, y + 1, kind),
    w: this.isConnector(x - 1, y, kind),
  });
}
}
