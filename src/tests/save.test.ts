import { beforeEach, describe, expect, it } from 'vitest';
import { World } from '../game/world';
import {
  applySavedGame,
  clearSave,
  parseSave,
  readSave,
  saveGame,
  SAVE_KEY,
  CORRUPT_BACKUP_KEY,
  SAVE_VERSION,
} from '../game/save';
import { BARN_W, BARN_H } from '../game/constants';

// Minimal localStorage shim for the node test environment
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

beforeEach(() => {
  store.clear();
});

const makeWorld = () => new World({ onUiDirty: () => {} });

describe('save → load roundtrip', () => {
  it('restores coins, soil, crops, structures, barn, deeds and stats', () => {
    const w = makeWorld();
    w.coins = 77;
    w.stats.harvested = 3;
    w.stats.earned = 45;
    w.grid.till(20, 20);
    w.grid.water(20, 20);
    w.grid.plant(20, 20, 'turnip');
    w.grid.at(20, 20)!.crop!.growth = 44.4;
    w.grid.at(20, 20)!.moisture = 0.8;
    w.grid.placeStructure(21, 20, 'fence');
    w.grid.placeStructure(22, 20, 'path');
    w.grid.unlocked.add('east');
    w.ownedDeeds.add('east');
    w.grid.clearParcelDecor('east');
    w.grid.placeBarn(40, 27, BARN_W, BARN_H, 1);
    w.barns.push({ id: 1, x: 40, y: 27 });
    w.restoreBarns([], 2); // keep id counter sane for the save
    w.queue.add('till', 30, 30);
    expect(saveGame(w)).toBe(true);

    const fresh = makeWorld();
    expect(applySavedGame(fresh)).toBe('loaded');
    expect(fresh.coins).toBe(77);
    expect(fresh.stats).toEqual({ harvested: 3, earned: 45 });
    expect(fresh.grid.at(20, 20)!.tilled).toBe(true);
    expect(fresh.grid.at(20, 20)!.moisture).toBe(0.8);
    expect(fresh.grid.at(20, 20)!.crop).toEqual({ crop: 'turnip', growth: 44.4 });
    expect(fresh.grid.at(21, 20)!.structure).toBe('fence');
    expect(fresh.grid.at(21, 20)!.blocked).toBe(true);
    expect(fresh.grid.at(22, 20)!.structure).toBe('path');
    expect(fresh.barns).toEqual([{ id: 1, x: 40, y: 27 }]);
    expect(fresh.grid.at(40, 27)!.blocked).toBe(true);
    expect(fresh.grid.isUnlocked('east')).toBe(true);
    expect(fresh.currentQueueCap()).toBe(48); // barn bonus survives
    expect(fresh.queue.size).toBe(1);
    expect(fresh.queue.peek()).toMatchObject({ type: 'till', x: 30, y: 30 });
    // purchased land lost its wild decor in the roundtrip
    for (const t of fresh.grid.tiles) {
      if (t.parcel === 'east') expect(t.decor).toBe(0);
    }
  });

  it('restored barn ids keep climbing (no id reuse)', () => {
    const w = makeWorld();
    w.grid.placeBarn(40, 27, BARN_W, BARN_H, 7);
    w.barns.push({ id: 7, x: 40, y: 27 });
    w.restoreBarns([], 8);
    saveGame(w);

    const fresh = makeWorld();
    applySavedGame(fresh);
    expect(fresh.barnIdCounter).toBe(8);
  });

  it('crops keep their growth while the page was closed', () => {
    const w = makeWorld();
    w.grid.till(20, 20);
    w.grid.plant(20, 20, 'turnip'); // growTime 45 — 45+ means ripe
    w.grid.water(20, 20);
    w.grid.at(20, 20)!.crop!.growth = 45;
    saveGame(w);

    const fresh = makeWorld();
    applySavedGame(fresh);
    expect(fresh.grid.at(20, 20)!.crop!.growth).toBe(45);
    expect(fresh.grid.canHarvest(20, 20)).toBe(true); // ripe turnips wait for you
  });

  it('a corrupt save is set aside and the farm starts fresh', () => {
    store.set(SAVE_KEY, '{{{{ not json');
    const fresh = makeWorld();
    expect(applySavedGame(fresh)).toBe('failed');
    expect(store.get(CORRUPT_BACKUP_KEY)).toBe('{{{{ not json');
    expect(store.get(SAVE_KEY)).toBeUndefined();
    expect(fresh.coins).toBe(20); // starter coins, untouched
  });

  it('a save from another version is rejected, not half-applied', () => {
    // a version from the future is refuse-at-the-door territory
    store.set(SAVE_KEY, JSON.stringify({ version: 3, coins: 9999, tiles: 'garbage' }));
    const fresh = makeWorld();
    expect(applySavedGame(fresh)).toBe('failed');
    expect(fresh.coins).toBe(20);
  });

  it('returns fresh when no save exists', () => {
    expect(applySavedGame(makeWorld())).toBe('fresh');
  });

  it('a v1 save migrates forward with the board already waiting', () => {
    const w = makeWorld();
    w.coins = 88;
    w.grid.till(20, 20);
    saveGame(w);
    const raw = JSON.parse(store.get(SAVE_KEY)!) as Record<string, unknown>;
    delete raw.elapsed;
    delete raw.orders;
    raw.version = 1;
    store.set(SAVE_KEY, JSON.stringify(raw));

    const fresh = makeWorld();
    expect(applySavedGame(fresh)).toBe('loaded');
    expect(fresh.coins).toBe(88);
    expect(fresh.elapsed).toBe(0);
    expect(fresh.orders.active).not.toBeNull(); // welcome bundle dealt on migration
    expect(fresh.orders.completed).toBe(0);
  });

  it('a v2 save keeps the day clock and the mayor’s ledger', () => {
    const w = makeWorld();
    w.elapsed = 137.5;
    w.orders.active = { crop: 'carrot', needed: 3, have: 2, reward: 33 };
    w.orders.completed = 5;
    saveGame(w);

    const fresh = makeWorld();
    applySavedGame(fresh);
    expect(fresh.elapsed).toBeCloseTo(137.5, 1);
    expect(fresh.orders.active).toEqual({ crop: 'carrot', needed: 3, have: 2, reward: 33 });
    expect(fresh.orders.completed).toBe(5);
  });
});

describe('parseSave hardening', () => {
  it('sanitizes deed lists to a contiguous prefix, ignoring input order', () => {
    const save = parseSave({ version: SAVE_VERSION, coins: 500, deeds: ['west', 'east', 'north'] })!;
    expect(save.deeds).toEqual(['east', 'north', 'west']); // order repaired, prefix complete
    const partial = parseSave({ version: SAVE_VERSION, coins: 500, deeds: ['west', 'south'] })!;
    expect(partial.deeds).toEqual([]); // west without east/north is dropped — deeds sell in order
    const gap = parseSave({ version: SAVE_VERSION, coins: 500, deeds: ['south', 'east'] })!;
    expect(gap.deeds).toEqual(['east']); // prefix stops at the first missing deed
  });

  it('clamps nonsense values instead of trusting them', () => {
    const save = parseSave({
      version: SAVE_VERSION,
      coins: 999_999_999_999,
      deeds: 'not-an-array',
      tiles: [{ i: 99999, tilled: true }, { i: 5, moisture: 42 }, { i: 7, crop: { crop: 'wheat', growth: 5 } }],
      barns: [{ id: 3, x: 500, y: -4 }],
      queue: [
        { type: 'plant', x: 1, y: 1, crop: 'turnip' },
        { type: 'plant', x: 1, y: 1, crop: 'carrot' }, // dupe tile+type → collapsed
        { type: 'build', x: 2, y: 2 }, // missing payload → dropped
      ],
      stats: { harvested: -50, earned: Infinity },
    })!;
    expect(save.coins).toBe(1_000_000_000);
    expect(save.deeds).toEqual([]);
    // out-of-range tile dropped; moisture clamped to 1; unknown crop dropped
    expect(save.tiles.find((t) => t.i === 99999)).toBeUndefined();
    expect(save.tiles.find((t) => t.i === 5)?.moisture).toBe(1);
    expect(save.tiles.find((t) => t.i === 7)?.crop).toBeUndefined();
    // barn anchor clamped into the world
    expect(save.barns).toEqual([{ id: 3, x: 60, y: 0 }]);
    expect(save.queue).toEqual([{ type: 'plant', x: 1, y: 1, crop: 'turnip' }]);
    expect(save.stats).toEqual({ harvested: 0, earned: 0 });
  });

  it('emits a readable file shape', () => {
    const w = makeWorld();
    w.coins = 42;
    saveGame(w);
    const raw = readSave()!;
    expect(raw.version).toBe(SAVE_VERSION);
    expect(raw.coins).toBe(42);
    expect(raw.deeds).toEqual([]);
    expect(raw.farmer).toEqual({ x: 32, y: 24 });
  });

  it('clearSave wipes both keys', () => {
    store.set(SAVE_KEY, '{}');
    store.set(CORRUPT_BACKUP_KEY, 'junk');
    clearSave();
    expect(store.size).toBe(0);
  });
});
