import { CAMERA_SPEED, VIEW_H, VIEW_W, WORLD_PX_H, WORLD_PX_W } from './constants';

export class Camera {
  x = 0;
  y = 0;

  constructor() {
    this.centerOn(WORLD_PX_W / 2, WORLD_PX_H / 2);
  }

  centerOn(px: number, py: number): void {
    this.x = px - VIEW_W / 2;
    this.y = py - VIEW_H / 2;
    this.clamp();
  }

  /** Move by a screen-space delta (already divided by the integer scale). */
  panBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  update(dt: number, keys: ReadonlySet<string>): void {
    let dx = 0;
    let dy = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
    if (dx === 0 && dy === 0) return;
    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      dx *= inv;
      dy *= inv;
    }
    this.x += dx * CAMERA_SPEED * dt;
    this.y += dy * CAMERA_SPEED * dt;
    this.clamp();
  }

  private clamp(): void {
    this.x = Math.max(0, Math.min(WORLD_PX_W - VIEW_W, this.x));
    this.y = Math.max(0, Math.min(WORLD_PX_H - VIEW_H, this.y));
  }
}
