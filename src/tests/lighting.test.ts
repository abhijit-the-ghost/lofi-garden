import { describe, expect, it } from 'vitest';
import {
  CYCLE_SECONDS,
  GOLDEN_HOUR_TINT,
  cycleTint,
  nightFactor,
  nightFactorAt,
  tintAtElapsed,
} from '../game/lighting';

describe('cycleTint', () => {
  it('starts at a warm peach dawn', () => {
    const t = cycleTint(0);
    expect(t.r).toBeGreaterThan(200);
    expect(t.a).toBeGreaterThan(0.15);
  });

  it('is crystal clear at noon', () => {
    const t = cycleTint(0.25);
    expect(t.a).toBeLessThan(0.02);
  });

  it('is deep and dark in the moonlit small hours', () => {
    const t = cycleTint(0.88);
    expect(t.a).toBeGreaterThan(0.35);
    expect(t.b).toBeGreaterThan(t.r); // blue-cold, not warm
  });

  it('loops seamlessly — t=1 matches t=0', () => {
    const a = cycleTint(0);
    const b = cycleTint(1);
    expect(b.r).toBeCloseTo(a.r, 5);
    expect(b.g).toBeCloseTo(a.g, 5);
    expect(b.b).toBeCloseTo(a.b, 5);
    expect(b.a).toBeCloseTo(a.a, 5);
  });

  it('handles out-of-range input by wrapping', () => {
    expect(cycleTint(7.25).a).toBeCloseTo(cycleTint(0.25).a, 5);
    expect(cycleTint(-0.75).a).toBeCloseTo(cycleTint(0.25).a, 5);
  });

  it('dusk is warmer than the deep night', () => {
    const dusk = cycleTint(0.68);
    const night = cycleTint(0.88);
    expect(dusk.r).toBeGreaterThan(night.r);
  });
});

describe('nightFactor', () => {
  it('is zero through the day and one at deep night', () => {
    expect(nightFactor(0.1)).toBe(0);
    expect(nightFactor(0.5)).toBe(0);
    expect(nightFactor(0.8)).toBe(1);
    expect(nightFactor(0.9)).toBe(1);
  });

  it('ramps smoothly through dusk and pre-dawn', () => {
    const dusk = nightFactor(0.66);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
    const dawn = nightFactor(0.97);
    expect(dawn).toBeGreaterThan(0);
    expect(dawn).toBeLessThan(1);
  });

  it('never escapes [0, 1]', () => {
    for (let i = 0; i <= 100; i += 1) {
      const nf = nightFactor(i / 100);
      expect(nf).toBeGreaterThanOrEqual(0);
      expect(nf).toBeLessThanOrEqual(1);
    }
  });
});

describe('tintAtElapsed / golden hour', () => {
  it('returns the eternal golden hour when the toggle is on', () => {
    expect(tintAtElapsed(12345, true)).toEqual(GOLDEN_HOUR_TINT);
    expect(nightFactorAt(185, true)).toBe(0); // no moths in the eternal afternoon
  });

  it('follows the cycle when the toggle is off', () => {
    expect(tintAtElapsed(0, false)).toEqual(cycleTint(0));
    expect(tintAtElapsed(CYCLE_SECONDS / 2, false)).toEqual(cycleTint(0.5));
  });

  it('a full cycle is CYCLE_SECONDS long', () => {
    expect(CYCLE_SECONDS).toBe(240); // the agreed four minutes
  });
});
