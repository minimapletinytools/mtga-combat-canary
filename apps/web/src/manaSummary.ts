import type { Color, OpenMana } from '@mtgatricks/core';
import { comboKey, sortByWheel } from './manaCombos';

export type ManaSummaryKey = Color | 'C' | 'any';

export type ManaSummary = Record<ManaSummaryKey, number>;

function isPureWheelColors(produces: ReadonlyArray<Color | 'C'>): produces is Color[] {
  return produces.every((c) => c !== 'C');
}

/**
 * Derives compact per-color counts from an OpenMana's sources, for the
 * auto-mode read-only summary: a single-color source counts toward that
 * color, a source that only produces 'C' counts as colorless. A dual/tri
 * source (any pure 2- or 3-color subset of WUBRG) is deliberately NOT
 * counted here — it's represented precisely by `summarizeCombos` instead.
 * Anything else multi-color (a true "any five" source, Treasure/Gold, or an
 * unusual 4+ color mix) counts toward 'any'.
 */
export function summarizeOpenMana(mana: OpenMana): ManaSummary {
  const summary: ManaSummary = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, any: 0 };
  for (const source of mana.sources) {
    const produces = source.produces;
    if (produces.length === 1) {
      summary[produces[0]!] += 1;
      continue;
    }
    if ((produces.length === 2 || produces.length === 3) && isPureWheelColors(produces)) {
      continue; // counted by summarizeCombos instead
    }
    summary.any += 1;
  }
  return summary;
}

/**
 * Dual/tri-land sources bucketed by their exact color combo (keyed like
 * ManaInput's combo steppers, e.g. "WU", "WUB"), regardless of what order
 * the source's own `produces` array happens to list them in.
 */
export function summarizeCombos(mana: OpenMana): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const source of mana.sources) {
    const produces = source.produces;
    if (produces.length !== 2 && produces.length !== 3) continue;
    if (!isPureWheelColors(produces)) continue;
    const key = comboKey(sortByWheel(produces));
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
