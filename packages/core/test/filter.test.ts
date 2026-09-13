import { describe, expect, it, vi } from 'vitest';
import type { Card, CastabilityResult, OpenMana, Rarity, TrickResult } from '../src/types';

// ---------------------------------------------------------------------------
// Mock '../src/mana' (resolves to the same module file as filter.ts's './mana'
// import). mana.ts is owned by a different, concurrently-developed work
// package and currently throws 'not implemented' — findTricks tests must not
// depend on its real behavior. parseManaCost/canCast are replaced with a
// tiny fake driven by a lookup table keyed on the raw mana-cost string.
//
// instantSpeedFaces and sortTricks never call into './mana', so they are
// tested below without any mocking.
// ---------------------------------------------------------------------------
const { parseManaCostMock, canCastMock } = vi.hoisted(() => {
  const castabilityTable: Record<string, { castable: boolean; usesXZero: boolean; mayUseLife: boolean }> = {
    '{R}': { castable: true, usesXZero: false, mayUseLife: false },
    '{1}{B}': { castable: false, usesXZero: false, mayUseLife: false },
    '{1}{R}': { castable: true, usesXZero: false, mayUseLife: false },
    '{1}{U}': { castable: true, usesXZero: false, mayUseLife: false },
    '{2}{G}': { castable: false, usesXZero: false, mayUseLife: false },
    '{3}{U}': { castable: false, usesXZero: false, mayUseLife: false },
    '{X}{R}': { castable: true, usesXZero: true, mayUseLife: false },
    '{B}': { castable: true, usesXZero: false, mayUseLife: false },
    '{2}{B}': { castable: false, usesXZero: false, mayUseLife: false },
    '{2}': { castable: true, usesXZero: false, mayUseLife: false },
  };

  const parseManaCostMock = (cost: string) => ({ pips: [], raw: cost });
  const canCastMock = (parsed: { raw: string }) =>
    castabilityTable[parsed.raw] ?? { castable: false, usesXZero: false, mayUseLife: false };

  return { parseManaCostMock, canCastMock };
});

vi.mock('../src/mana', () => ({
  parseManaCost: parseManaCostMock,
  canCast: canCastMock,
}));

// vi.mock calls (and their vi.hoisted dependencies above) are hoisted by
// Vitest above this import, so filter.ts's internal `./mana` import
// resolves to the mock below.
import { findTricks, hasCyclingTricks, instantSpeedFaces, sortTricks } from '../src/filter';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCard(overrides: Partial<Card> & Pick<Card, 'id' | 'name'>): Card {
  return {
    set: 'tst',
    collector_number: '1',
    rarity: 'common',
    mana_cost: '{1}',
    cmc: 1,
    type_line: 'Creature — Test',
    keywords: [],
    layout: 'normal',
    games: ['arena'],
    scryfall_uri: 'https://scryfall.com/card/tst/1',
    ...overrides,
  };
}

const plainInstant = makeCard({
  id: 'card-instant',
  name: 'Lightning Bolt',
  rarity: 'common',
  mana_cost: '{R}',
  cmc: 1,
  type_line: 'Instant',
  keywords: [],
});

const flashCreature = makeCard({
  id: 'card-flash',
  name: 'Ambush Viper',
  rarity: 'uncommon',
  mana_cost: '{1}{B}',
  cmc: 2,
  type_line: 'Creature — Snake',
  keywords: ['Flash', 'Deathtouch'],
});

const sorceryCard = makeCard({
  id: 'card-sorcery',
  name: 'Divination',
  rarity: 'common',
  mana_cost: '{2}{U}',
  cmc: 3,
  type_line: 'Sorcery',
  keywords: [],
});

const adventureCard = makeCard({
  id: 'card-adventure',
  name: 'Bonecrusher Giant',
  rarity: 'rare',
  mana_cost: undefined,
  cmc: 2,
  type_line: 'Creature — Giant // Instant — Adventure',
  keywords: [],
  layout: 'adventure',
  card_faces: [
    {
      name: 'Bonecrusher Giant',
      mana_cost: '{2}{R}',
      type_line: 'Creature — Giant',
      oracle_text: 'Whenever this creature becomes the target of a spell, this creature deals 2 damage to that spell’s controller.',
    },
    {
      name: 'Stomp',
      mana_cost: '{1}{R}',
      type_line: 'Instant — Adventure',
      oracle_text: 'Damage can’t be prevented this turn. Stomp deals 2 damage to any target.',
    },
  ],
});

const splitCard = makeCard({
  id: 'card-split',
  name: 'Fire // Ice',
  rarity: 'uncommon',
  mana_cost: undefined,
  cmc: 2,
  type_line: 'Instant // Instant',
  keywords: [],
  layout: 'split',
  card_faces: [
    {
      name: 'Fire',
      mana_cost: '{1}{R}',
      type_line: 'Sorcery',
      oracle_text: 'Fire deals 2 damage divided as you choose among one or two targets.',
    },
    {
      name: 'Ice',
      mana_cost: '{1}{U}',
      type_line: 'Instant',
      oracle_text: 'Tap target permanent. Counter target spell unless its controller pays {1}.',
    },
  ],
});

const transformCard = makeCard({
  id: 'card-transform',
  name: 'Moonlit Hunter',
  rarity: 'rare',
  mana_cost: undefined,
  cmc: 3,
  type_line: 'Creature — Werewolf',
  keywords: ['Flash'],
  layout: 'transform',
  card_faces: [
    {
      name: 'Moonlit Hunter',
      mana_cost: '{2}{G}',
      type_line: 'Creature — Werewolf',
      oracle_text: 'Flash',
    },
    {
      name: 'Moonlit Predator',
      mana_cost: '',
      type_line: 'Creature — Werewolf',
      oracle_text: '',
    },
  ],
});

const landCard = makeCard({
  id: 'card-land',
  name: 'Forest',
  rarity: 'common',
  mana_cost: '',
  cmc: 0,
  type_line: 'Basic Land — Forest',
  keywords: [],
});

const mdfcWithLandBack = makeCard({
  id: 'card-mdfc-land',
  name: 'Glasspool Front // Glasspool Back',
  rarity: 'uncommon',
  mana_cost: undefined,
  cmc: 2,
  type_line: 'Creature — Elemental // Land',
  keywords: ['Flash'],
  layout: 'modal_dfc',
  card_faces: [
    {
      name: 'Glasspool Front',
      mana_cost: '{1}{G}',
      type_line: 'Creature — Elemental',
      oracle_text: 'Flash',
    },
    {
      // Deliberately non-empty mana_cost so this fixture isolates the
      // Land-typeline exclusion from the empty-mana_cost skip.
      name: 'Glasspool Back',
      mana_cost: '{0}',
      type_line: 'Land',
      oracle_text: 'T: Add G.',
    },
  ],
});

// A synthetic card with two competing instant-speed faces, used to verify
// findTricks prefers the castable one regardless of face order.
const dualInstantCard = makeCard({
  id: 'card-dual',
  name: 'Twin Bolt Left // Twin Bolt Right',
  rarity: 'mythic',
  mana_cost: undefined,
  cmc: 4,
  type_line: 'Instant // Instant',
  keywords: [],
  layout: 'split',
  card_faces: [
    { name: 'Twin Bolt Left', mana_cost: '{3}{U}', type_line: 'Instant', oracle_text: '' },
    { name: 'Twin Bolt Right', mana_cost: '{R}', type_line: 'Instant', oracle_text: '' },
  ],
});

const xSpellCard = makeCard({
  id: 'card-x',
  name: 'Fireball',
  rarity: 'rare',
  mana_cost: '{X}{R}',
  cmc: 1,
  type_line: 'Instant',
  keywords: [],
});

// ---------------------------------------------------------------------------
// instantSpeedFaces — no mocking, pure logic
// ---------------------------------------------------------------------------

describe('instantSpeedFaces', () => {
  it('detects a plain instant by type_line', () => {
    expect(instantSpeedFaces(plainInstant)).toEqual([
      { faceName: 'Lightning Bolt', reason: 'instant', manaCost: '{R}' },
    ]);
  });

  it('detects a flash creature by keywords', () => {
    expect(instantSpeedFaces(flashCreature)).toEqual([
      { faceName: 'Ambush Viper', reason: 'flash', manaCost: '{1}{B}' },
    ]);
  });

  it('excludes a sorcery', () => {
    expect(instantSpeedFaces(sorceryCard)).toEqual([]);
  });

  it('counts only the Instant — Adventure half of an adventure card', () => {
    expect(instantSpeedFaces(adventureCard)).toEqual([
      { faceName: 'Stomp', reason: 'instant', manaCost: '{1}{R}' },
    ]);
  });

  it('counts only the instant half of a split card', () => {
    expect(instantSpeedFaces(splitCard)).toEqual([
      { faceName: 'Ice', reason: 'instant', manaCost: '{1}{U}' },
    ]);
  });

  it('for a transform card, includes only the castable front (flash) and skips the empty-cost back', () => {
    expect(instantSpeedFaces(transformCard)).toEqual([
      { faceName: 'Moonlit Hunter', reason: 'flash', manaCost: '{2}{G}' },
    ]);
  });

  it('excludes a land', () => {
    expect(instantSpeedFaces(landCard)).toEqual([]);
  });

  it('excludes a Land-typed back face even when it has a non-empty mana_cost, while still attributing card-level Flash to the front face', () => {
    expect(instantSpeedFaces(mdfcWithLandBack)).toEqual([
      { faceName: 'Glasspool Front', reason: 'flash', manaCost: '{1}{G}' },
    ]);
  });

  it('can return multiple instant-speed faces for one card', () => {
    expect(instantSpeedFaces(dualInstantCard)).toEqual([
      { faceName: 'Twin Bolt Left', reason: 'instant', manaCost: '{3}{U}' },
      { faceName: 'Twin Bolt Right', reason: 'instant', manaCost: '{R}' },
    ]);
  });

  it('detects discard abilities on creature cards (e.g. Proft, Sinister Mastermind)', () => {
    const proftCard = makeCard({
      id: 'card-proft',
      name: 'Proft, Sinister Mastermind',
      mana_cost: '{2}{B}',
      type_line: 'Legendary Creature — Human Rogue',
      keywords: ['Threshold', 'Menace'],
      oracle_text:
        "Threshold — You can't cast this spell unless there are seven or more cards in your graveyard.\nMenace\n{B}, Discard this card: Target creature gets -3/-1 until end of turn.",
    });

    expect(instantSpeedFaces(proftCard)).toEqual([
      {
        faceName: 'Proft, Sinister Mastermind',
        reason: 'ability',
        manaCost: '{B}',
        isCycling: false,
        abilityName: 'Discard',
        abilityText: '{B}, Discard this card: Target creature gets -3/-1 until end of turn.',
      },
    ]);
  });

  it('detects cycling abilities on non-instant cards and tags them with isCycling', () => {
    const cyclingCreature = makeCard({
      id: 'card-cycler',
      name: 'Cycling Monster',
      mana_cost: '{4}{G}{G}',
      type_line: 'Creature — Beast',
      keywords: ['Cycling'],
      oracle_text: 'Cycling {2} ({2}, Discard this card: Draw a card.)',
    });

    expect(instantSpeedFaces(cyclingCreature)).toEqual([
      {
        faceName: 'Cycling Monster',
        reason: 'cycling',
        manaCost: '{2}',
        isCycling: true,
        abilityName: 'Cycling',
        abilityText: 'Cycling {2} ({2}, Discard this card: Draw a card.)',
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// findTricks — mana.ts mocked
// ---------------------------------------------------------------------------

describe('findTricks', () => {
  const mana: OpenMana = { sources: [] };

  const proftCard = makeCard({
    id: 'card-proft',
    name: 'Proft, Sinister Mastermind',
    mana_cost: '{2}{B}', // {2}{B} is not castable in our mock
    type_line: 'Legendary Creature — Human Rogue',
    keywords: ['Threshold', 'Menace'],
    oracle_text: '{B}, Discard this card: Target creature gets -3/-1 until end of turn.', // {B} is castable
  });

  const cyclingCreature = makeCard({
    id: 'card-cycler',
    name: 'Cycling Monster',
    mana_cost: '{4}{G}{G}',
    type_line: 'Creature — Beast',
    oracle_text: 'Cycling {2}', // {2} is castable
  });

  const instantWithCycling = makeCard({
    id: 'card-instant-cycling',
    name: 'Censor Clone',
    mana_cost: '{1}{U}', // {1}{U} is castable
    type_line: 'Instant',
    oracle_text: 'Counter target spell unless its controller pays {1}.\nCycling {2}', // {2} also castable
  });

  it('excludes cards with no instant-speed face (sorcery, land)', () => {
    const results = findTricks([sorceryCard, landCard], mana);
    expect(results).toEqual([]);
  });

  it('emits a TrickResult for a castable plain instant', () => {
    const results = findTricks([plainInstant], mana);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      faceName: 'Lightning Bolt',
      reason: 'instant',
      castability: { castable: true, usesXZero: false, mayUseLife: false },
    });
    expect(results[0]?.card.id).toBe('card-instant');
  });

  it('still emits a TrickResult for a card whose only face is not currently castable', () => {
    const results = findTricks([flashCreature], mana);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      faceName: 'Ambush Viper',
      reason: 'flash',
      castability: { castable: false },
    });
  });

  it('uses the Instant — Adventure half for an adventure card', () => {
    const results = findTricks([adventureCard], mana);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      faceName: 'Stomp',
      reason: 'instant',
      castability: { castable: true },
    });
  });

  it('uses the instant half for a split card', () => {
    const results = findTricks([splitCard], mana);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      faceName: 'Ice',
      reason: 'instant',
      castability: { castable: true },
    });
  });

  it('uses the castable front face for a transform card, ignoring the skipped back', () => {
    const results = findTricks([transformCard], mana);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      faceName: 'Moonlit Hunter',
      reason: 'flash',
      castability: { castable: false },
    });
  });

  it('prefers the castable face over a non-castable earlier face on the same card', () => {
    const results = findTricks([dualInstantCard], mana);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      faceName: 'Twin Bolt Right',
      reason: 'instant',
      castability: { castable: true },
    });
  });

  it('propagates usesXZero from castability', () => {
    const results = findTricks([xSpellCard], mana);
    expect(results).toHaveLength(1);
    expect(results[0]?.castability).toEqual({ castable: true, usesXZero: true, mayUseLife: false });
  });

  it('emits at most one TrickResult per card and skips excluded cards, across a mixed batch', () => {
    const results = findTricks(
      [plainInstant, sorceryCard, flashCreature, landCard, adventureCard, splitCard, transformCard, dualInstantCard],
      mana,
    );
    expect(results).toHaveLength(6);
    const ids = results.map((r) => r.card.id);
    expect(new Set(ids).size).toBe(ids.length); // at most one per card
    expect(ids).not.toContain('card-sorcery');
    expect(ids).not.toContain('card-land');
  });

  it('evaluates Proft against its discard ability cost {B} rather than card cost {2}{B}', () => {
    // In our mock castabilityTable:
    // {B} is castable: true
    // {2}{B} is castable: false
    const results = findTricks([proftCard], mana);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      card: proftCard,
      faceName: 'Proft, Sinister Mastermind',
      reason: 'ability',
      abilityName: 'Discard',
      castability: { castable: true },
      isCycling: false,
    });
  });

  it('includes cycling cards by default and tags them with isCycling', () => {
    const results = findTricks([cyclingCreature], mana);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      card: cyclingCreature,
      faceName: 'Cycling Monster',
      reason: 'cycling',
      isCycling: true,
      castability: { castable: true },
    });
  });

  it('hides pure cycling cards when hideCycling option is true', () => {
    const results = findTricks([cyclingCreature, proftCard], mana, { hideCycling: true });
    // cyclingCreature should be hidden, but proftCard (real combat trick) remains
    expect(results).toHaveLength(1);
    expect(results[0]?.card.id).toBe('card-proft');
  });

  it('prefers instant castable face over cycling face on the same card', () => {
    // instantWithCycling has {1}{U} instant (castable) and {2} cycling (castable)
    const results = findTricks([instantWithCycling], mana);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      reason: 'instant',
      isCycling: undefined, // or false
    });
  });

  it('hasCyclingTricks identifies whether results contain cycling cards', () => {
    const withCycling = findTricks([cyclingCreature, proftCard], mana);
    expect(hasCyclingTricks(withCycling)).toBe(true);

    const withoutCycling = findTricks([proftCard], mana);
    expect(hasCyclingTricks(withoutCycling)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sortTricks — no mocking, pure logic
// ---------------------------------------------------------------------------

function makeTrickResult(rarity: Rarity, name: string, id: string): TrickResult {
  const castability: CastabilityResult = { castable: true, usesXZero: false, mayUseLife: false };
  return {
    card: makeCard({ id, name, rarity }),
    faceName: name,
    reason: 'instant',
    castability,
  };
}

describe('sortTricks', () => {
  const alphaCommon = makeTrickResult('common', 'Alpha Common', 't-alpha-common');
  const betaCommon = makeTrickResult('common', 'Beta Common', 't-beta-common');
  const rare = makeTrickResult('rare', 'Rare Card', 't-rare');
  const mythic = makeTrickResult('mythic', 'Mythic Card', 't-mythic');
  const bonus = makeTrickResult('bonus', 'Bonus Card', 't-bonus');

  it('common-first: ascending by rarity rank, then name ascending', () => {
    const input = [mythic, rare, betaCommon, alphaCommon, bonus];
    const sorted = sortTricks(input, 'common-first');
    expect(sorted.map((r) => r.card.name)).toEqual([
      'Alpha Common',
      'Beta Common',
      'Rare Card',
      'Mythic Card',
      'Bonus Card',
    ]);
  });

  it('mythic-first: descending by rarity rank, name still ascending within a rarity', () => {
    const input = [alphaCommon, betaCommon, rare, mythic, bonus];
    const sorted = sortTricks(input, 'mythic-first');
    expect(sorted.map((r) => r.card.name)).toEqual([
      'Bonus Card',
      'Mythic Card',
      'Rare Card',
      'Alpha Common',
      'Beta Common',
    ]);
  });

  it('is stable for entries with identical rarity and name, preserving input order', () => {
    const dupA: TrickResult = { ...makeTrickResult('common', 'Same Name', 't-dup-a') };
    const dupB: TrickResult = { ...makeTrickResult('common', 'Same Name', 't-dup-b') };

    const sortedForward = sortTricks([dupA, dupB], 'common-first');
    expect(sortedForward.map((r) => r.card.id)).toEqual(['t-dup-a', 't-dup-b']);

    const sortedReversed = sortTricks([dupB, dupA], 'common-first');
    expect(sortedReversed.map((r) => r.card.id)).toEqual(['t-dup-b', 't-dup-a']);
  });

  it('does not mutate the input array', () => {
    const input = [mythic, alphaCommon];
    const inputCopy = [...input];
    sortTricks(input, 'common-first');
    expect(input).toEqual(inputCopy);
  });
});
