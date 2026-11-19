import { audio } from './engine';

/**
 * Call-sites stay tiny; everything no-ops until the audio engine is created
 * (first user gesture) — cozy silence before that, never a crash.
 */
export const sfx = {
  till: (): void => audio.playTill(),
  water: (): void => audio.playWater(),
  plant: (): void => audio.playPlant(),
  harvest: (): void => audio.playHarvest(),
  coin: (delay = 0): void => audio.playCoin(delay),
  knock: (): void => audio.playKnock(),
  arpeggio: (): void => audio.playArpeggio(),
  denied: (): void => audio.playDenied(),
  ui: (): void => audio.playUi(),
  sprinkler: (): void => audio.playSprinkle(),
  rainStart: (): void => audio.startRain(),
  rainStop: (): void => audio.stopRain(),
};
