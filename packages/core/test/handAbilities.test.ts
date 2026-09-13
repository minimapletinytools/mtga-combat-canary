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
