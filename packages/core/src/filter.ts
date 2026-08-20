import type { Card, OpenMana, Rarity, TrickResult } from './types.js';
import { canCast, parseManaCost } from './mana.js';

export interface InstantSpeedFace {
  faceName: string;
  reason: 'instant' | 'flash';
  manaCost: string;
}

function isInstantTypeLine(typeLine: string): boolean {
  return typeLine.includes('Instant');
}

function isLandTypeLine(typeLine: string): boolean {
  return typeLine.includes('Land');
}

/**
 * Which face(s) of this card can be cast at instant speed, and why.
 * Handles single-face cards, adventures, splits, and transform fronts.
 *
 * WP2 — see PLAN.md.
 */
export function instantSpeedFaces(card: Card): InstantSpeedFace[] {
  if (card.card_faces && card.card_faces.length > 0) {
    const faces: InstantSpeedFace[] = [];
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

    return faces;
  }

  const typeLine = card.type_line;
  const manaCost = card.mana_cost ?? '';

  if (isInstantTypeLine(typeLine)) {
    return [{ faceName: card.name, reason: 'instant', manaCost }];
  }

  if (card.keywords.includes('Flash')) {
    return [{ faceName: card.name, reason: 'flash', manaCost }];
  }

  return [];
}

/**
 * All cards in `cards` with an instant-speed face, with castability evaluated
 * against `mana`. At most one TrickResult per card (prefer a castable face).
 *
 * WP2 — see PLAN.md.
 */
export function findTricks(cards: Card[], mana: OpenMana): TrickResult[] {
  const results: TrickResult[] = [];

  for (const card of cards) {
    const faces = instantSpeedFaces(card);
    if (faces.length === 0) continue;

    let best: TrickResult | undefined;

    for (const face of faces) {
      const parsed = parseManaCost(face.manaCost);
      const castability = canCast(parsed, mana);
      const candidate: TrickResult = {
        card,
        faceName: face.faceName,
        reason: face.reason,
        castability,
      };

      if (!best) {
        best = candidate;
        continue;
      }

      // Prefer a castable face over the current best if the current best isn't castable.
      if (castability.castable && !best.castability.castable) {
        best = candidate;
      }
    }

    if (best) results.push(best);
  }

  return results;
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
