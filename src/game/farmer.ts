import { FARMER_SPEED, FARMER_TILE, TILE } from './constants';
import { findPath, type Point } from './pathfinding';
import type { TileGrid } from './grid';
import type { TaskQueue, Task } from './tasks';
import type { Particles } from './particles';
import type { CropId } from './crops';
import { sfx } from '../audio/sfx';

export type FarmerState = 'idle' | 'walking' | 'working';

export interface FarmerWorld {
  grid: TileGrid;
  queue: TaskQueue;
  particles: Particles;
  /** Called whenever UI-visible state changes (task started/finished, state flip). */
  onUiDirty: () => void;
  /** True while a queued task can be executed right now. */
  isTaskValid(task: Task): boolean;
  /** A paid task failed to execute (e.g. soil not tilled yet) — refund it. */
  onTaskRefunded(task: Task): void;
  /** A crop was harvested — credit coins and celebrate. */
  onHarvest(x: number, y: number, crop: CropId): void;
  /** A build task's hoe comes down — place the structure and celebrate. */
  onBuildPlaced(task: Task): void;
  /** If the farmer is standing inside something that just became blocked, step him aside. */
  nudgeFarmerIfStuck(): void;
}

const WORK_DURATION = 0.9;
const STRIKE_FRACTION = 0.5; // the hoe/hammer lands halfway through the swing

export class Farmer {
  tileX: number = FARMER_TILE.x;
  tileY: number = FARMER_TILE.y;
  /** World-pixel position (top-left of a 16px foot cell), smooth. */
  px = FARMER_TILE.x * TILE;
  py = FARMER_TILE.y * TILE;
  state: FarmerState = 'idle';
  facing: 1 | -1 = 1;
  animTime = 0;

  private path: Point[] = [];
  private activeTask: Task | null = null;
  private workTimer = 0;
  private workDuration = WORK_DURATION;
  private struck = false;

  get currentTask(): Task | null {
    return this.activeTask;
  }

  /** Cancel the in-flight task (e.g. user clicked its chip). Returns to idle. */
  cancelActive(): boolean {
    if (!this.activeTask) return false;
    this.activeTask = null;
    this.path = [];
    this.state = 'idle';
    this.workTimer = 0;
    return true;
  }

  /** Path-boost: paths give ~35% extra strolling speed. */
  private moveSpeed(world: FarmerWorld): number {
    const cx = Math.floor(this.px / TILE);
    const cy = Math.floor(this.py / TILE);
    const tile = world.grid.at(cx, cy);
    return tile?.structure === 'path' ? FARMER_SPEED * 1.35 : FARMER_SPEED;
  }

  update(world: FarmerWorld, dt: number): void {
    this.animTime += dt;

    if (this.state === 'idle') {
      this.tryStartNext(world);
      return;
    }

    if (this.state === 'walking') {
      const target = this.path[0];
      if (!target) {
        this.arrive(world);
        return;
      }
      const goalX = target.x * TILE;
      const goalY = target.y * TILE;
      const dx = goalX - this.px;
      const dy = goalY - this.py;
      const dist = Math.hypot(dx, dy);
      const step = this.moveSpeed(world) * dt;
      if (dist <= step) {
        this.px = goalX;
        this.py = goalY;
        this.tileX = target.x;
        this.tileY = target.y;
        this.path.shift();
        if (this.path.length === 0) this.arrive(world);
      } else {
        this.px += (dx / dist) * step;
        this.py += (dy / dist) * step;
        this.facing = dx >= 0 ? 1 : -1;
      }
      return;
    }

    // working (hoe/hammer swing — used for every task type)
    this.workTimer += dt;
    if (!this.struck && this.workTimer >= this.workDuration * STRIKE_FRACTION && this.activeTask) {
      this.struck = true;
      this.applyStrike(world, this.activeTask);
    }
    if (this.workTimer >= this.workDuration) {
      this.activeTask = null;
      this.state = 'idle';
      this.workTimer = 0;
      this.struck = false;
      world.nudgeFarmerIfStuck(); // in case the task just blocked the tile underneath him
      world.onUiDirty();
    }
  }

  private applyStrike(world: FarmerWorld, task: Task): void {
    const cx = task.x * TILE + TILE / 2;
    const cy = task.y * TILE + TILE / 2;
    switch (task.type) {
      case 'till':
        world.grid.till(task.x, task.y);
        world.particles.burst('dirt', cx, task.y * TILE + TILE - 2, 7);
        sfx.till();
        break;
      case 'water':
        world.grid.water(task.x, task.y);
        world.particles.burst('drop', cx, cy - 2, 8);
        sfx.water();
        break;
      case 'plant': {
        const crop = task.crop;
        if (crop && world.grid.plant(task.x, task.y, crop)) {
          world.particles.burst('dirt', cx, task.y * TILE + TILE - 2, 4);
          sfx.plant();
        }
        break;
      }
      case 'harvest': {
        const crop = world.grid.harvest(task.x, task.y);
        world.particles.burst('sparkle', cx, cy, 6);
        if (crop) {
          world.onHarvest(task.x, task.y, crop);
          sfx.harvest();
        }
        break;
      }
      case 'build':
        // The satisfying thunk — structure materializes with a ring of motes.
        world.onBuildPlaced(task);
        world.particles.burst('dirt', cx, task.y * TILE + TILE - 2, 6);
        world.particles.burst('sparkle', cx, cy, 6);
        break;
    }
  }

  private tryStartNext(world: FarmerWorld): void {
    for (;;) {
      const task = world.queue.peek();
      if (!task) return;
      // Task no longer actionable (chain changed, tile state moved on) — drop it.
      if (!world.isTaskValid(task)) {
        world.queue.shift();
        world.onTaskRefunded(task);
        world.onUiDirty();
        continue;
      }
      const path = findPath(world.grid, this.tileX, this.tileY, task.x, task.y);
      if (!path) {
        world.queue.shift();
        world.onTaskRefunded(task);
        world.onUiDirty();
        continue;
      }
      world.queue.shift();
      this.activeTask = task;
      this.path = path;
      this.workDuration = task.type === 'build' ? (task.build === 'barn' ? 1.6 : 1.0) : WORK_DURATION;
      this.state = path.length === 0 ? 'idle' : 'walking';
      if (path.length === 0) {
        this.startWork();
      }
      world.onUiDirty();
      return;
    }
  }

  private arrive(world: FarmerWorld): void {
    this.startWork();
    world.onUiDirty();
  }

  private startWork(): void {
    this.state = 'working';
    this.workTimer = 0;
    this.struck = false;
  }

  /** Pixel position for render (feet anchor). */
  renderX(): number {
    return this.px;
  }

  renderY(): number {
    return this.py;
  }
}
