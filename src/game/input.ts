import { TILE, VIEW_W, WORLD_H, WORLD_W } from './constants';
import type { World, ToolId } from './world';
import { sfx } from '../audio/sfx';

const DRAG_CLICK_THRESHOLD = 4; // px of screen movement before a right-press counts as a camera drag
const PAINT_TOOLS: ReadonlySet<ToolId> = new Set(['till', 'water', 'harvest', 'seeds', 'build', 'clear']);

/** Wires mouse & keyboard to the world. Canvas coordinates are mapped through the integer scale. */
export class Input {
  private painting = false;
  private lastPaintTile: string | null = null;
  private rightDown = false;
  private rightDragged = false;
  private lastRight = { x: 0, y: 0 };
  private disposed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
  ) {
    this.bind();
  }

  dispose(): void {
    this.disposed = true;
  }

  private toTile(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const scale = rect.width / VIEW_W;
    const wx = (clientX - rect.left) / scale + this.world.camera.x;
    const wy = (clientY - rect.top) / scale + this.world.camera.y;
    const x = Math.floor(wx / TILE);
    const y = Math.floor(wy / TILE);
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return null;
    return { x, y };
  }

  private applyAt(clientX: number, clientY: number): void {
    const tile = this.toTile(clientX, clientY);
    if (!tile) return;
    const key = `${tile.x},${tile.y}`;
    if (this.lastPaintTile === key) return; // don't double-fire on the same tile while dragging
    this.lastPaintTile = key;
    this.world.applyTool(tile.x, tile.y);
  }

  private bind(): void {
    const canvas = this.canvas;

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.painting = true;
        this.lastPaintTile = null;
        this.applyAt(e.clientX, e.clientY);
      } else if (e.button === 2) {
        this.rightDown = true;
        this.rightDragged = false;
        this.lastRight = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.painting = false;
        this.lastPaintTile = null;
      } else if (e.button === 2) {
        if (!this.rightDragged) {
          const tile = this.toTile(e.clientX, e.clientY);
          if (tile) this.world.rightClick(tile.x, tile.y);
        }
        this.rightDown = false;
        this.rightDragged = false;
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this.rightDown) {
        const dx = e.clientX - this.lastRight.x;
        const dy = e.clientY - this.lastRight.y;
        if (!this.rightDragged && Math.hypot(dx, dy) >= DRAG_CLICK_THRESHOLD) {
          this.rightDragged = true;
        }
        if (this.rightDragged) {
          const rect = this.canvas.getBoundingClientRect();
          const scale = rect.width / VIEW_W;
          this.world.camera.panBy(-dx / scale, -dy / scale);
        }
        this.lastRight = { x: e.clientX, y: e.clientY };
      }

      this.world.hover = this.toTile(e.clientX, e.clientY);
      if (this.painting && this.world.hover && PAINT_TOOLS.has(this.world.tool)) {
        this.applyAt(e.clientX, e.clientY);
      }
    });

    canvas.addEventListener('mouseleave', () => {
      this.world.hover = null;
      this.painting = false;
      this.lastPaintTile = null;
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (this.disposed) return;
      const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (codes.includes(e.code)) {
        this.world.keys.add(e.code);
        e.preventDefault();
        return;
      }
      if (e.code === 'Escape') {
        if (this.world.orderCardOpen) this.world.closeOrderCard();
        else if (this.world.seedsOpen || this.world.buildOpen) this.world.closePopups();
        else this.world.setTool('inspect');
        sfx.ui();
        return;
      }
      if (e.code === 'Digit5') {
        this.world.toggleSeeds();
        sfx.ui();
        return;
      }
      if (e.code === 'Digit6') {
        this.world.toggleBuild();
        sfx.ui();
        return;
      }
      const slotTools: ToolId[] = ['inspect', 'till', 'water', 'harvest', 'seeds', 'build', 'clear'];
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= 7) {
          const tool = slotTools[n - 1];
          if (tool === 'seeds') this.world.toggleSeeds();
          else if (tool === 'build') this.world.toggleBuild();
          else this.world.setTool(tool);
          sfx.ui();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.world.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.world.keys.clear();
      this.painting = false;
    });
  }
}
