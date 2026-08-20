import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LineAssembler, extractGreEvent } from '../src/chunker';
import { GameStateTracker } from '../src/tracker';
import { deriveOpenMana, subtypesToProducedMana } from '../src/derive';

const FIXTURE = fileURLToPath(new URL('./fixtures/match-log.jsonl', import.meta.url));

describe('subtypesToProducedMana', () => {
  it('maps the six basic land subtypes', () => {
    expect(subtypesToProducedMana(['SubType_Plains'])).toEqual(['W']);
    expect(subtypesToProducedMana(['SubType_Island'])).toEqual(['U']);
    expect(subtypesToProducedMana(['SubType_Swamp'])).toEqual(['B']);
    expect(subtypesToProducedMana(['SubType_Mountain'])).toEqual(['R']);
    expect(subtypesToProducedMana(['SubType_Forest'])).toEqual(['G']);
    expect(subtypesToProducedMana(['SubType_Wastes'])).toEqual(['C']);
  });

  it('handles typed duals, non-land subtypes, and dedupes', () => {
    expect(subtypesToProducedMana(['SubType_Mountain', 'SubType_Forest'])).toEqual(['R', 'G']);
    expect(subtypesToProducedMana(['SubType_Goblin', 'SubType_Wizard'])).toEqual([]);
    expect(subtypesToProducedMana(['SubType_Forest', 'SubType_Forest'])).toEqual(['G']);
    expect(subtypesToProducedMana([])).toEqual([]);
  });

  it('maps mana tokens: Treasure/Gold to any color, Powerstone to C', () => {
    expect(subtypesToProducedMana(['SubType_Treasure'])).toEqual(['W', 'U', 'B', 'R', 'G']);
    expect(subtypesToProducedMana(['SubType_Gold'])).toEqual(['W', 'U', 'B', 'R', 'G']);
    expect(subtypesToProducedMana(['SubType_Powerstone'])).toEqual(['C']);
    // Non-mana tokens stay non-sources.
    expect(subtypesToProducedMana(['SubType_Clue'])).toEqual([]);
    expect(subtypesToProducedMana(['SubType_Food'])).toEqual([]);
    expect(subtypesToProducedMana(['SubType_Blood'])).toEqual([]);
  });
});

describe('treasure tokens as opponent mana sources', () => {
  // Object shape copied from a real Player.log treasure (2026-08-19):
  // GameObjectType_Token / CardType_Artifact / SubType_Treasure, zone 28.
  const treasure = (instanceId: number, extra: Record<string, unknown> = {}) => ({
    instanceId,
    grpId: 103595,
    type: 'GameObjectType_Token',
    zoneId: 28,
    visibility: 'Visibility_Public',
    ownerSeatId: 2,
    controllerSeatId: 2,
    cardTypes: ['CardType_Artifact'],
    subtypes: ['SubType_Treasure'],
    ...extra,
  });

  it('derives any-color sources from untapped treasures, skipping tapped ones', () => {
    const tracker = new GameStateTracker();
    tracker.applyEvent({
      greToClientMessages: [
        {
          type: 'GREMessageType_GameStateMessage',
          systemSeatIds: [1],
          gameStateMessage: {
            type: 'GameStateType_Full',
            zones: [{ zoneId: 28, type: 'ZoneType_Battlefield', visibility: 'Visibility_Public' }],
            gameObjects: [treasure(232), treasure(233, { isTapped: true })],
          },
        },
      ],
    });

    // Token grpIds never resolve through the Scryfall map — empty map here.
    const composite = (grpId: number) => {
      const subtypes = tracker.lookupSubtypes(grpId);
      if (subtypes === undefined) return undefined;
      const colors = subtypesToProducedMana(subtypes);
      return colors.length > 0 ? colors : undefined;
    };

    const mana = deriveOpenMana(tracker.getState(), composite, 'opponent');
    expect(mana).toEqual({ sources: [{ produces: ['W', 'U', 'B', 'R', 'G'] }] });
  });
});

describe('subtype fallback against the real fixture', () => {
  // Regression for the real-world gap this fallback exists for: the fixture's
  // final board has the opponent's Mountain at grpId 81182, which Scryfall's
  // arena-id data does not know (404 as of 2026-08-19). With an EMPTY map,
  // land subtypes from the log alone must still produce the red source.
  it('derives opponent mana with an empty Scryfall map', async () => {
    const tracker = new GameStateTracker();
    const assembler = new LineAssembler();
    const text = await readFile(FIXTURE, 'utf8');
    for (const line of assembler.feed(text)) {
      const event = extractGreEvent(line);
      if (event !== null) tracker.applyEvent(event);
    }

    expect(tracker.lookupSubtypes(81182)).toContain('SubType_Mountain');

    const emptyMap = () => undefined;
    const composite = (grpId: number) => {
      const subtypes = tracker.lookupSubtypes(grpId);
      if (subtypes === undefined) return emptyMap();
      const colors = subtypesToProducedMana(subtypes);
      return colors.length > 0 ? colors : emptyMap();
    };

    const mana = deriveOpenMana(tracker.getState(), composite, 'opponent');
    expect(mana).toEqual({ sources: [{ produces: ['R'] }] });

    // Local player's five basics resolve through subtypes too.
    const local = deriveOpenMana(tracker.getState(), composite, 'local');
    expect(local?.sources.map((s) => s.produces).sort()).toEqual([['B'], ['G'], ['G'], ['G'], ['R']]);
  });
});
