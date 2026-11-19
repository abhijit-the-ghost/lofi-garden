import { describe, expect, it } from 'vitest';
import { TileGrid } from '../game/grid';
import { BARN_H, BARN_W, DEED_PARCELS } from '../game/constants';
import { checkDeedPurchase, nextDeed } from '../game/deeds';
import { maskFromNeighbors, BIT_N, BIT_E, BIT_S, BIT_W } from '../game/autotile';

describe('deeds — sequential expansion', () => {
  it('sells in the agreed order: East → North → West → South', () => {
    expect(DEED_PARCELS.map((d) => d.id)).toEqual(['east', 'north', 'west', 'south']);
    expect(DEED_PARCELS.map((d) => d.price)).toEqual([150, 300, 500, 800]);
  });

  it('starts with East as the next deed', () => {
    const owned = new Set<'starter' | 'east' | 'north' | 'west' | 'south'>(['starter']);
    expect(nextDeed(owned)?.id).toBe('east');
  });

  it('refuses North before East is owned, even with plenty of coins', () => {
    const owned = new Set<'starter' | 'east' | 'north' | 'west' | 'south'>(['starter']);
    const check = checkDeedPurchase(owned, 5000);
    expect(check.ok && check.deed.id).toBe('east'); // East is always next
  });

  it('enforces the coin requirement', () => {
    const owned = new Set<'starter' | 'east' | 'north' | 'west' | 'south'>(['starter']);
    const check = checkDeedPurchase(owned, 149);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toContain('150c');
  });

  it('advances the pointer after each purchase', () => {
    const owned = new Set<'starter' | 'east' | 'north' | 'west' | 'south'>(['starter', 'east']);
    expect(nextDeed(owned)?.id).toBe('north');
    owned.add('north');
    expect(nextDeed(owned)?.id).toBe('west');
    owned.add('west');
    expect(nextDeed(owned)?.id).toBe('south');
    owned.add('south');
    expect(nextDeed(owned)).toBeNull();
    expect(checkDeedPurchase(owned, 9999).ok).toBe(false);
  });
});

describe('autotile masks', () => {
  it('composes bits N=1 E=2 S=4 W=8', () => {
    expect(maskFromNeighbors({ n: false, e: false, s: false, w: false })).toBe(0);
    expect(maskFromNeighbors({ n: true, e: false, s: false, w: false })).toBe(BIT_N);
    expect(maskFromNeighbors({ n: false, e: true, s: false, w: false })).toBe(BIT_E);
    expect(maskFromNeighbors({ n: false, e: false, s: true, w: false })).toBe(BIT_S);
    expect(maskFromNeighbors({ n: false, e: false, s: false, w: true })).toBe(BIT_W);
    expect(maskFromNeighbors({ n: true, e: true, s: true, w: true })).toBe(15);
  });

  it('grid.maskAt counts fences, paths, and barns as connectors', () => {
    const grid = new TileGrid();
    grid.placeStructure(20, 20, 'fence');
    grid.placeStructure(21, 20, 'fence');
    grid.placeStructure(23, 20, 'fence');
    grid.placeStructure(22, 20, 'fence');
    expect(grid.maskAt(21, 20, 'fence')).toBe(BIT_E | BIT_W); // fence run connected both ways
    expect(grid.maskAt(23, 20, 'fence')).toBe(BIT_W); // 23 sees the 22 fence to its west only
    expect(grid.maskAt(20, 20, 'fence')).toBe(BIT_E); // east neighbour (21,20) is a fence

    // a barn connects both fences and paths
    grid.placeBarn(30, 30, BARN_W, BARN_H, 1);
    grid.placeStructure(29, 31, 'path');
    // (30,31) is a barn tile — path sees it as connector
    expect(grid.maskAt(29, 31, 'path')).toBe(BIT_E);
  });
});

describe('grid structures', () => {
  it('fence blocks, path does not', () => {
    const grid = new TileGrid();
    grid.placeStructure(20, 20, 'fence');
    grid.placeStructure(21, 20, 'path');
    expect(grid.canStand(20, 20)).toBe(false);
    expect(grid.at(20, 20)!.blocked).toBe(true);
    expect(grid.canStand(21, 20)).toBe(true);
  });

  it('canBuildStructure rejects tilled, cropped, blocked, occupied and locked tiles', () => {
    const grid = new TileGrid();
    grid.till(20, 20);
    expect(grid.canBuildStructure(20, 20)).toBe(false);

    grid.till(21, 21);
    grid.plant(21, 21, 'turnip');
    expect(grid.canBuildStructure(21, 21)).toBe(false);

    grid.at(22, 22)!.blocked = true;
    expect(grid.canBuildStructure(22, 22)).toBe(false);

    grid.placeStructure(23, 23, 'path');
    expect(grid.canBuildStructure(23, 23)).toBe(false);

    expect(grid.canBuildStructure(32, 2)).toBe(false); // locked north parcel
  });

  it('tilling rejects structured tiles', () => {
    const grid = new TileGrid();
    grid.placeStructure(20, 20, 'fence');
    grid.placeStructure(21, 20, 'path');
    expect(grid.canTill(20, 20)).toBe(false);
    expect(grid.canTill(21, 20)).toBe(false);
  });

  it('removeStructure clears path/fence and frees the blocked flag', () => {
    const grid = new TileGrid();
    grid.placeStructure(20, 20, 'fence');
    expect(grid.removeStructure(20, 20)).toBe('fence');
    expect(grid.canStand(20, 20)).toBe(true);
    expect(grid.at(20, 20)!.structure).toBeUndefined();
    expect(grid.removeStructure(20, 20)).toBeUndefined();
  });

  it('barn footprint must be entirely valid; place and remove round-trip', () => {
    const grid = new TileGrid();
    const ax = 24;
    const ay = 18;
    expect(grid.canPlaceBarn(ax, ay, BARN_W, BARN_H)).toBe(true);

    grid.till(26, 19); // one bad tile inside the footprint
    expect(grid.canPlaceBarn(ax, ay, BARN_W, BARN_H)).toBe(false);
    expect(grid.placeBarn(ax, ay, BARN_W, BARN_H, 1)).toBe(false);

    const grid2 = new TileGrid();
    expect(grid2.placeBarn(ax, ay, BARN_W, BARN_H, 7)).toBe(true);
    for (let dy = 0; dy < BARN_H; dy += 1) {
      for (let dx = 0; dx < BARN_W; dx += 1) {
        const t = grid2.at(ax + dx, ay + dy)!;
        expect(t.structure).toBe('barn');
        expect(t.barnId).toBe(7);
        expect(t.blocked).toBe(true);
      }
    }
    grid2.removeBarn(7);
    expect(grid2.at(ax, ay)!.structure).toBeUndefined();
    expect(grid2.canStand(ax, ay)).toBe(true);
  });

  it('clearParcelDecor strips wild flowers and rocks', () => {
    const grid = new TileGrid();
    let decorSeen = 0;
    for (const t of grid.tiles) {
      if (t.parcel === 'east' && t.decor !== 0) decorSeen += 1;
    }
    expect(decorSeen).toBeGreaterThan(0);
    grid.clearParcelDecor('east');
    for (const t of grid.tiles) {
      if (t.parcel === 'east') expect(t.decor).toBe(0);
    }
  });
});
