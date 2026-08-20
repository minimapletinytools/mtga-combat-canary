import type { Color, ManaSource, OpenMana } from '@mtgatricks/core';
import type { ProducedManaLookup, TrackerState } from './types.js';

/** Basic land subtypes (from GRE gameObject.subtypes) → produced color. */
const LAND_SUBTYPE_COLORS: Record<string, Color | 'C'> = {
  SubType_Plains: 'W',
  SubType_Island: 'U',
  SubType_Swamp: 'B',
  SubType_Mountain: 'R',
  SubType_Forest: 'G',
  SubType_Wastes: 'C',
};

/**
 * Produced-mana fallback from land subtypes: covers every basic (and typed
 * nonbasic) land even when the Scryfall arena-id map lacks the printing —
 * Scryfall's arena_id coverage lags new sets. Empty array when the subtypes
 * carry no land types.
 */
export function subtypesToProducedMana(
  subtypes: readonly string[],
): ReadonlyArray<Color | 'C'> {
  const colors: (Color | 'C')[] = [];
  for (const subtype of subtypes) {
    const color = LAND_SUBTYPE_COLORS[subtype];
    if (color !== undefined && !colors.includes(color)) colors.push(color);
  }
  return colors;
}

/**
 * Derive open mana for the tracked player: every untapped battlefield
 * permanent they control whose grpId maps to nonempty produced mana becomes
 * one ManaSource. Returns null while the local seat is unknown.
 *
 * WP6 — see PLAN.md Phase 2.
 */
export function deriveOpenMana(
  state: TrackerState,
  producedMana: ProducedManaLookup,
  track: 'opponent' | 'local',
): OpenMana | null {
  const localSeatId = state?.localSeatId;
  // Without the local seat, "opponent" is undefined — say nothing rather than guess.
  if (localSeatId === null || localSeatId === undefined) return null;

  const sources: ManaSource[] = [];
  for (const permanent of state.battlefield ?? []) {
    if (permanent.tapped) continue;
    const isLocal = permanent.controllerSeatId === localSeatId;
    if (track === 'local' ? !isLocal : isLocal) continue;

    const produces = producedMana(permanent.grpId);
    // Unknown grpId, or a permanent that makes no mana: not a source.
    if (!produces || produces.length === 0) continue;
    sources.push({ produces: [...produces] });
  }
  return { sources };
}
