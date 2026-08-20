import type { Color } from '@mtgatricks/core';
import { describe, expect, it } from 'vitest';
import { LineAssembler, extractGreEvent } from '../src/chunker.js';
import { deriveOpenMana } from '../src/derive.js';
import { GameStateTracker } from '../src/tracker.js';
import type { BattlefieldPermanent, TrackerState } from '../src/types.js';
import { fixtureLines, fixtureLookup } from './helpers.js';

const FOREST = 1;
const MOUNTAIN = 2;
const BEAR = 3;
const TAPLAND = 4;

const lookup = (grpId: number): ReadonlyArray<Color | 'C'> | undefined => {
  if (grpId === FOREST) return ['G'];
  if (grpId === MOUNTAIN) return ['R'];
  if (grpId === TAPLAND) return []; // known, but produces nothing
  return undefined; // BEAR and anything else: unknown grpId
};

const state = (battlefield: BattlefieldPermanent[], localSeatId: number | null): TrackerState => ({
  localSeatId,
  battlefield,
});

const permanent = (
  instanceId: number,
  grpId: number,
  controllerSeatId: number,
  tapped = false,
): BattlefieldPermanent => ({ instanceId, grpId, controllerSeatId, tapped });

describe('deriveOpenMana', () => {
  it('returns null while the local seat is unknown', () => {
    expect(deriveOpenMana(state([permanent(1, FOREST, 1)], null), lookup, 'opponent')).toBeNull();
    expect(deriveOpenMana(state([permanent(1, FOREST, 1)], null), lookup, 'local')).toBeNull();
  });

  it('derives the opponent as every seat that is not the local one', () => {
    const board = state(
      [permanent(1, FOREST, 1), permanent(2, MOUNTAIN, 2), permanent(3, FOREST, 3)],
      2,
    );
    expect(deriveOpenMana(board, lookup, 'opponent')).toEqual({
      sources: [{ produces: ['G'] }, { produces: ['G'] }],
    });
  });

  it('derives the local player when asked', () => {
    const board = state([permanent(1, FOREST, 1), permanent(2, MOUNTAIN, 2)], 2);
    expect(deriveOpenMana(board, lookup, 'local')).toEqual({ sources: [{ produces: ['R'] }] });
  });

  it('skips tapped permanents', () => {
    const board = state([permanent(1, FOREST, 1, true), permanent(2, MOUNTAIN, 1)], 2);
    expect(deriveOpenMana(board, lookup, 'opponent')).toEqual({ sources: [{ produces: ['R'] }] });
  });

  it('skips unknown grpIds and permanents that make no mana', () => {
    const board = state([permanent(1, BEAR, 1), permanent(2, TAPLAND, 1)], 2);
    expect(deriveOpenMana(board, lookup, 'opponent')).toEqual({ sources: [] });
  });

  it('emits one source per permanent, duplicates included', () => {
    const board = state([permanent(1, FOREST, 1), permanent(2, FOREST, 1)], 2);
    expect(deriveOpenMana(board, lookup, 'opponent')?.sources).toHaveLength(2);
  });

  it('copies the lookup result instead of aliasing it', () => {
    const shared: Array<Color | 'C'> = ['G'];
    const board = state([permanent(1, FOREST, 1)], 2);
    const mana = deriveOpenMana(board, () => shared, 'opponent');
    shared.push('R');
    expect(mana?.sources[0]?.produces).toEqual(['G']);
  });

  it('returns an empty pool (not null) when the tracked player has nothing', () => {
    expect(deriveOpenMana(state([], 1), lookup, 'opponent')).toEqual({ sources: [] });
  });

  it('derives the fixture end state for both players', () => {
    const assembler = new LineAssembler();
    const tracker = new GameStateTracker();
    for (const line of assembler.feed(`${fixtureLines().join('\n')}\n`)) {
      const event = extractGreEvent(line);
      if (event !== null) tracker.applyEvent(event);
    }
    const finalState = tracker.getState();
    // Opponent (seat 1) ends with four tapped lands and one untapped Mountain.
    expect(deriveOpenMana(finalState, fixtureLookup, 'opponent')).toEqual({
      sources: [{ produces: ['R'] }],
    });
    // Local (seat 2) ends with Forest, Mountain, Forest, Forest, Swamp untapped.
    expect(deriveOpenMana(finalState, fixtureLookup, 'local')).toEqual({
      sources: [
        { produces: ['G'] },
        { produces: ['R'] },
        { produces: ['G'] },
        { produces: ['G'] },
        { produces: ['B'] },
      ],
    });
  });
});
