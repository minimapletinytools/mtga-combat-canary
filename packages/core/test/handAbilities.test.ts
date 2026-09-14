import { describe, expect, it } from 'vitest';
import type { Card } from '../src/types.js';
import {
  extractHandAbilities,
  extractHandAbilitiesFromText,
  isCyclingAbility,
} from '../src/handAbilities.js';

function makeCard(overrides: Partial<Card>): Card {
  return {
    id: 'test-id',
    name: 'Test Card',
    set: 'tst',
    collector_number: '1',
    rarity: 'rare',
    mana_cost: '{2}{B}',
    cmc: 3,
    type_line: 'Creature',
    keywords: [],
    layout: 'normal',
    games: ['arena'],
    scryfall_uri: 'https://scryfall.com/card/tst/1',
    ...overrides,
  };
}

describe('isCyclingAbility', () => {
  it('identifies standard cycling and all typecycling variations', () => {
    expect(isCyclingAbility('Cycling')).toBe(true);
    expect(isCyclingAbility('cycling')).toBe(true);
    expect(isCyclingAbility('Basic landcycling')).toBe(true);
    expect(isCyclingAbility('Plainscycling')).toBe(true);
    expect(isCyclingAbility('Islandcycling')).toBe(true);
    expect(isCyclingAbility('Swampcycling')).toBe(true);
    expect(isCyclingAbility('Mountaincycling')).toBe(true);
    expect(isCyclingAbility('Forestcycling')).toBe(true);
    expect(isCyclingAbility('Landcycling')).toBe(true);
    expect(isCyclingAbility('Halflingcycling')).toBe(true);
    expect(isCyclingAbility('Hobbitcycling')).toBe(true);
    expect(isCyclingAbility('hobbitcycling')).toBe(true);
    expect(isCyclingAbility('Slivercycling')).toBe(true);
    expect(isCyclingAbility('Wizardcycling')).toBe(true);
    expect(isCyclingAbility('Typecycling')).toBe(true);
  });

  it('rejects non-cycling abilities', () => {
    expect(isCyclingAbility('Channel')).toBe(false);
    expect(isCyclingAbility('Bloodrush')).toBe(false);
    expect(isCyclingAbility('Reinforce')).toBe(false);
    expect(isCyclingAbility('Discard')).toBe(false);
    expect(isCyclingAbility('Flash')).toBe(false);
    expect(isCyclingAbility('Flying')).toBe(false);
  });
});

describe('extractHandAbilities', () => {
  it('extracts discard ability from Proft, Sinister Mastermind at ability cost {B}', () => {
    const proft = makeCard({
      name: 'Proft, Sinister Mastermind',
      type_line: 'Legendary Creature — Human Rogue',
      mana_cost: '{2}{B}',
      keywords: ['Threshold', 'Menace'],
      oracle_text:
        "Threshold — You can't cast this spell unless there are seven or more cards in your graveyard.\nMenace\n{B}, Discard this card: Target creature gets -3/-1 until end of turn.",
    });

    const abilities = extractHandAbilities(proft);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toEqual({
      kind: 'discard',
      name: 'Discard',
      manaCost: '{B}',
      isCycling: false,
      text: '{B}, Discard this card: Target creature gets -3/-1 until end of turn.',
    });
  });

  it('extracts discard ability with specific card name (e.g. Altanak)', () => {
    const altanak = makeCard({
      name: 'Altanak, the Thrice-Called',
      mana_cost: '{5}{G}{G}',
      oracle_text:
        'Trample\n{1}{G}, Discard this card: Return target land card from your graveyard to the battlefield tapped.',
    });

    const abilities = extractHandAbilities(altanak);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]?.manaCost).toBe('{1}{G}');
    expect(abilities[0]?.isCycling).toBe(false);
  });

  it('extracts zero-cost discard abilities (e.g. Faerie Macabre)', () => {
    const faerie = makeCard({
      name: 'Faerie Macabre',
      mana_cost: '{1}{B}{B}',
      oracle_text:
        'Flying\nDiscard Faerie Macabre: Exile up to two target cards from graveyards.',
    });

    const abilities = extractHandAbilities(faerie);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]?.manaCost).toBe('');
    expect(abilities[0]?.isCycling).toBe(false);
  });

  it('extracts Channel abilities (e.g. Boseiju, Who Endures)', () => {
    const boseiju = makeCard({
      name: 'Boseiju, Who Endures',
      type_line: 'Legendary Land',
      mana_cost: undefined,
      oracle_text:
        '{T}: Add {G}.\nChannel — {1}{G}, Discard Boseiju, Who Endures: Destroy target artifact, enchantment, or nonbasic land an opponent controls.',
    });

    const abilities = extractHandAbilities(boseiju);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toEqual({
      kind: 'channel',
      name: 'Channel',
      manaCost: '{1}{G}',
      isCycling: false,
      text: 'Channel — {1}{G}, Discard Boseiju, Who Endures: Destroy target artifact, enchantment, or nonbasic land an opponent controls.',
    });
  });

  it('extracts multiple Channel abilities on the same card (e.g. Colossal Skyturtle)', () => {
    const skyturtle = makeCard({
      name: 'Colossal Skyturtle',
      mana_cost: '{4}{G}{G}{U}',
      oracle_text:
        "Flying, ward {2}\nChannel — {2}{G}, Discard this card: Return target card from your graveyard to your hand.\nChannel — {1}{U}, Discard this card: Return target creature to its owner's hand.",
    });

    const abilities = extractHandAbilities(skyturtle);
    expect(abilities).toHaveLength(2);
    expect(abilities[0]?.manaCost).toBe('{2}{G}');
    expect(abilities[1]?.manaCost).toBe('{1}{U}');
  });

  it('extracts Bloodrush abilities (e.g. Ghor-Clan Rampager)', () => {
    const rampager = makeCard({
      name: 'Ghor-Clan Rampager',
      mana_cost: '{2}{R}{G}',
      oracle_text:
        'Bloodrush — {R}{G}, Discard Ghor-Clan Rampager: Target attacking creature gets +4/+4 and gains trample until end of turn.',
    });

    const abilities = extractHandAbilities(rampager);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toEqual({
      kind: 'bloodrush',
      name: 'Bloodrush',
      manaCost: '{R}{G}',
      isCycling: false,
      text: 'Bloodrush — {R}{G}, Discard Ghor-Clan Rampager: Target attacking creature gets +4/+4 and gains trample until end of turn.',
    });
  });

  it('extracts Reinforce abilities (e.g. Hunting Triad)', () => {
    const triad = makeCard({
      name: 'Hunting Triad',
      mana_cost: '{3}{G}',
      oracle_text:
        'Reinforce 3—{3}{G} ({3}{G}, Discard this card: Put three +1/+1 counters on target creature.)',
    });

    const abilities = extractHandAbilities(triad);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]?.kind).toBe('reinforce');
    expect(abilities[0]?.manaCost).toBe('{3}{G}');
    expect(abilities[0]?.isCycling).toBe(false);
  });

  it('extracts standard cycling and marks isCycling: true', () => {
    const rex = makeCard({
      name: 'Agonasaur Rex',
      mana_cost: '{3}{G}{G}',
      oracle_text:
        'Trample\nCycling {2}{G} ({2}{G}, Discard this card: Draw a card.)\nWhen you cycle this card, put two +1/+1 counters...',
    });

    const abilities = extractHandAbilities(rex);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toEqual({
      kind: 'cycling',
      name: 'Cycling',
      manaCost: '{2}{G}',
      isCycling: true,
      text: 'Cycling {2}{G} ({2}{G}, Discard this card: Draw a card.)',
    });
  });

  it('extracts typecycling abilities and marks isCycling: true', () => {
    const scientists = makeCard({
      name: 'A.I.M. Scientists',
      mana_cost: '{3}{U}',
      oracle_text:
        'When this creature enters, it connives.\nBasic landcycling {2} ({2}, Discard this card: Search your library for a basic land card...)',
    });

    const abilities = extractHandAbilities(scientists);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toEqual({
      kind: 'cycling',
      name: 'Basic landcycling',
      manaCost: '{2}',
      isCycling: true,
      text: 'Basic landcycling {2} ({2}, Discard this card: Search your library for a basic land card...)',
    });
  });

  it('extracts Islandcycling (e.g. Lórien Revealed)', () => {
    const lorien = makeCard({
      name: 'Lórien Revealed',
      type_line: 'Sorcery',
      mana_cost: '{3}{U}{U}',
      oracle_text:
        'Draw three cards.\nIslandcycling {1} ({1}, Discard this card: Search your library for an Island card, reveal it, put it into your hand, then shuffle.)',
      keywords: ['Islandcycling', 'Landcycling', 'Typecycling', 'Cycling'],
    });

    const abilities = extractHandAbilities(lorien);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toEqual({
      kind: 'cycling',
      name: 'Islandcycling',
      manaCost: '{1}',
      isCycling: true,
      text: 'Islandcycling {1} ({1}, Discard this card: Search your library for an Island card, reveal it, put it into your hand, then shuffle.)',
    });
  });

  it('extracts Halflingcycling (e.g. Hobbit Hole) and Hobbitcycling', () => {
    const hobbitHole = makeCard({
      name: 'Hobbit Hole',
      type_line: 'Land',
      oracle_text:
        '{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\nHalflingcycling {4} ({4}, Discard this card: Search your library for a Halfling card, reveal it, put it into your hand, then shuffle.)',
      keywords: ['Halflingcycling', 'Typecycling', 'Cycling'],
    });

    const hobbitAbilities = extractHandAbilities(hobbitHole);
    expect(hobbitAbilities).toHaveLength(1);
    expect(hobbitAbilities[0]).toEqual({
      kind: 'cycling',
      name: 'Halflingcycling',
      manaCost: '{4}',
      isCycling: true,
      text: 'Halflingcycling {4} ({4}, Discard this card: Search your library for a Halfling card, reveal it, put it into your hand, then shuffle.)',
    });

    const customHobbit = makeCard({
      name: 'Hobbit Scout',
      oracle_text: 'Hobbitcycling {2} ({2}, Discard this card: Search your library for a Hobbit card...)',
      keywords: ['Hobbitcycling', 'Cycling'],
    });

    const customAbilities = extractHandAbilities(customHobbit);
    expect(customAbilities).toHaveLength(1);
    expect(customAbilities[0]?.name).toBe('Hobbitcycling');
    expect(customAbilities[0]?.manaCost).toBe('{2}');
    expect(customAbilities[0]?.isCycling).toBe(true);
  });

  it('extracts cycling when embedded in a comma-separated keyword list (e.g. Blast from the Past)', () => {
    const blast = makeCard({
      name: 'Blast from the Past',
      oracle_text:
        'Madness {R}, cycling {1}{R}, kicker {2}{R}, flashback {3}{R}, buyback {4}{R}\nBlast from the Past deals 2 damage to any target.',
      keywords: ['Cycling', 'Flashback', 'Madness', 'Kicker', 'Buyback'],
    });

    const abilities = extractHandAbilities(blast);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]?.name).toBe('cycling');
    expect(abilities[0]?.manaCost).toBe('{1}{R}');
    expect(abilities[0]?.isCycling).toBe(true);
  });

  it('extracts non-mana cycling abilities (e.g. Street Wraith, Edge of Autumn)', () => {
    const streetWraith = makeCard({
      name: 'Street Wraith',
      oracle_text:
        'Swampwalk\nCycling—Pay 2 life. (Pay 2 life, Discard this card: Draw a card.)',
      keywords: ['Swampwalk', 'Cycling'],
    });

    const wraithAbilities = extractHandAbilities(streetWraith);
    expect(wraithAbilities).toHaveLength(1);
    expect(wraithAbilities[0]?.name).toBe('Cycling');
    expect(wraithAbilities[0]?.manaCost).toBe('');
    expect(wraithAbilities[0]?.isCycling).toBe(true);

    const edge = makeCard({
      name: 'Edge of Autumn',
      oracle_text:
        'Search your library...\nCycling—Sacrifice a land. (Sacrifice a land, Discard this card: Draw a card.)',
      keywords: ['Cycling'],
    });

    const edgeAbilities = extractHandAbilities(edge);
    expect(edgeAbilities).toHaveLength(1);
    expect(edgeAbilities[0]?.name).toBe('Cycling');
    expect(edgeAbilities[0]?.manaCost).toBe('');
    expect(edgeAbilities[0]?.isCycling).toBe(true);
  });

  it('extracts multiple cycling abilities on the same line', () => {
    const dualCycler = makeCard({
      name: 'Dual Cycler',
      oracle_text: 'Plainscycling {2}, Swampcycling {2}',
      keywords: ['Plainscycling', 'Swampcycling', 'Cycling'],
    });

    const abilities = extractHandAbilities(dualCycler);
    expect(abilities).toHaveLength(2);
    expect(abilities[0]?.name).toBe('Plainscycling');
    expect(abilities[0]?.manaCost).toBe('{2}');
    expect(abilities[1]?.name).toBe('Swampcycling');
    expect(abilities[1]?.manaCost).toBe('{2}');
  });

  it('falls back to card.keywords if oracle_text is missing but keyword indicates cycling', () => {
    const keywordOnly = makeCard({
      name: 'Keyword Cycler',
      oracle_text: undefined,
      keywords: ['Islandcycling', 'Cycling'],
    });

    const abilities = extractHandAbilities(keywordOnly);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]?.name).toBe('Islandcycling');
    expect(abilities[0]?.isCycling).toBe(true);
  });

  it('ignores abilities restricted to sorcery speed', () => {
    const sorceryAbility = makeCard({
      name: 'Slow Discarder',
      oracle_text:
        '{1}{R}, Discard this card: Deal 2 damage to any target. Activate only as a sorcery.',
    });

    expect(extractHandAbilities(sorceryAbility)).toHaveLength(0);
  });

  it('ignores permanent tap activated abilities that discard a card', () => {
    const bullseye = makeCard({
      name: 'Bullseye, Death Dealer',
      oracle_text:
        '{3}, {T}, Sacrifice an artifact or discard a nonland card: Bullseye deals 2 damage to any target.',
    });

    expect(extractHandAbilities(bullseye)).toHaveLength(0);
  });

  it('extracts abilities from card_faces on multi-face cards', () => {
    const dfc = makeCard({
      name: 'Front // Back',
      card_faces: [
        {
          name: 'Front',
          mana_cost: '{1}{U}',
          type_line: 'Creature',
          oracle_text: 'Cycling {1}',
        },
        {
          name: 'Back',
          mana_cost: '',
          type_line: 'Land',
          oracle_text: '{T}: Add {U}.',
        },
      ],
    });

    const abilities = extractHandAbilities(dfc);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]?.manaCost).toBe('{1}');
    expect(abilities[0]?.isCycling).toBe(true);
  });
});
