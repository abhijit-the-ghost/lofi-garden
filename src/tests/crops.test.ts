import { describe, expect, it } from 'vitest';
import { TileGrid } from '../game/grid';
import {
  CROPS,
  MOISTURE_DECAY,
  MOISTURE_THRESHOLD,
  isMature,
  progressPct,
  stageFor,
  tickTile,
} from '../game/crops';

describe('crop definitions', () => {
  it('match the agreed balance', () => {
    expect(CROPS.turnip).toMatchObject({ seedCost: 4, growTime: 45, sellPrice: 9 });
    expect(CROPS.carrot).toMatchObject({ seedCost: 10, growTime: 90, sellPrice: 22 });
    expect(CROPS.pumpkin).toMatchObject({ seedCost: 25, growTime: 180, sellPrice: 60 });
  });

  it('every crop is profitable when harvested', () => {
    for (const def of Object.values(CROPS)) {
      expect(def.sellPrice).toBeGreaterThan(def.seedCost);
    }
  });
});

describe('stageFor', () => {
  it('maps growth progress to 0..3', () => {
    expect(stageFor('turnip', 0)).toBe(0);
    expect(stageFor('turnip', CROPS.turnip.growTime * 0.24)).toBe(0);
    expect(stageFor('turnip', CROPS.turnip.growTime * 0.25)).toBe(1);
    expect(stageFor('turnip', CROPS.turnip.growTime * 0.5)).toBe(2);
    expect(stageFor('turnip', CROPS.turnip.growTime * 0.75)).toBe(3);
    expect(stageFor('turnip', CROPS.turnip.growTime)).toBe(3);
    expect(stageFor('turnip', CROPS.turnip.growTime * 2)).toBe(3); // clamps
  });

  it('progressPct and isMature behave', () => {
    expect(progressPct('carrot', CROPS.carrot.growTime / 2)).toBe(50);
    expect(progressPct('carrot', CROPS.carrot.growTime)).toBe(100);
    expect(isMature({ crop: 'carrot', growth: CROPS.carrot.growTime })).toBe(true);
    expect(isMature({ crop: 'carrot', growth: CROPS.carrot.growTime - 0.1 })).toBe(false);
  });
});

describe('tickTile (soil + growth simulation)', () => {
  it('moist soil grows a crop; dry soil pauses it', () => {
    const tile = { moisture: 1, crop: { crop: 'turnip' as const, growth: 0 } };
    tickTile(tile, 10);
    const afterMoist = tile.crop.growth;
    expect(afterMoist).toBeGreaterThan(0);

    tile.moisture = 0;
    tickTile(tile, 10);
    expect(tile.crop.growth).toBe(afterMoist); // paused, not punished
  });

  it('moisture decays linearly toward zero', () => {
    const tile = { moisture: 1 } as { moisture: number; crop?: { crop: 'turnip'; growth: number } };
    tickTile(tile, MOISTURE_DECAY / 2);
    expect(tile.moisture).toBeCloseTo(0.5, 3);
    tickTile(tile, MOISTURE_DECAY);
    expect(tile.moisture).toBe(0);
  });

  it('crop stops growing at maturity and never exceeds growTime', () => {
    const tile = { moisture: 1, crop: { crop: 'turnip' as const, growth: CROPS.turnip.growTime - 1 } };
    tickTile(tile, 5);
    expect(tile.crop.growth).toBe(CROPS.turnip.growTime);
    const before = tile.crop.growth;
    tickTile(tile, 5);
    expect(tile.crop.growth).toBe(before);
  });

  it('dry tiles with no crop do not decay negative moisture', () => {
    const tile = { moisture: 0.001 } as { moisture: number; crop?: { crop: 'turnip'; growth: number } };
    tickTile(tile, 5);
    expect(tile.moisture).toBe(0);
  });
});

describe('TileGrid farming ops', () => {
  it('till → plant → grow → harvest round-trip', () => {
    const grid = new TileGrid();
    expect(grid.canPlant(20, 20)).toBe(false); // grass first

    grid.till(20, 20);
    expect(grid.canPlant(20, 20)).toBe(true);
    expect(grid.canWater(20, 20)).toBe(true);

    grid.plant(20, 20, 'turnip');
    expect(grid.canPlant(20, 20)).toBe(false);
    expect(grid.canHarvest(20, 20)).toBe(false); // not ripe

    grid.water(20, 20);
    expect(grid.at(20, 20)!.moisture).toBe(1);

    // simulate a full growth cycle with plenty of water
    for (let i = 0; i < 60 && !isMature(grid.at(20, 20)!.crop!); i += 1) {
      grid.water(20, 20);
      grid.updateCrops(1);
    }
    expect(grid.canHarvest(20, 20)).toBe(true);

    expect(grid.harvest(20, 20)).toBe('turnip');
    expect(grid.at(20, 20)!.crop).toBeUndefined();
    expect(grid.at(20, 20)!.moisture).toBe(0); // harvested bed goes dry
  });

  it('watering untilled soil is rejected', () => {
    const grid = new TileGrid();
    expect(grid.canWater(20, 20)).toBe(false);
    expect(grid.water(20, 20)).toBe(false);
  });

  it('updateCrops pauses growth below the moisture threshold', () => {
    const grid = new TileGrid();
    grid.till(20, 20);
    grid.plant(20, 20, 'carrot');
    grid.at(20, 20)!.moisture = MOISTURE_THRESHOLD / 2;
    grid.updateCrops(10);
    expect(grid.at(20, 20)!.crop!.growth).toBe(0);
  });

  it('cannot harvest before the crop is ripe', () => {
    const grid = new TileGrid();
    grid.till(21, 21);
    grid.plant(21, 21, 'pumpkin');
    grid.water(21, 21);
    grid.updateCrops(1);
    expect(grid.canHarvest(21, 21)).toBe(false);
  });
});
