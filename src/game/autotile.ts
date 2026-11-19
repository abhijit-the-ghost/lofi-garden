/** 4-bit bitmask helpers for path & fence autotiling. Bit order: N=1, E=2, S=4, W=8. */
export const BIT_N = 1;
export const BIT_E = 2;
export const BIT_S = 4;
export const BIT_W = 8;

export interface MaskNeighbors {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
}

export function maskFromNeighbors({ n, e, s, w }: MaskNeighbors): number {
  return (n ? BIT_N : 0) | (e ? BIT_E : 0) | (s ? BIT_S : 0) | (w ? BIT_W : 0);
}
