import type { Color } from '@mtgatricks/core';

const MANA_FILL_VAR: Record<Color | 'C', string> = {
  W: 'var(--mana-w-fill)',
  U: 'var(--mana-u-fill)',
  B: 'var(--mana-b-fill)',
  R: 'var(--mana-r-fill)',
  G: 'var(--mana-g-fill)',
  C: 'var(--mana-c-fill)',
};

/** A stepper box's background: a solid fill for one color, or a hard-edged
 * split — tilted 20° off horizontal — for 2+ colors, so a dual/tri-land (or
 * "any color") box visibly shows a band of each of its colors. Shared by
 * ManaInput (interactive) and ManaAutoSummary (read-only) so both render
 * mana color identically. */
export function manaFillBackground(colors: ReadonlyArray<Color | 'C'>): string {
  if (colors.length <= 1) {
    return MANA_FILL_VAR[colors[0] ?? 'C'];
  }
  const n = colors.length;
  const stops = colors
    .map((c, i) => `${MANA_FILL_VAR[c]} ${(i / n) * 100}% ${((i + 1) / n) * 100}%`)
    .join(', ');
  return `linear-gradient(20deg, ${stops})`;
}
