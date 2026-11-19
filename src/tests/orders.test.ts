import { describe, expect, it } from 'vitest';
import { World } from '../game/world';
import { generateOrder, parseOrders, WELCOME_ORDER } from '../game/crops';

const makeWorld = () => new World({ onUiDirty: () => {} });

describe('generateOrder', () => {
  it('starts gentle and scales with completions', () => {
    const o0 = generateOrder(0);
    expect(o0.needed).toBe(2);
    expect(o0.have).toBe(0);
    expect(o0.reward).toBeGreaterThan(0);
    expect(generateOrder(2).needed).toBe(3);
    expect(generateOrder(4).needed).toBe(4);
    expect(generateOrder(99).needed).toBeLessThanOrEqual(6); // caps out
  });

  it('reward scales with crop value', () => {
    const pumpkin = { ...generateOrder(0), crop: 'pumpkin' as const };
    const turnip = { ...generateOrder(0), crop: 'turnip' as const };
    expect(pumpkin.crop).toBe('pumpkin');
    expect(turnip.crop).toBe('turnip');
  });
});

describe('the notice board', () => {
  it('every fresh farm opens with the welcome bundle', () => {
    const w = makeWorld();
    expect(w.orders.active).toMatchObject({ crop: WELCOME_ORDER.crop, needed: 2, have: 0, reward: WELCOME_ORDER.reward });
    expect(w.orders.completed).toBe(0);
  });

  it('counts down matching harvests, ignores other crops', () => {
    const w = makeWorld();
    w.grid.till(20, 20);
    w.grid.plant(20, 20, 'turnip');
    w.orders.active = { crop: 'turnip', needed: 2, have: 0, reward: 27 };

    // a carrot pays its own way but counts nothing toward the bundle
    w.onHarvest(20, 20, 'carrot');
    expect(w.orders.active?.have).toBe(0);
    expect(w.coins).toBe(20 + 22); // carrot sale only

    w.onHarvest(20, 20, 'turnip');
    expect(w.orders.active?.have).toBe(1);
    expect(w.coins).toBe(42 + 9); // turnip sale on top
  });

  it('pays the bundle bonus and deals the next one on the final harvest', () => {
    const w = makeWorld();
    w.orders.active = { crop: 'turnip', needed: 2, have: 1, reward: 27 };
    const before = w.coins;
    w.onHarvest(31, 33, 'turnip');
    expect(w.coins).toBe(before + 9 + 27); // crop sale + bundle bonus
    expect(w.orders.completed).toBe(1);
    expect(w.orders.active).not.toBeNull(); // fresh bundle waiting
    expect(w.orders.active!.have).toBe(0);
    expect(w.orders.active!.needed).toBeGreaterThanOrEqual(2);
    expect(w.orderFresh).toBe(true);
  });

  it('the board survives being hammered by the clear tool', () => {
    const w = makeWorld();
    w.clearAt(32, 34); // ORDER_BOARD position
    expect(w.grid.at(32, 34)!.structure).toBe('board');
    expect(w.grid.at(32, 34)!.blocked).toBe(true);
  });

  it('the mayor asks nothing of wildflowers', () => {
    const w = makeWorld();
    w.orders.active = { crop: 'carrot', needed: 3, have: 1, reward: 40 };
    w.onHarvest(10, 10, 'carrot');
    expect(w.orders.active?.have).toBe(2);
  });
});

describe('parseOrders', () => {
  it('falls back to an empty board on garbage', () => {
    expect(parseOrders(null)).toEqual({ active: null, completed: 0 });
    expect(parseOrders('nonsense')).toEqual({ active: null, completed: 0 });
    expect(parseOrders({ active: { crop: 'wheat', needed: 99, have: 99, reward: 5 } }).active).toBeNull();
  });

  it('clamps have into need', () => {
    const parsed = parseOrders({ active: { crop: 'pumpkin', needed: 4, have: 99, reward: 200 }, completed: 12 });
    expect(parsed.active?.have).toBe(4);
    expect(parsed.completed).toBe(12);
  });
});
