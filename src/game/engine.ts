import type { Renderer } from './renderer';
import type { World } from './world';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

/** Fixed-timestep loop: update at 60 Hz, render once per rAF. */
export class Engine {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;

  constructor(
    private world: World,
    private renderer: Renderer,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (t: number) => {
      if (!this.running) return;
      let dt = (t - this.last) / 1000;
      this.last = t;
      if (dt > MAX_FRAME) dt = MAX_FRAME;
      this.acc += dt;
      while (this.acc >= STEP) {
        this.world.update(STEP);
        this.acc -= STEP;
      }
      this.renderer.render(this.world);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
