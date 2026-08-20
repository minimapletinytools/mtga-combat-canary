import type { Color } from '@mtgatricks/core';

/** WUBRG — the standard color-pie order everything below is generated from. */
export const COLOR_WHEEL: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];

const WHEEL_INDEX: Record<Color, number> = { W: 0, U: 1, B: 2, R: 3, G: 4 };

/** Sort an arbitrary-order color array into canonical WUBRG wheel order. */
export function sortByWheel(colors: readonly Color[]): Color[] {
  return [...colors].sort((a, b) => WHEEL_INDEX[a] - WHEEL_INDEX[b]);
}

/** Every k-color subset of WUBRG: each combo's own letters are already in
 * wheel order (inner loop starts after the outer index), and the list of
 * combos itself comes out in wheel-lexicographic order — e.g. duals are
 * WU, WB, WR, WG, UB, UR, UG, BR, BG, RG, never "UW" or "GW". */
function combosOf(k: number): Color[][] {
  const out: Color[][] = [];
  const current: Color[] = [];
  function rec(start: number) {
    if (current.length === k) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < COLOR_WHEEL.length; i++) {
      current.push(COLOR_WHEEL[i]!);
      rec(i + 1);
      current.pop();
    }
  }
  rec(0);
  return out;
}

/** The 10 two-color combinations (dual lands), e.g. ['W','U'] for Azorius. */
export const DUAL_COMBOS: readonly Color[][] = combosOf(2);
/** The 10 three-color combinations (tri-lands), e.g. ['W','U','B'] for Esper. */
export const TRI_COMBOS: readonly Color[][] = combosOf(3);

export function comboKey(colors: readonly Color[]): string {
  return colors.join('');
}

/** Inverse of comboKey: "WU" -> ['W','U']. Every combo key is single-char
 * wheel-color letters joined, so splitting the string round-trips exactly. */
export function splitComboKey(key: string): Color[] {
  return key.split('') as Color[];
}

/** All 20 dual+tri combo keys, in canonical wheel order — for display iteration. */
export const ALL_COMBO_KEYS: readonly string[] = [...DUAL_COMBOS, ...TRI_COMBOS].map(comboKey);
