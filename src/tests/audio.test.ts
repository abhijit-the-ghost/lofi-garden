import { describe, expect, it } from 'vitest';
import { CHORD_PROGRESSION, noteHz } from '../audio/engine';

describe('noteHz', () => {
  it('maps A4 to 440 and C2 to ~65.41', () => {
    expect(noteHz(69)).toBeCloseTo(440, 5);
    expect(noteHz(36)).toBeCloseTo(65.41, 1);
    expect(noteHz(81)).toBeCloseTo(880, 5); // A5 — octaves double
  });
});

describe('CHORD_PROGRESSION', () => {
  it('is the agreed four-bar axis, voiced with a deep root + above tones', () => {
    expect(CHORD_PROGRESSION).toHaveLength(4);
    for (const chord of CHORD_PROGRESSION) {
      expect(chord.length).toBeGreaterThanOrEqual(4); // root + at least a 7th voicing
      expect(chord[0]).toBeLessThan(50); // roots live in the bass register
      for (const midi of chord) {
        expect(midi).toBeGreaterThanOrEqual(30);
        expect(midi).toBeLessThanOrEqual(96);
      }
    }
  });

  it('every voicing sits above its root', () => {
    for (const chord of CHORD_PROGRESSION) {
      const [root, ...rest] = chord;
      for (const midi of rest) expect(midi).toBeGreaterThan(root);
    }
  });
});
