import type { Color, OpenMana } from '@mtgatricks/core';

export type ManaSummaryKey = Color | 'C' | 'any';

export type ManaSummary = Record<ManaSummaryKey, number>;

/**
 * Derives compact per-color counts from an OpenMana's sources, for the
 * auto-mode read-only summary: a single-color source counts toward that
 * color, a source that only produces 'C' counts as colorless, and any
 * source that can produce more than one type (a dual, "any five", etc.)
 * counts toward 'any'.
 */
export function summarizeOpenMana(mana: OpenMana): ManaSummary {
  const summary: ManaSummary = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, any: 0 };
  for (const source of mana.sources) {
    const produces = source.produces;
    if (produces.length === 1) {
      const only = produces[0]!;
      summary[only] += 1;
    } else {
      summary.any += 1;
    }
  }
  return summary;
}
