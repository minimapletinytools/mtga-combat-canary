import type { Color, ManaSource, OpenMana } from '@mtgatricks/core';
import type { ProducedManaLookup, TrackerState } from './types.js';

const ANY_COLOR: ReadonlyArray<Color> = ['W', 'U', 'B', 'R', 'G'];

/** Mana produced per relevant subtype (from GRE gameObject.subtypes). */
const SUBTYPE_MANA: Record<string, ReadonlyArray<Color | 'C'>> = {
  // Basic land types (also covers typed nonbasics/duals).
  SubType_Plains: ['W'],
  SubType_Island: ['U'],
  SubType_Swamp: ['B'],
  SubType_Mountain: ['R'],
  SubType_Forest: ['G'],
  SubType_Wastes: ['C'],
  // Mana tokens — these NEVER resolve through the Scryfall arena-id map,
  // because token grpIds aren't indexed there. Treasure/Gold: one mana of any
  // color (sacrifice cost is fine for a one-shot source).
  SubType_Treasure: ANY_COLOR,
  SubType_Gold: ANY_COLOR,
  // Powerstone mana can only pay for artifact spells; counting it as C
  // over-reports slightly — the right direction for a "what could they have"
  // warning tool.
  SubType_Powerstone: ['C'],
};

/**
 * Produced-mana fallback from subtypes: covers basic-typed lands and mana
 * tokens even when the Scryfall arena-id map has no answer (its arena_id
 * coverage lags new sets, and token grpIds are never in it). Empty array when
 * the subtypes carry no mana-producing types.
 */
export function subtypesToProducedMana(
  subtypes: readonly string[],
): ReadonlyArray<Color | 'C'> {
  const colors: (Color | 'C')[] = [];
  for (const subtype of subtypes) {
    for (const color of SUBTYPE_MANA[subtype] ?? []) {
      if (!colors.includes(color)) colors.push(color);
    }
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
