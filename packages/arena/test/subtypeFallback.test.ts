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
