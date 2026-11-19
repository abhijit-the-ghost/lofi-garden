import { describe, expect, it } from 'vitest';
import { TileGrid } from '../game/grid';
import { findPath } from '../game/pathfinding';
import { WORLD_W } from '../game/constants';

describe('findPath', () => {
  it('returns an empty path when start equals target', () => {
    const grid = new TileGrid();
    expect(findPath(grid, 20, 20, 20, 20)).toEqual([]);
  });

  it('finds a straight-line path on open ground', () => {
    const grid = new TileGrid();
    const path = findPath(grid, 20, 20, 24, 20);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(4);
    expect(path![path!.length - 1]).toEqual({ x: 24, y: 20 });
  });

  it('routes around blocked tiles', () => {
    const grid = new TileGrid();
    // Wall off x=22 for y in [18..22], leaving a gap at y=23
    for (let y = 18; y <= 22; y += 1) {
      grid.at(22, y)!.blocked = true;
    }
    const path = findPath(grid, 20, 20, 24, 20);
    expect(path).not.toBeNull();
    for (const p of path!) {
      expect(grid.at(p.x, p.y)!.blocked).toBe(false);
    }
    expect(path![path!.length - 1]).toEqual({ x: 24, y: 20 });
    // Must detour around the wall (above y=18 or below y=22), never through it
    expect(path!.some((p) => p.y < 18 || p.y > 22)).toBe(true);
    expect(path!.some((p) => p.x === 22 && p.y >= 18 && p.y <= 22)).toBe(false);
  });

  it('returns null when the target is blocked', () => {
    const grid = new TileGrid();
    grid.at(30, 30)!.blocked = true;
    expect(findPath(grid, 20, 20, 30, 30)).toBeNull();
  });

  it('returns null when the goal is fully enclosed', () => {
    const grid = new TileGrid();
    const tx = 30;
    const ty = 30;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      grid.at(tx + dx, ty + dy)!.blocked = true;
    }
    expect(findPath(grid, 20, 20, tx, ty)).toBeNull();
  });

  it('paths onto tilled soil (walkable)', () => {
    const grid = new TileGrid();
    grid.till(25, 25);
    const path = findPath(grid, 20, 20, 25, 25);
    expect(path).not.toBeNull();
    expect(path![path!.length - 1]).toEqual({ x: 25, y: 25 });
  });

  it('stays inside the world bounds', () => {
    const grid = new TileGrid();
    const path = findPath(grid, 0, 0, WORLD_W - 1, 47)!;
    expect(path).not.toBeNull();
    for (const p of path) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
    }
  });
});
