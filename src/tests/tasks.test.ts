import { describe, expect, it } from 'vitest';
import { TaskQueue } from '../game/tasks';

describe('TaskQueue', () => {
  it('adds and lists tasks FIFO', () => {
    const q = new TaskQueue(32);
    expect(q.add('till', 3, 4)).toBe('added');
    expect(q.add('till', 5, 6)).toBe('added');
    expect(q.list().map((t) => [t.x, t.y])).toEqual([
      [3, 4],
      [5, 6],
    ]);
    expect(q.shift()).toMatchObject({ x: 3, y: 4 });
    expect(q.peek()).toMatchObject({ x: 5, y: 6 });
  });

  it('rejects duplicate tiles', () => {
    const q = new TaskQueue(32);
    q.add('till', 3, 4);
    expect(q.add('till', 3, 4)).toBe('duplicate');
    expect(q.size).toBe(1);
  });

  it('enforces the capacity cap', () => {
    const q = new TaskQueue(2);
    q.add('till', 0, 0);
    q.add('till', 1, 1);
    expect(q.add('till', 2, 2)).toBe('full');
    expect(q.size).toBe(2);
  });

  it('removes by id and by tile', () => {
    const q = new TaskQueue(32);
    q.add('till', 7, 8);
    const id = q.list()[0].id;
    expect(q.removeById(id)).toMatchObject({ id });
    expect(q.removeById(id)).toBeUndefined();

    q.add('till', 9, 9);
    expect(q.removeAtTile(9, 9).map((t) => t.type)).toEqual(['till']);
    expect(q.removeAtTile(9, 9)).toEqual([]);
  });

  it('removes chained tasks of different types on the same tile', () => {
    const q = new TaskQueue(32);
    q.add('till', 3, 3);
    q.add('plant', 3, 3, 'turnip');
    q.add('water', 3, 3);
    expect(q.size).toBe(3);
    expect(q.removeAtTile(3, 3).map((t) => t.type)).toEqual(['till', 'plant', 'water']);
    expect(q.size).toBe(0);
  });

  it('allows the same action type only once per tile, different types chain', () => {
    const q = new TaskQueue(32);
    expect(q.add('till', 3, 3)).toBe('added');
    expect(q.add('till', 3, 3)).toBe('duplicate');
    expect(q.add('plant', 3, 3, 'carrot')).toBe('added');
    expect(q.add('plant', 3, 3, 'turnip')).toBe('duplicate'); // one plant task per tile
  });

  it('hasAt reflects pending tasks only', () => {
    const q = new TaskQueue(32);
    q.add('till', 4, 4);
    expect(q.hasAt(4, 4, 'till')).toBe(true);
    expect(q.hasAt(4, 4, 'water')).toBe(false);
    q.shift();
    expect(q.hasAt(4, 4, 'till')).toBe(false);
  });

  it('assigns increasing unique ids', () => {
    const q = new TaskQueue(32);
    q.add('till', 0, 0);
    q.add('till', 1, 1);
    const ids = q.list().map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[1]).toBeGreaterThan(ids[0]);
  });
});
