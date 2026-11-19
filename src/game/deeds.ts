import { DEED_PARCELS, type ParcelDef, type ParcelId } from './constants';

export type DeedCheck =
  | { ok: true; deed: ParcelDef }
  | { ok: false; reason: string };

/**
 * Deeds are sold strictly in order (East → North → West → South).
 * Returns the next purchasable deed, or why not.
 */
export function nextDeed(owned: ReadonlySet<ParcelId>): ParcelDef | null {
  return DEED_PARCELS.find((d) => !owned.has(d.id)) ?? null;
}

export function checkDeedPurchase(owned: ReadonlySet<ParcelId>, coins: number): DeedCheck {
  const deed = nextDeed(owned);
  if (!deed) return { ok: false, reason: 'Every deed is yours — the whole meadow is home.' };
  if (coins < deed.price) return { ok: false, reason: `${deed.name} costs ${deed.price}c (you have ${coins}c)` };
  return { ok: true, deed };
}
