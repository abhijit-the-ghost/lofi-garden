import { describe, expect, it } from 'vitest';
import { World } from '../game/world';

const makeWorld = () => new World({ onUiDirty: () => {} });

describe('rain', () => {
  it('soaks every owned tilled tile while it falls', () => {
    const w = makeWorld();
    w.grid.till(20, 20);
    w.grid.till(25, 25);
    w.grid.till(40, 10);
    w.triggerRain(10);
    expect(w.isRaining()).toBe(true);
    w.update(0.1);
    expect(w.grid.at(20, 20)!.moisture).toBe(1);
    expect(w.grid.at(25, 25)!.moisture).toBe(1);
    expect(w.grid.at(40, 10)!.moisture).toBe(1);
  });

  it('leaves untilled ground alone', () => {
    const w = makeWorld();
    w.triggerRain(10);
    w.update(0.1);
    expect(w.grid.at(20, 20)!.moisture).toBe(0);
  });

  it('dries up when the sky is done', () => {
    const w = makeWorld();
    w.triggerRain(0.05);
    w.update(0.1);
    expect(w.isRaining()).toBe(false);
  });

  it('the farmer keeps working through the shower', () => {
    const w = makeWorld();
    w.grid.till(20, 20);
    w.queue.add('plant', 20, 20, 'turnip');
    w.triggerRain(5);
    for (let i = 0; i < 60 * 12 && !w.grid.at(20, 20)!.crop; i += 1) w.update(1 / 60);
    expect(w.grid.at(20, 20)!.crop?.crop).toBe('turnip');
  });
});

describe('sprinklers', () => {
  const NEIGHBOURS: [number, number][] = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1],
  ];

  it('mists its 3×3 on the 30 s tick', () => {
    const w = makeWorld();
    for (const [dx, dy] of NEIGHBOURS) w.grid.till(20 + dx, 20 + dy);
    w.grid.placeStructure(20, 20, 'sprinkler');
    w.sprinklers.push({ x: 20, y: 20, timer: 29.95 });
    w.update(0.2);
    for (const [dx, dy] of NEIGHBOURS) {
      expect(w.grid.at(20 + dx, 20 + dy)!.moisture).toBe(1);
    }
  });

  it('owns up — a sprayed garden reports moisture only where soil exists', () => {
    const w = makeWorld();
    // till only half the neighbourhood
    w.grid.till(19, 20);
    w.grid.till(21, 20);
    w.grid.placeStructure(20, 20, 'sprinkler');
    w.sprinklers.push({ x: 20, y: 20, timer: 29.95 });
    w.update(0.2);
    expect(w.grid.at(19, 20)!.moisture).toBe(1);
    expect(w.grid.at(21, 20)!.moisture).toBe(1);
    expect(w.grid.at(20, 19)!.moisture).toBe(0); // grass stays dry — nobody asked for this
  });

  it('clearing a sprinkler drops it from the roster', () => {
    const w = makeWorld();
    w.grid.placeStructure(20, 20, 'sprinkler');
    w.sprinklers.push({ x: 20, y: 20, timer: 0 });
    w.clearAt(20, 20);
    expect(w.sprinklers).toHaveLength(0);
    expect(w.grid.at(20, 20)!.structure).toBeUndefined();
  });
});
