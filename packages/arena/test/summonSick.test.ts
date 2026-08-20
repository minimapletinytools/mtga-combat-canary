import { describe, expect, it } from 'vitest';
import { GameStateTracker } from '../src/tracker';
import { deriveOpenMana } from '../src/derive';
import type { GreEvent } from '../src/types';

const BATTLEFIELD_ZONE = 28;

function event(gameStateMessage: Record<string, unknown>): GreEvent {
  return {
    greToClientMessages: [
      { type: 'GREMessageType_GameStateMessage', systemSeatIds: [1], gameStateMessage },
    ],
  };
}

const ZONES = [
  { zoneId: BATTLEFIELD_ZONE, type: 'ZoneType_Battlefield', visibility: 'Visibility_Public' },
];

function setupBoard(): GameStateTracker {
  const tracker = new GameStateTracker();
  tracker.applyEvent(
    event({
      type: 'GameStateType_Full',
      zones: ZONES,
      gameObjects: [
        // Opponent's untapped Forest.
        {
          instanceId: 10,
          grpId: 100,
          zoneId: BATTLEFIELD_ZONE,
          controllerSeatId: 2,
          cardTypes: ['CardType_Land'],
          subtypes: ['SubType_Forest'],
        },
        // Opponent's summoning-sick mana dork.
        {
          instanceId: 11,
          grpId: 200,
          zoneId: BATTLEFIELD_ZONE,
          controllerSeatId: 2,
          cardTypes: ['CardType_Creature'],
          hasSummoningSickness: true,
        },
      ],
    }),
  );
  return tracker;
}

/** Same filtering ArenaTracker applies before derivation. */
function deriveFiltered(tracker: GameStateTracker) {
  const lookup = (grpId: number) => (grpId === 100 ? (['G'] as const) : grpId === 200 ? (['G'] as const) : undefined);
  const state = tracker.getState();
  const battlefield = state.battlefield.filter((p) => !tracker.isSummonSickCreature(p.instanceId));
  return deriveOpenMana({ ...state, battlefield }, lookup, 'opponent');
}

describe('summoning-sick mana creatures', () => {
  it('tracks hasSummoningSickness on creatures only', () => {
    const tracker = setupBoard();
    expect(tracker.isSummonSickCreature(11)).toBe(true);
    expect(tracker.isSummonSickCreature(10)).toBe(false); // land, never sick
    expect(tracker.isSummonSickCreature(999)).toBe(false); // unknown instance
  });

  it('does not treat a flagged non-creature as sick', () => {
    const tracker = new GameStateTracker();
    tracker.applyEvent(
      event({
        type: 'GameStateType_Full',
        zones: ZONES,
        gameObjects: [
          {
            instanceId: 20,
            grpId: 300,
            zoneId: BATTLEFIELD_ZONE,
            controllerSeatId: 2,
            cardTypes: ['CardType_Land'],
            hasSummoningSickness: true, // defensive: engine shouldn't do this
          },
        ],
      }),
    );
    expect(tracker.isSummonSickCreature(20)).toBe(false);
  });

  it('excludes a sick dork from open mana, then counts it once the flag clears', () => {
    const tracker = setupBoard();

    // Sick dork excluded: only the Forest counts.
    expect(deriveFiltered(tracker)).toEqual({ sources: [{ produces: ['G'] }] });

    // Next turn: Arena restates the object WITHOUT the flag (whole-record
    // replacement semantics) — the dork wakes up.
    const changed = tracker.applyEvent(
      event({
        gameObjects: [
          {
            instanceId: 11,
            grpId: 200,
            zoneId: BATTLEFIELD_ZONE,
            controllerSeatId: 2,
            cardTypes: ['CardType_Creature'],
          },
        ],
      }),
    );
    // The wake-up must register as a state change so ArenaTracker re-emits.
    expect(changed).toBe(true);
    expect(tracker.isSummonSickCreature(11)).toBe(false);
    expect(deriveFiltered(tracker)).toEqual({
      sources: [{ produces: ['G'] }, { produces: ['G'] }],
    });
  });

  it('keeps the flag across an ObjectIdChanged rename', () => {
    const tracker = setupBoard();
    tracker.applyEvent(
      event({
        annotations: [
          {
            id: 1,
            affectorId: 0,
            affectedIds: [11],
            type: ['AnnotationType_ObjectIdChanged'],
            details: [
              { key: 'orig_id', valueInt32: [11] },
              { key: 'new_id', valueInt32: [50] },
            ],
          },
        ],
      }),
    );
    expect(tracker.isSummonSickCreature(50)).toBe(true);
    expect(tracker.isSummonSickCreature(11)).toBe(false);
  });
});
