import { QUEUE_CAP, type BuildableId } from './constants';
import type { CropId } from './crops';

export type TaskType = 'till' | 'water' | 'harvest' | 'plant' | 'build';

export interface Task {
  id: number;
  type: TaskType;
  x: number;
  y: number;
  /** Seed variety — only set for plant tasks. */
  crop?: CropId;
  /** What to build — only set for build tasks. */
  build?: BuildableId;
}

export type AddResult = 'added' | 'duplicate' | 'full';

/**
 * FIFO task queue. Pure — no DOM, no grid knowledge; tile validity is checked
 * by callers. Dedupe is per (tile, type): chaining till → plant → water on the
 * same tile is allowed, queueing the same action twice on a tile is not.
 */
export class TaskQueue {
  private tasks: Task[] = [];
  private nextId = 1;

  constructor(private cap = QUEUE_CAP) {}

  get size(): number {
    return this.tasks.length;
  }

  get capacity(): number {
    return this.cap;
  }

  list(): readonly Task[] {
    return this.tasks;
  }

  peek(): Task | undefined {
    return this.tasks[0];
  }

  hasAt(x: number, y: number, type: TaskType): boolean {
    return this.tasks.some((t) => t.x === x && t.y === y && t.type === type);
  }

  add(type: TaskType, x: number, y: number, crop?: CropId, build?: BuildableId): AddResult {
    if (this.hasAt(x, y, type)) return 'duplicate';
    if (this.tasks.length >= this.cap) return 'full';
    this.tasks.push({ id: this.nextId, type, x, y, crop, build });
    this.nextId += 1;
    return 'added';
  }

  /** Adjust the cap (barn bonus). Existing tasks are kept; the cap only gates adds. */
  setCapacity(cap: number): void {
    this.cap = Math.max(1, Math.floor(cap));
  }

  /** Remove the queue's next task (consumed by the farmer). */
  shift(): Task | undefined {
    return this.tasks.shift();
  }

  removeById(id: number): Task | undefined {
    const i = this.tasks.findIndex((t) => t.id === id);
    if (i === -1) return undefined;
    return this.tasks.splice(i, 1)[0];
  }

  removeAtTile(x: number, y: number): Task[] {
    const removed: Task[] = [];
    for (let i = 0; i < this.tasks.length; ) {
      if (this.tasks[i].x === x && this.tasks[i].y === y) {
        removed.push(this.tasks[i]);
        this.tasks.splice(i, 1);
      } else {
        i += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.tasks = [];
  }
}
