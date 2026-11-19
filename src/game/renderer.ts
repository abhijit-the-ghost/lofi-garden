import { TILE, VIEW_H, VIEW_W, WORLD_H, WORLD_W, BARN_H, BARN_W, ORDER_BOARD } from './constants';
import { stageFor } from './crops';
import { nightFactorAt, tintAtElapsed } from './lighting';
import type { AssetManifest } from './assets';
import type { World } from './world';

/** Renders the world to the canvas. All coordinates are rounded to whole pixels. */
export class Renderer {
  constructor(
    private canvas: HTMLCanvasElement,
    private assets: AssetManifest,
  ) {}

  render(world: World): void {
    const ctx = this.canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const camX = Math.round(world.camera.x);
    const camY = Math.round(world.camera.y);

    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    this.drawTiles(ctx, world, camX, camY);
    this.drawQueuedMarkers(ctx, world, camX, camY);
    this.drawEntities(ctx, world, camX, camY);
    this.drawParticles(ctx, world, camX, camY);
    this.drawFloaters(ctx, world, camX, camY);
    this.drawBuildGhost(ctx, world, camX, camY);
    this.drawHover(ctx, world, camX, camY);
    this.drawPinnedMarker(ctx, world, camX, camY);
    this.drawPetals(ctx, world, camX, camY);
    this.drawLighting(ctx, world, camX, camY);
    this.drawSkyEffects(ctx, world, camX, camY);
  }

  private drawTiles(
    ctx: CanvasRenderingContext2D,
    world: World,
    camX: number,
    camY: number,
  ): void {
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const x1 = Math.min(WORLD_W - 1, Math.floor((camX + VIEW_W) / TILE));
    const y1 = Math.min(WORLD_H - 1, Math.floor((camY + VIEW_H) / TILE));

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const tile = world.grid.at(x, y)!;
        const dx = x * TILE - camX;
        const dy = y * TILE - camY;
        // Purchased deed parcels become honest starter grass again
        const wild = tile.parcel !== 'starter' && !world.grid.isUnlocked(tile.parcel);

        if (tile.tilled) {
          ctx.drawImage(this.assets.tilled, dx, dy);
          // moist soil drinks the light — darken proportionally
          if (tile.moisture > 0.02) {
            ctx.fillStyle = `rgba(26, 16, 8, ${Math.min(0.5, tile.moisture * 0.5)})`;
            ctx.fillRect(dx, dy, TILE, TILE);
          }
          if (tile.crop) {
            const stage = stageFor(tile.crop.crop, tile.crop.growth);
            ctx.drawImage(this.assets.crops[tile.crop.crop][stage], dx, dy);
          }
          continue;
        }
        if (wild) {
          const base = this.assets.wild.base[tile.variant];
          ctx.drawImage(base, dx, dy);
          if (tile.decor === 1) ctx.drawImage(this.assets.wild.flowerPink, dx, dy);
          else if (tile.decor === 2) ctx.drawImage(this.assets.wild.flowerYellow, dx, dy);
          else if (tile.decor === 3) ctx.drawImage(this.assets.wild.rock, dx, dy);
          // subtle cool veil so locked meadows read as "not yours yet"
          ctx.fillStyle = 'rgba(38, 34, 52, 0.22)';
          ctx.fillRect(dx, dy, TILE, TILE);
        } else {
          ctx.drawImage(this.assets.grass[tile.variant], dx, dy);
        }
        // paths sit flat on the ground — drawn after the base, before entities
        if (tile.structure === 'path') {
          const mask = world.grid.maskAt(x, y, 'path');
          ctx.drawImage(this.assets.paths[mask], dx, dy);
        }
      }
    }
  }

  private drawQueuedMarkers(
    ctx: CanvasRenderingContext2D,
    world: World,
    camX: number,
    camY: number,
  ): void {
    const t = world.elapsed;
    const pulse = 0.55 + 0.35 * Math.sin(t * 5);
    for (const task of world.queue.list()) {
      const dx = task.x * TILE - camX;
      const dy = task.y * TILE - camY;
      // corner brackets in warm gold
      ctx.strokeStyle = `rgba(255, 214, 130, ${pulse})`;
      ctx.lineWidth = 1;
      const s = 4;
      const o = 2;
      ctx.beginPath();
      // top-left
      ctx.moveTo(dx + o, dy + o + s); ctx.lineTo(dx + o, dy + o); ctx.lineTo(dx + o + s, dy + o);
      // top-right
      ctx.moveTo(dx + TILE - o - s, dy + o); ctx.lineTo(dx + TILE - o, dy + o); ctx.lineTo(dx + TILE - o, dy + o + s);
      // bottom-left
      ctx.moveTo(dx + o, dy + TILE - o - s); ctx.lineTo(dx + o, dy + TILE - o); ctx.lineTo(dx + o + s, dy + TILE - o);
      // bottom-right
      ctx.moveTo(dx + TILE - o - s, dy + TILE - o); ctx.lineTo(dx + TILE - o, dy + TILE - o); ctx.lineTo(dx + TILE - o, dy + TILE - o - s);
      ctx.stroke();
    }
  }

  private drawEntities(
    ctx: CanvasRenderingContext2D,
    world: World,
    camX: number,
    camY: number,
  ): void {
    // Y-sorted draw list: deed signs + fences + barns + the farmer
    const draws: { depth: number; draw: () => void }[] = [];

    for (const sign of world.signs) {
      draws.push({
        depth: sign.y * TILE + TILE,
        draw: () => ctx.drawImage(this.assets.sign, sign.x * TILE - camX, sign.y * TILE - camY),
      });
    }

    // the mayor's notice board, south entrance of the starter plot
    draws.push({
      depth: (ORDER_BOARD.y + 1) * TILE,
      draw: () => ctx.drawImage(this.assets.board, ORDER_BOARD.x * TILE - camX, ORDER_BOARD.y * TILE - camY),
    });

    // visible fences only
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const x1 = Math.min(WORLD_W - 1, Math.floor((camX + VIEW_W) / TILE));
    const y1 = Math.min(WORLD_H - 1, Math.floor((camY + VIEW_H) / TILE));
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const tile = world.grid.at(x, y)!;
        const s = tile.structure;
        if (s === 'fence') {
          const mask = world.grid.maskAt(x, y, 'fence');
          draws.push({
            depth: (y + 1) * TILE,
            draw: () => ctx.drawImage(this.assets.fences[mask], x * TILE - camX, y * TILE - camY),
          });
        } else if (s === 'sprinkler' || s === 'lantern' || s === 'planter' || s === 'bench') {
          const sprite =
            s === 'sprinkler' ? this.assets.sprinkler
            : s === 'lantern' ? this.assets.lantern
            : s === 'bench' ? this.assets.bench
            : this.assets.planters[Math.abs(x * 31 + y * 17) % 2];
          draws.push({
            depth: (y + 1) * TILE,
            draw: () => ctx.drawImage(sprite, x * TILE - camX, y * TILE - camY),
          });
        }
      }
    }

    for (const barn of world.barns) {
      draws.push({
        depth: (barn.y + BARN_H) * TILE,
        draw: () => ctx.drawImage(this.assets.barn, barn.x * TILE - camX, barn.y * TILE - camY),
      });
    }

    const farmer = world.farmer;
    draws.push({
      depth: farmer.py + TILE,
      draw: () => {
        const fx = Math.round(farmer.px - camX);
        const fy = Math.round(farmer.py - camY);
        let frame = this.assets.farmer.idle;
        if (farmer.state === 'walking') {
          frame = Math.floor(farmer.animTime * 6) % 2 === 0 ? this.assets.farmer.walkA : this.assets.farmer.walkB;
        } else if (farmer.state === 'working') {
          frame = Math.floor(farmer.animTime * 4.5) % 2 === 0 ? this.assets.farmer.tillA : this.assets.farmer.tillB;
        }
        if (farmer.facing === -1) {
          ctx.save();
          ctx.translate(fx + TILE, fy);
          ctx.scale(-1, 1);
          ctx.drawImage(frame, 0, 0);
          ctx.restore();
        } else {
          ctx.drawImage(frame, fx, fy);
        }
      },
    });

    draws.sort((a, b) => a.depth - b.depth);
    for (const d of draws) d.draw();
  }

  private drawParticles(
    ctx: CanvasRenderingContext2D,
    world: World,
    camX: number,
    camY: number,
  ): void {
    for (const p of world.particles.all()) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      const sprite =
        p.kind === 'dirt' ? this.assets.particleDirt
        : p.kind === 'drop' ? this.assets.particleDrop
        : this.assets.particleSparkle;
      ctx.drawImage(sprite, Math.round(p.x - camX) - 2, Math.round(p.y - camY) - 2);
    }
    ctx.globalAlpha = 1;
  }

  private drawFloaters(
    ctx: CanvasRenderingContext2D,
    world: World,
    camX: number,
    camY: number,
  ): void {
    if (world.floaters.length === 0) return;
    ctx.font = '11px "VT323", monospace';
    ctx.textAlign = 'center';
    for (const f of world.floaters) {
      const alpha = Math.max(0, f.life / f.maxLife);
      const x = Math.round(f.x - camX);
      const y = Math.round(f.y - camY);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#2e2015';
      ctx.fillText(f.text, x + 1, y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  private drawPetals(
    ctx: CanvasRenderingContext2D,
    world: World,
    camX: number,
    camY: number,
  ): void {
    for (const p of world.petals) {
      const fade = Math.min(1, p.life / 2);
      ctx.globalAlpha = 0.85 * fade;
      ctx.fillStyle = Math.sin(p.phase) > 0 ? '#e8a9bb' : '#f2e3c6';
      ctx.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), 2, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** Day/night tint, porch light at the barn, and the fireflies over the meadow. */
  private drawLighting(
    ctx: CanvasRenderingContext2D,
    world: World,
    camX: number,
    camY: number,
  ): void {
    // the long breath of the day
    const tint = tintAtElapsed(world.elapsed, world.goldenHour);
    if (tint.a > 0.004) {
      ctx.fillStyle = `rgba(${Math.round(tint.r)}, ${Math.round(tint.g)}, ${Math.round(tint.b)}, ${tint.a.toFixed(3)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    const night = nightFactorAt(world.elapsed, world.goldenHour);

    // porch light spills from the barn door after dusk
    for (const barn of world.barns) {
      if (night <= 0.02) break;
      const doorX = barn.x * TILE + (BARN_W * TILE) / 2 - camX;
      const doorY = barn.y * TILE + BARN_H * TILE - 6 - camY;
      const radius = 78;
      const grad = ctx.createRadialGradient(doorX, doorY, 4, doorX, doorY, radius);
      const strength = 0.5 * night;
      grad.addColorStop(0, `rgba(255, 205, 120, ${strength})`);
      grad.addColorStop(0.45, `rgba(255, 190, 110, ${strength * 0.45})`);
      grad.addColorStop(1, 'rgba(255, 190, 110, 0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.fillRect(doorX - radius, doorY - radius, radius * 2, radius * 2);
      ctx.globalCompositeOperation = 'source-over';
    }

    // stone lanterns ember after dark — small warm pools, one per post
    if (night > 0.02) {
      const lx0 = Math.max(0, Math.floor(camX / TILE));
      const ly0 = Math.max(0, Math.floor(camY / TILE));
      const lx1 = Math.min(WORLD_W - 1, Math.floor((camX + VIEW_W) / TILE));
      const ly1 = Math.min(WORLD_H - 1, Math.floor((camY + VIEW_H) / TILE));
      for (let y = ly0; y <= ly1; y += 1) {
        for (let x = lx0; x <= lx1; x += 1) {
          if (world.grid.at(x, y)!.structure !== 'lantern') continue;
          const px = x * TILE + TILE / 2 - camX;
          const py = y * TILE + TILE / 2 - camY;
          const radius = 46;
          const grad = ctx.createRadialGradient(px, py, 2, px, py, radius);
          const strength = 0.42 * night;
          grad.addColorStop(0, `rgba(255, 185, 105, ${strength})`);
          grad.addColorStop(0.5, `rgba(255, 175, 100, ${strength * 0.45})`);
          grad.addColorStop(1, 'rgba(255, 175, 100, 0)');
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = grad;
          ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }

    // and the fireflies keep their appointments
    if (night > 0.05) {
      for (const f of world.fireflies) {
        const blink = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(world.elapsed * 2.3 + f.phase * 3.1));
        const fx = Math.round(f.x - camX);
        const fy = Math.round(f.y - camY);
        const halo = 3 + blink * 2;
        ctx.fillStyle = `rgba(190, 255, 150, ${0.16 * blink * night})`;
        ctx.beginPath();
        ctx.arc(fx, fy, halo, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(235, 255, 170, ${0.85 * blink * night})`;
        ctx.fillRect(fx, fy, 1, 1);
      }
    }
  }

  /** Fresh-bundle bubble + the rain film on the lens. Drawn after lighting. */
  private drawSkyEffects(
    ctx: CanvasRenderingContext2D,
    world: World,
    camX: number,
    camY: number,
  ): void {
    // the sky remembers it's raining — a cool gauze, nothing more
    if (world.isRaining()) {
      ctx.fillStyle = 'rgba(110, 130, 185, 0.06)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    // the mayor's bubble when a fresh bundle is up for grabs
    if (world.orderFresh && world.orders.active) {
      const bob = Math.sin(world.elapsed * 3.4) * 1.6;
      const bx = ORDER_BOARD.x * TILE + TILE / 2 - camX;
      const by = ORDER_BOARD.y * TILE - 5 - camY + bob;
      ctx.fillStyle = '#f2e3c6';
      ctx.fillRect(bx - 4, by - 4, 9, 6);
      ctx.fillRect(bx - 1, by + 2, 2, 2);
      ctx.fillStyle = '#33241a';
      ctx.font = '7px "VT323", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('!', bx + 0.5, by + 1.5);
      ctx.textAlign = 'left';
    }

    // rain: a fine diagonal hiss over everything, lit like the moon catches it
    if (world.isRaining()) {
      for (const s of world.rainStreaks) {
        const x = Math.round(s.x - camX);
        const y = Math.round(s.y - camY);
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#a9c2e0';
        ctx.fillRect(x, y, 1, 4);
        ctx.fillStyle = '#e3ecf9';
        ctx.fillRect(x, y, 1, 1);
        ctx.fillRect(x + 1, y + 4, 1, 1);
      }
      for (const s of world.splashes) {
        const k = Math.max(0, s.life / 0.28);
        const x = Math.round(s.x - camX);
        const y = Math.round(s.y - camY);
        ctx.globalAlpha = k * 0.85;
        ctx.fillStyle = '#cfe0f5';
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawBuildGhost(
    ctx: CanvasRenderingContext2D,
    world: World,
    camX: number,
    camY: number,
  ): void {
    if (world.tool !== 'build' || !world.hover) return;
    const tiles = world.buildGhostTiles();
    const valid = world.hoverValid();
    ctx.fillStyle = valid ? 'rgba(159, 216, 168, 0.4)' : 'rgba(214, 96, 77, 0.4)';
    for (const t of tiles) {
      ctx.fillRect(t.x * TILE - camX, t.y * TILE - camY, TILE, TILE);
    }
    const stroke = valid ? 'rgba(220, 255, 225, 0.95)' : 'rgba(255, 158, 138, 0.95)';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = tiles.length > 1 ? 2 : 1;
    const gx = world.hover.x * TILE - camX;
    const gy = world.hover.y * TILE - camY;
    const w = tiles.length > 1 ? BARN_W * TILE : TILE;
    const h = tiles.length > 1 ? BARN_H * TILE : TILE;
    ctx.strokeRect(gx + 0.5, gy + 0.5, w - 1, h - 1);
  }

  private drawHover(
    ctx: CanvasRenderingContext2D,
    world: World,
    camX: number,
    camY: number,
  ): void {
    if (!world.hover || world.tool === 'build') return; // the build ghost takes over
    const { x, y } = world.hover;
    const dx = x * TILE - camX;
    const dy = y * TILE - camY;
    const valid = world.hoverValid();

    if (world.tool !== 'inspect') {
      ctx.fillStyle = valid ? 'rgba(255, 246, 205, 0.28)' : 'rgba(214, 96, 77, 0.30)';
      ctx.fillRect(dx, dy, TILE, TILE);
      ctx.strokeStyle = valid ? 'rgba(255, 250, 224, 0.9)' : 'rgba(255, 158, 138, 0.9)';
    } else {
      ctx.fillStyle = 'rgba(255, 246, 205, 0.18)';
      ctx.fillRect(dx, dy, TILE, TILE);
      ctx.strokeStyle = 'rgba(255, 250, 224, 0.75)';
    }
    ctx.lineWidth = 1;
    ctx.strokeRect(dx + 0.5, dy + 0.5, TILE - 1, TILE - 1);
  }

  private drawPinnedMarker(
    ctx: CanvasRenderingContext2D,
    world: World,
    camX: number,
    camY: number,
  ): void {
    if (!world.pinnedTile) return;
    const dx = world.pinnedTile.x * TILE - camX;
    const dy = world.pinnedTile.y * TILE - camY;
    ctx.strokeStyle = '#f2d8a7';
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1;
    ctx.strokeRect(dx + 2.5, dy + 2.5, TILE - 5, TILE - 5);
    ctx.setLineDash([]);
  }
}
