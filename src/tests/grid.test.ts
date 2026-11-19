import { describe, expect, it } from 'vitest';
import { TileGrid, parcelAt, hash2 } from '../game/grid';
import { STARTER, WORLD_W, WORLD_H } from '../game/constants';

describe('parcelAt', () => {
  it('assigns the starter plot interior to starter', () => {
    expect(parcelAt(STARTER.x, STARTER.y)).toBe('starter');
    expect(parcelAt(STARTER.x + STARTER.w - 1, STARTER.y + STARTER.h - 1)).toBe('starter');
  });

  it('assigns each wild strip to its deed parcel', () => {
    expect(parcelAt(32, 0)).toBe('north');
    expect(parcelAt(32, WORLD_H - 1)).toBe('south');
    expect(parcelAt(0, 24)).toBe('west');
    expect(parcelAt(WORLD_W - 1, 24)).toBe('east');
  });

  it('assigns corner regions to the vertical strips', () => {
    expect(parcelAt(0, 0)).toBe('north');
    expect(parcelAt(WORLD_W - 1, WORLD_H - 1)).toBe('south');
  });
});

describe('TileGrid', () => {
  it('has the full world dimensions', () => {
    const grid = new TileGrid();
    expect(grid.tiles.length).toBe(WORLD_W * WORLD_H);
  });

  it('starter parcel is unlocked, wild parcels are locked', () => {
    const grid = new TileGrid();
    expect(grid.isUnlocked('starter')).toBe(true);
    expect(grid.isUnlocked('east')).toBe(false);
    expect(grid.isUnlocked('north')).toBe(false);
  });

  it('canTill accepts fresh starter grass', () => {
    const grid = new TileGrid();
    expect(grid.canTill(20, 20)).toBe(true);
  });

  it('canTill rejects wild (locked) tiles', () => {
    const grid = new TileGrid();
    expect(grid.canTill(32, 2)).toBe(false); // north parcel
  });

  it('canTill rejects already-tilled tiles', () => {
    const grid = new TileGrid();
    grid.till(20, 20);
    expect(grid.canTill(20, 20)).toBe(false);
  });

  it('canTill rejects out-of-bounds tiles', () => {
    const grid = new TileGrid();
    expect(grid.canTill(-1, 0)).toBe(false);
    expect(grid.canTill(WORLD_W, 0)).toBe(false);
  });

  it('blocked tiles reject tilling and standing', () => {
    const grid = new TileGrid();
    grid.at(20, 20)!.blocked = true;
    expect(grid.canTill(20, 20)).toBe(false);
    expect(grid.canStand(20, 20)).toBe(false);
  });

  it('till() marks the tile and reports success', () => {
    const grid = new TileGrid();
    expect(grid.till(20, 20)).toBe(true);
    expect(grid.at(20, 20)!.tilled).toBe(true);
    expect(grid.till(20, 20)).toBe(false);
  });

  it('hash2 is deterministic and varies across inputs', () => {
    expect(hash2(1, 2, 3)).toBe(hash2(1, 2, 3));
    expect(hash2(1, 2, 3)).not.toBe(hash2(1, 2, 4));
    expect(hash2(1, 2, 3)).not.toBe(hash2(2, 1, 3));
  });

  it('tiles have deterministic variants across constructions', () => {
    const a = new TileGrid();
    const b = new TileGrid();
    for (let i = 0; i < a.tiles.length; i += 97) {
      expect(a.tiles[i].variant).toBe(b.tiles[i].variant);
      expect(a.tiles[i].decor).toBe(b.tiles[i].decor);
    }
  });
});
