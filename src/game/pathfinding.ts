import { WORLD_H, WORLD_W } from './constants';
import type { TileGrid } from './grid';

export interface Point {
  x: number;
  y: number;
}

/** Binary min-heap keyed by f-score. */
class MinHeap {
  private items: number[] = [];
  private scores: number[] = [];

  constructor(private scoreOf: (node: number) => number) {}

  get size(): number {
    return this.items.length;
  }

  push(node: number): void {
    this.items.push(node);
    this.scores.push(this.scoreOf(node));
    this.bubbleUp(this.items.length - 1);
  }

  pop(): number {
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastScore = this.scores.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.scores[0] = lastScore;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scores[parent] <= this.scores[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.items.length;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let smallest = i;
      if (l < n && this.scores[l] < this.scores[smallest]) smallest = l;
      if (r < n && this.scores[r] < this.scores[smallest]) smallest = r;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.scores[a], this.scores[b]] = [this.scores[b], this.scores[a]];
  }
}

const W = WORLD_W;

/**
 * A* over the tile grid, 4-directional. Returns the path from start (exclusive)
 * to target (inclusive), or null if unreachable. Standing on the target is allowed
 * (tilled soil / crops are walkable); blocked tiles are not.
 */
export function findPath(
  grid: TileGrid,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): Point[] | null {
  if (!grid.inBounds(sx, sy) || !grid.canStand(tx, ty)) return null;
  if (sx === tx && sy === ty) return [];

  const start = sy * W + sx;
  const goal = ty * W + tx;
  const gScore = new Float32Array(WORLD_W * WORLD_H).fill(Infinity);
  const cameFrom = new Int32Array(WORLD_W * WORLD_H).fill(-1);
  const closed = new Uint8Array(WORLD_W * WORLD_H);
  const fScore = new Float32Array(WORLD_W * WORLD_H).fill(Infinity);

  gScore[start] = 0;
  fScore[start] = Math.abs(tx - sx) + Math.abs(ty - sy);

  const open = new MinHeap((n) => fScore[n]);
  open.push(start);

  while (open.size > 0) {
    const current = open.pop();
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === goal) {
      const path: Point[] = [];
      let n = current;
      while (n !== start) {
        path.push({ x: n % W, y: Math.floor(n / W) });
        n = cameFrom[n];
      }
      path.reverse();
      return path;
    }

    const cx = current % W;
    const cy = Math.floor(current / W);
    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (!grid.canStand(nx, ny)) continue;
      const n = ny * W + nx;
      if (closed[n]) continue;
      const tentative = gScore[current] + 1;
      if (tentative < gScore[n]) {
        gScore[n] = tentative;
        fScore[n] = tentative + Math.abs(tx - nx) + Math.abs(ty - ny);
        cameFrom[n] = current;
        open.push(n);
      }
    }
  }

  return null;
}
