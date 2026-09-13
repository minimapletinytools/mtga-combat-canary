import type { Card, OpenMana, Rarity, TrickReason, TrickResult } from './types.js';
import { canCast, parseManaCost } from './mana.js';
import { extractHandAbilities } from './handAbilities.js';

export interface InstantSpeedFace {
  faceName: string;
  reason: TrickReason;
  manaCost: string;
  isCycling?: boolean;
  abilityName?: string;
  abilityText?: string;
}

function isInstantTypeLine(typeLine: string): boolean {
  return typeLine.includes('Instant');
}

function isLandTypeLine(typeLine: string): boolean {
  return typeLine.includes('Land');
}

/**
 * Which face(s) or hand-activated ability(s) of this card can be cast or activated
 * at instant speed, and why.
 * Handles single-face cards, adventures, splits, transform fronts, and hand abilities
 * (Channel, Bloodrush, Reinforce, Discard from hand, Cycling/Typecycling).
 */
export function instantSpeedFaces(card: Card): InstantSpeedFace[] {
  const faces: InstantSpeedFace[] = [];

  if (card.card_faces && card.card_faces.length > 0) {
    const hasFlash = card.keywords.includes('Flash');
    let flashAttributed = false;

    for (const face of card.card_faces) {
      if (isLandTypeLine(face.type_line)) continue;
      if (face.mana_cost === '') continue;

      if (isInstantTypeLine(face.type_line)) {
        faces.push({ faceName: face.name, reason: 'instant', manaCost: face.mana_cost });
        continue;
      }

      if (hasFlash && !flashAttributed) {
        // Attribute card-level Flash to the front face only.
        const front = card.card_faces[0];
        if (face === front) {
          faces.push({ faceName: face.name, reason: 'flash', manaCost: face.mana_cost });
          flashAttributed = true;
        }
      }
    }
  } else {
    const typeLine = card.type_line;
    const manaCost = card.mana_cost ?? '';

    if (isInstantTypeLine(typeLine)) {
      faces.push({ faceName: card.name, reason: 'instant', manaCost });
    } else if (card.keywords.includes('Flash')) {
      faces.push({ faceName: card.name, reason: 'flash', manaCost });
    }
  }

  // Extract hand-activated abilities (Channel, Bloodrush, Reinforce, Discard, Cycling, etc.)
  const abilities = extractHandAbilities(card);
  for (const ability of abilities) {
    faces.push({
      faceName: card.name,
      reason: ability.isCycling ? 'cycling' : 'ability',
      manaCost: ability.manaCost,
      isCycling: ability.isCycling,
      abilityName: ability.name,
      abilityText: ability.text,
    });
  }

  return faces;
}

export interface FindTricksOptions {
  /** If true, cycling and typecycling abilities will be ignored. */
  hideCycling?: boolean;
}

/**
 * All cards in `cards` with an instant-speed face or hand ability, with castability
 * evaluated against `mana`. At most one TrickResult per card (preferring castable faces,
 * and preferring non-cycling tricks over cycling).
 */
export function findTricks(
  cards: Card[],
  mana: OpenMana,
  options?: FindTricksOptions,
): TrickResult[] {
  const results: TrickResult[] = [];

  for (const card of cards) {
    const faces = instantSpeedFaces(card);
    if (faces.length === 0) continue;

    let best: TrickResult | undefined;

    for (const face of faces) {
      if (options?.hideCycling && face.isCycling) {
        continue;
      }

      const parsed = parseManaCost(face.manaCost);
      const castability = canCast(parsed, mana);
      const candidate: TrickResult = {
        card,
        faceName: face.faceName,
        reason: face.reason,
        castability,
        isCycling: face.isCycling,
        abilityName: face.abilityName,
        abilityText: face.abilityText,
      };

      if (!best) {
        best = candidate;
        continue;
      }

      // Prefer a castable face over the current best if the current best isn't castable.
      if (candidate.castability.castable && !best.castability.castable) {
        best = candidate;
      } else if (candidate.castability.castable === best.castability.castable) {
        // If both have the same castability, prefer real combat tricks/spells over cycling
        if (best.isCycling && !candidate.isCycling) {
          best = candidate;
        }
      }
    }

    if (best) results.push(best);
  }

  return results;
}

/**
 * Returns true if any result in the list has a cycling ability.
 */
export function hasCyclingTricks(results: TrickResult[]): boolean {
  return results.some((r) => r.isCycling || r.reason === 'cycling');
}

const RARITY_RANK: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  mythic: 3,
  special: 4,
  bonus: 5,
};

/**
 * Stable sort by rarity rank, then card name.
 *
 * WP2 — see PLAN.md.
 */
export function sortTricks(
  results: TrickResult[],
  direction: 'common-first' | 'mythic-first',
): TrickResult[] {
  const sorted = [...results];
  const sign = direction === 'common-first' ? 1 : -1;

  sorted.sort((a, b) => {
    const rankDiff = (RARITY_RANK[a.card.rarity] - RARITY_RANK[b.card.rarity]) * sign;
    if (rankDiff !== 0) return rankDiff;
    return a.card.name.localeCompare(b.card.name);
  });

  return sorted;
}
