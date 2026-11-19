export type ParticleKind = 'dirt' | 'sparkle' | 'drop';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export class Particles {
  private list: Particle[] = [];

  burst(kind: ParticleKind, x: number, y: number, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed =
        kind === 'dirt' ? 18 + Math.random() * 26
        : kind === 'drop' ? 14 + Math.random() * 22
        : 8 + Math.random() * 14;
      const life =
        kind === 'dirt' ? 0.5 + Math.random() * 0.3
        : kind === 'drop' ? 0.35 + Math.random() * 0.25
        : 0.6 + Math.random() * 0.4;
      this.list.push({
        kind,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (kind === 'dirt' ? 20 : kind === 'drop' ? 30 : 6),
        life,
        maxLife: life,
      });
    }
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.kind === 'dirt' ? 90 : p.kind === 'drop' ? 160 : 12) * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  all(): readonly Particle[] {
    return this.list;
  }
}
