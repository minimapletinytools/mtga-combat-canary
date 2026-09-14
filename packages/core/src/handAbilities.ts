import type { Card } from './types.js';

/**
 * Hand-activated ability kinds recognized by MTG Combat Canary.
 *
 * In Magic: The Gathering, activated abilities (formatted as `[Cost]: [Effect]`)
 * can be activated at instant speed whenever a player has priority, unless explicitly
 * restricted (e.g. "Activate only as a sorcery").
 *
 * Several card types feature activated abilities that function from the player's hand,
 * providing instant-speed interaction or combat tricks at an activation cost that is
 * often completely different from the card's casting mana cost (e.g. Proft, Sinister
 * Mastermind costs {2}{B} to cast, but {B} to activate its discard ability).
 */
export type HandAbilityKind =
  | 'discard'    // Generic discard-from-hand ability (e.g. Proft, Altanak, Faerie Macabre)
  | 'channel'    // Channel keyword ability (e.g. Boseiju, Colossal Skyturtle)
  | 'bloodrush'  // Bloodrush keyword combat trick (e.g. Ghor-Clan Rampager)
  | 'reinforce'  // Reinforce keyword combat trick (e.g. Hunting Triad)
  | 'cycling'    // Cycling and all typecycling abilities (e.g. Plainscycling, Landcycling)
  | 'other';     // Other hand-activated abilities

/**
 * Represents an extracted instant-speed ability that can be activated from hand.
 */
export interface HandAbility {
  /** The high-level kind of hand ability. */
  kind: HandAbilityKind;
  /** Human-readable name of the ability (e.g. "Discard", "Channel", "Forestcycling"). */
  name: string;
  /** Extracted mana cost string formatted in Scryfall style (e.g. "{B}", "{2}{G}", or "" for free). */
  manaCost: string;
  /** True if this ability is Cycling or any Typecycling ability (*cycle / *cycling). */
  isCycling: boolean;
  /** Full text of the ability line from the card's oracle text. */
  text: string;
}

/**
 * Checks whether an ability name or keyword represents Cycling or any Typecycling variant.
 * Matches any term containing or ending with "cycle" or "cycling" (e.g. "Cycling",
 * "Basic landcycling", "Plainscycling", "Swampcycling", "Typecycling", "Slivercycling").
 */
export function isCyclingAbility(name: string): boolean {
  return /[a-z]*cycl(?:e|ing)\b/i.test(name.trim());
}

/**
 * Individual extractor interface to easily add new ability patterns in the future.
 */
export interface HandAbilityExtractor {
  name: string;
  extract(line: string, card: Card): HandAbility | HandAbility[] | null;
}

/**
 * 1. Cycling & Typecycling Extractor:
 * Matches lines like:
 *   - "Cycling {2}"
 *   - "Cycling {1}{U}"
 *   - "Islandcycling {1}"
 *   - "Halflingcycling {4}" / "Hobbitcycling {2}"
 *   - "Basic landcycling {2}"
 *   - "Forestcycling {2}"
 *   - "Plainscycling {1}{W}"
 *   - Comma-separated keyword lists (e.g. "Madness {R}, cycling {1}{R}")
 *   - Non-mana cycling (e.g. "Cycling—Pay 2 life", "Cycling—Sacrifice a land")
 */
const cyclingExtractor: HandAbilityExtractor = {
  name: 'Cycling',
  extract(line: string): HandAbility | HandAbility[] | null {
    const abilities: HandAbility[] = [];

    // 1. Mana-cost cycling: matches any *cycling or *cycle with mana cost
    // Uses \b to match anywhere in a line (e.g. comma-separated lists)
    const matches = Array.from(
      line.matchAll(/\b([A-Za-z\s-]*?cycl(?:e|ing))[\s—-]+(\{[^}]+\}(?:\{[^}]+\})*)/gi),
    );
    for (const match of matches) {
      if (match[1] && match[2]) {
        abilities.push({
          kind: 'cycling',
          name: match[1].trim(),
          manaCost: match[2].trim(),
          isCycling: true,
          text: line,
        });
      }
    }

    // 2. Non-mana cycling: e.g. "Cycling—Pay 2 life." (Street Wraith), "Cycling—Sacrifice a land." (Edge of Autumn)
    if (abilities.length === 0) {
      const nonManaMatches = Array.from(
        line.matchAll(/\b([A-Za-z\s-]*?cycl(?:e|ing))[\s—-]+(?:Pay\s+\d+\s+life|Sacrifice\s+[^.]+)/gi),
      );
      for (const match of nonManaMatches) {
        if (match[1]) {
          abilities.push({
            kind: 'cycling',
            name: match[1].trim(),
            manaCost: '',
            isCycling: true,
            text: line,
          });
        }
      }
    }

    return abilities.length > 0 ? abilities : null;
  },
};

/**
 * 2. Channel Extractor:
 * Matches lines like:
 *   - "Channel — {6}, Discard this card: Put a +1/+1 counter..."
 *   - "Channel — {1}{G}, Discard Boseiju, Who Endures: Destroy target..."
 */
const channelExtractor: HandAbilityExtractor = {
  name: 'Channel',
  extract(line: string): HandAbility | null {
    const match = line.match(
      /^Channel\s*—\s*(\{[^}]+\}(?:\{[^}]+\})*),\s*Discard (?:this card|[A-Z][a-zA-Z0-9\s,'"-]+?):/i,
    );
    if (!match || !match[1]) return null;

    return {
      kind: 'channel',
      name: 'Channel',
      manaCost: match[1].trim(),
      isCycling: false,
      text: line,
    };
  },
};

/**
 * 3. Bloodrush Extractor:
 * Matches lines like:
 *   - "Bloodrush — {R}{G}, Discard Ghor-Clan Rampager: Target attacking creature gets +4/+4..."
 */
const bloodrushExtractor: HandAbilityExtractor = {
  name: 'Bloodrush',
  extract(line: string): HandAbility | null {
    const match = line.match(
      /^Bloodrush\s*—\s*(\{[^}]+\}(?:\{[^}]+\})*),\s*Discard (?:this card|[A-Z][a-zA-Z0-9\s,'"-]+?):/i,
    );
    if (!match || !match[1]) return null;

    return {
      kind: 'bloodrush',
      name: 'Bloodrush',
      manaCost: match[1].trim(),
      isCycling: false,
      text: line,
    };
  },
};

/**
 * 4. Reinforce Extractor:
 * Matches lines like:
 *   - "Reinforce 3—{3}{G} ({3}{G}, Discard this card: Put three +1/+1 counters...)"
 */
const reinforceExtractor: HandAbilityExtractor = {
  name: 'Reinforce',
  extract(line: string): HandAbility | null {
    const match = line.match(/^Reinforce\s+\d+[\s—-]+(\{[^}]+\}(?:\{[^}]+\})*)/i);
    if (!match || !match[1]) return null;

    return {
      kind: 'reinforce',
      name: 'Reinforce',
      manaCost: match[1].trim(),
      isCycling: false,
      text: line,
    };
  },
};

/**
 * 5. Generic Discard-from-Hand Extractor:
 * Matches lines where discarding this card is part of the activation cost:
 *   - "{B}, Discard this card: Target creature gets -3/-1 until end of turn." (Proft)
 *   - "{1}{G}, Discard this card: Return target land card..." (Altanak)
 *   - "Discard this card: ..." (0 mana, e.g. Faerie Macabre)
 *
 * Safety guards:
 *   - Must NOT contain {T} (tap symbol indicates an on-battlefield permanent ability).
 *   - Must NOT match "Discard a card:" / "Discard a nonland card:" (battlefield abilities).
 *   - Must NOT be restricted to sorcery speed.
 */
const genericDiscardExtractor: HandAbilityExtractor = {
  name: 'Discard',
  extract(line: string): HandAbility | null {
    // Battlefield tapping permanent abilities cannot be activated from hand
    if (line.includes('{T}')) return null;

    // Pattern with mana cost: "{B}, Discard this card:" or "{1}{G}, Discard CardName:"
    const costMatch = line.match(
      /^(?:[^\n:—]+—\s*)?(\{[^}]+\}(?:\{[^}]+\})*),\s*Discard (?:this card|[A-Z][a-zA-Z0-9\s,'"-]+?):/i,
    );
    if (costMatch && costMatch[1]) {
      return {
        kind: 'discard',
        name: 'Discard',
        manaCost: costMatch[1].trim(),
        isCycling: false,
        text: line,
      };
    }

    // Free / 0-mana discard pattern: "Discard this card:" or "Discard CardName:"
    const freeMatch = line.match(
      /^(?:[^\n:—]+—\s*)?Discard (?:this card|[A-Z][a-zA-Z0-9\s,'"-]+?):/i,
    );
    if (freeMatch) {
      return {
        kind: 'discard',
        name: 'Discard',
        manaCost: '',
        isCycling: false,
        text: line,
      };
    }

    return null;
  },
};

/**
 * Registered list of extractors in order of precedence.
 * To add new classes of hand-activated abilities in the future, add them here.
 */
export const HAND_ABILITY_EXTRACTORS: readonly HandAbilityExtractor[] = [
  cyclingExtractor,
  channelExtractor,
  bloodrushExtractor,
  reinforceExtractor,
  genericDiscardExtractor,
];

/**
 * Returns true if a given line contains an explicit sorcery-speed restriction.
 */
function isRestrictedToSorcery(line: string): boolean {
  return /activate only as a sorcery|any time you could cast a sorcery/i.test(line);
}

/**
 * Extracts all instant-speed hand-activated abilities from a block of oracle text.
 */
export function extractHandAbilitiesFromText(oracleText: string, card: Card): HandAbility[] {
  if (!oracleText) return [];

  const results: HandAbility[] = [];
  const lines = oracleText.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Sorcery-speed abilities cannot be used as instant-speed tricks
    if (isRestrictedToSorcery(line)) continue;

    for (const extractor of HAND_ABILITY_EXTRACTORS) {
      const ability = extractor.extract(line, card);
      if (ability) {
        if (Array.isArray(ability)) {
          results.push(...ability);
        } else {
          results.push(ability);
        }
        break; // Match the first matching extractor for this line
      }
    }
  }

  return results;
}

/**
 * Extracts all instant-speed hand-activated abilities for a given card.
 * Inspects `card.oracle_text` for single-faced cards, as well as `oracle_text`
 * on each face for multi-faced cards.
 *
 * If no cycling ability was found in oracle text, but `card.keywords` indicates
 * a cycling variant (e.g. "Islandcycling", "Halflingcycling", "Hobbitcycling"),
 * it extracts a fallback cycling ability so it is never missed.
 */
export function extractHandAbilities(card: Card): HandAbility[] {
  const abilities: HandAbility[] = [];

  if (card.oracle_text) {
    abilities.push(...extractHandAbilitiesFromText(card.oracle_text, card));
  }

  if (card.card_faces) {
    for (const face of card.card_faces) {
      if (face.oracle_text) {
        abilities.push(...extractHandAbilitiesFromText(face.oracle_text, card));
      }
    }
  }

  // Fallback: If no cycling ability was extracted from oracle text, but card.keywords has cycling
  // (e.g. "Islandcycling", "Halflingcycling", "Hobbitcycling", "Basic landcycling", etc.),
  // ensure it is captured as a cycling ability.
  if (card.keywords && !abilities.some((a) => a.isCycling)) {
    for (const kw of card.keywords) {
      if (isCyclingAbility(kw)) {
        abilities.push({
          kind: 'cycling',
          name: kw,
          manaCost: '',
          isCycling: true,
          text: kw,
        });
        break;
      }
    }
  }

  return abilities;
}
