import type { Card, SetInfo } from '@mtgatricks/core';

/**
 * Injection seam between the UI and wherever card data actually comes from.
 * `CachedCardRepository` (packages/data) implements this same shape once
 * WP3 lands; until then `FixtureCardSource` below lets WP4 develop and
 * typecheck independently. See main.tsx for the swap point.
 */
export interface CardSource {
  listSets(): Promise<SetInfo[]>;
  getSetCards(code: string): Promise<Card[]>;
}

export const FIXTURE_SET: SetInfo = {
  code: 'fx1',
  name: 'Fixture Set One',
  released_at: '2026-06-01',
  set_type: 'expansion',
  card_count: 11,
  icon_svg_uri: '',
};

const PLACEHOLDER_IMAGE = (label: string) =>
  `https://placehold.co/223x310/1c1c24/e8e8ec/png?text=${encodeURIComponent(label)}`;

/**
 * ~10 synthetic cards covering instants, flash creatures, an excluded
 * sorcery, and a mix of rarities / pip kinds (generic, colored, hybrid,
 * mono-hybrid, phyrexian, X, colorless, and a multi-face adventure card).
 * Good enough to exercise TrickList's grouping/badges/image-fallback logic
 * while the real mana/filter engine (WP1/WP2) is still stubbed out.
 */
const FIXTURE_CARDS: Card[] = [
  {
    id: 'fx-1',
    name: 'Fixture Bolt',
    set: FIXTURE_SET.code,
    collector_number: '1',
    rarity: 'common',
    mana_cost: '{R}',
    cmc: 1,
    type_line: 'Instant',
    keywords: [],
    layout: 'normal',
    image_uris: { normal: PLACEHOLDER_IMAGE('Fixture Bolt'), small: PLACEHOLDER_IMAGE('Fixture Bolt') },
    games: ['arena', 'paper'],
    scryfall_uri: 'https://scryfall.com/card/fx1/1/fixture-bolt',
  },
  {
    id: 'fx-2',
    name: 'Fixture Cancel',
    set: FIXTURE_SET.code,
    collector_number: '2',
    rarity: 'common',
    mana_cost: '{1}{U}{U}',
    cmc: 3,
    type_line: 'Instant',
    keywords: [],
    layout: 'normal',
    image_uris: { normal: PLACEHOLDER_IMAGE('Fixture Cancel'), small: PLACEHOLDER_IMAGE('Fixture Cancel') },
    games: ['arena', 'paper'],
    scryfall_uri: 'https://scryfall.com/card/fx1/2/fixture-cancel',
  },
  {
    id: 'fx-3',
    name: 'Fixture Smite',
    set: FIXTURE_SET.code,
    collector_number: '3',
    rarity: 'uncommon',
    mana_cost: '{1}{W}',
    cmc: 2,
    type_line: 'Instant',
    keywords: [],
    layout: 'normal',
    // No image_uris on purpose — exercises TrickList's placeholder fallback.
    games: ['arena', 'paper'],
    scryfall_uri: 'https://scryfall.com/card/fx1/3/fixture-smite',
  },
  {
    id: 'fx-4',
    name: 'Fixture Firebolt X',
    set: FIXTURE_SET.code,
    collector_number: '4',
    rarity: 'uncommon',
    mana_cost: '{X}{R}',
    cmc: 1,
    type_line: 'Instant',
    keywords: [],
    layout: 'normal',
    image_uris: { normal: PLACEHOLDER_IMAGE('Firebolt X'), small: PLACEHOLDER_IMAGE('Firebolt X') },
    games: ['arena', 'paper'],
    scryfall_uri: 'https://scryfall.com/card/fx1/4/fixture-firebolt-x',
  },
  {
    id: 'fx-5',
    name: 'Fixture Hybrid Charm',
    set: FIXTURE_SET.code,
    collector_number: '5',
    rarity: 'rare',
    mana_cost: '{W/U}{W/U}',
    cmc: 2,
    type_line: 'Instant',
    keywords: [],
    layout: 'normal',
    image_uris: { normal: PLACEHOLDER_IMAGE('Hybrid Charm'), small: PLACEHOLDER_IMAGE('Hybrid Charm') },
    games: ['arena', 'paper'],
    scryfall_uri: 'https://scryfall.com/card/fx1/5/fixture-hybrid-charm',
  },
  {
    id: 'fx-6',
    name: 'Fixture Mono Hybrid Drain',
    set: FIXTURE_SET.code,
    collector_number: '6',
    rarity: 'rare',
    mana_cost: '{2/B}',
    cmc: 2,
    type_line: 'Instant',
    keywords: [],
    layout: 'normal',
    image_uris: { normal: PLACEHOLDER_IMAGE('Mono Hybrid Drain'), small: PLACEHOLDER_IMAGE('Mono Hybrid Drain') },
    games: ['arena', 'paper'],
    scryfall_uri: 'https://scryfall.com/card/fx1/6/fixture-mono-hybrid-drain',
  },
  {
    id: 'fx-7',
    name: 'Fixture Phyrexian Denial',
    set: FIXTURE_SET.code,
    collector_number: '7',
    rarity: 'mythic',
    mana_cost: '{U/P}{U/P}',
    cmc: 2,
    type_line: 'Instant',
    keywords: [],
    layout: 'normal',
    image_uris: { normal: PLACEHOLDER_IMAGE('Phyrexian Denial'), small: PLACEHOLDER_IMAGE('Phyrexian Denial') },
    games: ['arena', 'paper'],
    scryfall_uri: 'https://scryfall.com/card/fx1/7/fixture-phyrexian-denial',
  },
  {
    id: 'fx-8',
    name: 'Fixture Ambush Beast',
    set: FIXTURE_SET.code,
    collector_number: '8',
    rarity: 'common',
    mana_cost: '{1}{G}',
    cmc: 2,
    type_line: 'Creature — Beast',
    keywords: ['Flash'],
    layout: 'normal',
    image_uris: { normal: PLACEHOLDER_IMAGE('Ambush Beast'), small: PLACEHOLDER_IMAGE('Ambush Beast') },
    games: ['arena', 'paper'],
    scryfall_uri: 'https://scryfall.com/card/fx1/8/fixture-ambush-beast',
  },
  {
    id: 'fx-9',
    name: 'Fixture Mistral Sneak',
    set: FIXTURE_SET.code,
    collector_number: '9',
    rarity: 'rare',
    mana_cost: '{3}{U}',
    cmc: 4,
    type_line: 'Creature — Sphinx',
    keywords: ['Flash', 'Flying'],
    layout: 'normal',
    image_uris: { normal: PLACEHOLDER_IMAGE('Mistral Sneak'), small: PLACEHOLDER_IMAGE('Mistral Sneak') },
    games: ['arena', 'paper'],
    scryfall_uri: 'https://scryfall.com/card/fx1/9/fixture-mistral-sneak',
  },
  {
    id: 'fx-10',
    name: 'Fixture Doom Edict',
    set: FIXTURE_SET.code,
    collector_number: '10',
    rarity: 'common',
    mana_cost: '{2}{B}',
    cmc: 3,
    type_line: 'Sorcery',
    keywords: [],
    layout: 'normal',
    // Sorcery — should never appear as a trick even once the engine works.
    image_uris: { normal: PLACEHOLDER_IMAGE('Doom Edict'), small: PLACEHOLDER_IMAGE('Doom Edict') },
    games: ['arena', 'paper'],
    scryfall_uri: 'https://scryfall.com/card/fx1/10/fixture-doom-edict',
  },
  {
    id: 'fx-11',
    name: 'Fixture Petty Trick // Fixture Looming Threat',
    set: FIXTURE_SET.code,
    collector_number: '11',
    rarity: 'uncommon',
    cmc: 5,
    type_line: 'Instant — Adventure // Creature — Giant',
    keywords: [],
    layout: 'adventure',
    // No top-level image_uris — exercises the card_faces[0] image fallback.
    card_faces: [
      {
        name: 'Fixture Petty Trick',
        mana_cost: '{U}',
        type_line: 'Instant — Adventure',
        oracle_text: 'Return target creature to its owner’s hand.',
        image_uris: { normal: PLACEHOLDER_IMAGE('Petty Trick'), small: PLACEHOLDER_IMAGE('Petty Trick') },
      },
      {
        name: 'Fixture Looming Threat',
        mana_cost: '{3}{U}{U}',
        type_line: 'Creature — Giant',
        oracle_text: 'Whenever this creature deals combat damage, draw a card.',
      },
    ],
    games: ['arena', 'paper'],
    scryfall_uri: 'https://scryfall.com/card/fx1/11/fixture-petty-trick',
  },
];

/**
 * Hardcoded synthetic CardSource for local development while WP3's real
 * CachedCardRepository is still a stub. See main.tsx's USE_FIXTURES flag.
 */
export class FixtureCardSource implements CardSource {
  async listSets(): Promise<SetInfo[]> {
    return [FIXTURE_SET];
  }

  async getSetCards(code: string): Promise<Card[]> {
    // Small artificial delay so the "downloading set…" loading state is
    // actually visible during manual testing.
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (code !== FIXTURE_SET.code) return [];
    return FIXTURE_CARDS;
  }
}
