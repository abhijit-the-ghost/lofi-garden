/**
 * Day/night model — pure functions, no canvas. A 240-second breath:
 * dawn → noon → golden hour → dusk → moonlit deep → pre-dawn → dawn.
 * "Always Golden Hour" freezes the world at honeyed late afternoon.
 */
export const CYCLE_SECONDS = 240;

export interface Tint {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Keyframed look over the cycle, lerped piecewise. */
const STOPS: { at: number; tint: Tint }[] = [
  { at: 0.0, tint: { r: 255, g: 183, b: 138, a: 0.22 } }, // dawn peach
  { at: 0.12, tint: { r: 255, g: 219, b: 178, a: 0.08 } }, // soft morning
  { at: 0.25, tint: { r: 255, g: 255, b: 255, a: 0.0 } }, // clear noon
  { at: 0.5, tint: { r: 255, g: 214, b: 150, a: 0.1 } }, // afternoon honey
  { at: 0.6, tint: { r: 255, g: 166, b: 120, a: 0.22 } }, // golden hour
  { at: 0.68, tint: { r: 150, g: 96, b: 120, a: 0.3 } }, // violet dusk
  { at: 0.75, tint: { r: 46, g: 58, b: 110, a: 0.38 } }, // night falls
  { at: 0.92, tint: { r: 30, g: 38, b: 84, a: 0.42 } }, // deep moonlit night
  { at: 0.97, tint: { r: 96, g: 70, b: 116, a: 0.3 } }, // pre-dawn hush
];

/** The eternal-late-afternoon look when the toggle is on. */
export const GOLDEN_HOUR_TINT: Tint = { r: 255, g: 190, b: 130, a: 0.16 };

export function cycleTint(t01: number): Tint {
  const t = ((t01 % 1) + 1) % 1;
  for (let i = 0; i < STOPS.length; i += 1) {
    const a = STOPS[i];
    const b = STOPS[(i + 1) % STOPS.length];
    const segEnd = i === STOPS.length - 1 ? 1 : b.at;
    if (t <= segEnd || (i === STOPS.length - 1 && t >= a.at)) {
      const segStart = a.at;
      const span = Math.max(1e-6, segEnd - segStart);
      const k = Math.min(1, Math.max(0, (t - segStart) / span));
      return {
        r: lerp(a.tint.r, b.tint.r, k),
        g: lerp(a.tint.g, b.tint.g, k),
        b: lerp(a.tint.b, b.tint.b, k),
        a: lerp(a.tint.a, b.tint.a, k),
      };
    }
  }
  return { ...STOPS[0].tint };
}

export function tintAtElapsed(elapsedSeconds: number, goldenHour: boolean): Tint {
  if (goldenHour) return { ...GOLDEN_HOUR_TINT };
  return cycleTint(elapsedSeconds / CYCLE_SECONDS);
}

/**
 * 0 in daylight → 1 in deep night. Drives fireflies and porch-light pools.
 * Ramps through dusk/pre-dawn so the world breathes instead of snapping.
 */
export function nightFactor(t01: number): number {
  const t = ((t01 % 1) + 1) % 1;
  const smooth = (x: number) => x * x * (3 - 2 * x);
  if (t < 0.6) return 0;
  if (t < 0.72) return smooth((t - 0.6) / 0.12);
  if (t < 0.93) return 1;
  if (t < 1) return 1 - smooth((t - 0.93) / 0.07);
  return 0;
}

export function nightFactorAt(elapsedSeconds: number, goldenHour: boolean): number {
  if (goldenHour) return 0; // the eternal afternoon has no moths
  return nightFactor(elapsedSeconds / CYCLE_SECONDS);
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}
