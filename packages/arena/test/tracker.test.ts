import { describe, expect, it } from 'vitest';
import { LineAssembler, extractGreEvent } from '../src/chunker.js';
import { GameStateTracker } from '../src/tracker.js';
import type { BattlefieldPermanent, GreEvent, TrackerState } from '../src/types.js';
import { FIXTURE_LANDS, chunkText, fixtureLines } from './helpers.js';

/**
 * Replays the fixture through the real pipeline (chunker → extract → tracker).
 * `stopAfterLine` replays only the first N source lines of the fixture.
 */
function replay(stopAfterLine = Number.MAX_SAFE_INTEGER, chunkSize = 8192): TrackerState {
  const lines = fixtureLines().slice(0, stopAfterLine);
  const assembler = new LineAssembler();
  const tracker = new GameStateTracker();
  for (const chunk of chunkText(`${lines.join('\n')}\n`, chunkSize)) {
    for (const line of assembler.feed(chunk)) {
      const event = extractGreEvent(line);
      if (event !== null) tracker.applyEvent(event);
    }
  }
  return tracker.getState();
}

const p = (
  instanceId: number,
  grpId: number,
  controllerSeatId: number,
  tapped: boolean,
  isLand: boolean,
): BattlefieldPermanent => ({ instanceId, grpId, controllerSeatId, tapped, isLand });

describe('GameStateTracker — full fixture replay', () => {
  it('learns the local seat from systemSeatIds', () => {
    // Every single-recipient message in this log is addressed to seat 2.
    expect(replay().localSeatId).toBe(2);
  });

  it('ends the match with the hand-verified battlefield', () => {
    // Verified against the fixture with an independent script: the last record
    // written for each instanceId, minus everything in diffDeletedInstanceIds.
    expect(replay().battlefield).toEqual([
      p(208, 81182, 1, true, true), //   Mountain (opponent), tapped
      p(210, 105182, 2, false, true), // Forest (local)
      p(211, 103510, 2, false, false), // Rabbit creature (local)
      p(214, 105174, 1, true, true), //   Plains (opponent), tapped
      p(219, 105180, 2, false, true), // Mountain (local)
      p(224, 103537, 1, false, false), // Equipment (opponent)
      p(228, 103585, 1, true, false), //  Goblin Army token (opponent), tapped
      p(231, 105182, 2, false, true), // Forest (local)
      p(233, 81182, 1, true, true), //   Mountain (opponent), tapped
      p(241, 103584, 1, false, false), // Soldier token (opponent)
      p(249, 105182, 2, false, true), // Forest (local)
      p(252, 103541, 1, true, false), //  Dwarf Bard (opponent), tapped
      p(253, 105174, 1, true, true), //   Plains (opponent), tapped
      p(254, 103467, 1, true, false), //  Dwarf Warrior (opponent), tapped
      p(259, 103592, 1, false, false), // Equipment token (opponent)
      p(263, 105178, 2, false, true), // Swamp (local)
      p(270, 81182, 1, false, true), //   Mountain (opponent), UNTAPPED
    ]);
  });

  it('tracks five lands per seat, with only one opponent land untapped', () => {
    // isLand here is the tracker's own derived field (from gameObject.cardTypes)
    // — cross-checked against the exact-equality assertion above, which was
    // hand-verified against FIXTURE_LANDS's independent grpId ground truth.
    const battlefield = replay().battlefield;
    const seat1 = battlefield.filter((x) => x.controllerSeatId === 1);
    const seat2 = battlefield.filter((x) => x.controllerSeatId === 2);
    expect(seat1.filter((x) => x.isLand)).toHaveLength(5);
    expect(seat2.filter((x) => x.isLand)).toHaveLength(5);
    expect(seat1.filter((x) => x.isLand && !x.tapped).map((x) => x.instanceId)).toEqual([270]);
    expect(seat2.filter((x) => x.isLand && x.tapped)).toHaveLength(0);
    expect(battlefield.filter((x) => x.tapped).map((x) => x.instanceId)).toEqual([
      208, 214, 228, 233, 252, 253, 254,
    ]);
  });

  it('battlefield isLand agrees with the independent FIXTURE_LANDS grpId ground truth', () => {
    for (const permanent of replay().battlefield) {
      const expected = Object.prototype.hasOwnProperty.call(FIXTURE_LANDS, permanent.grpId);
      expect(permanent.isLand, `instance ${permanent.instanceId} (grpId ${permanent.grpId})`).toBe(expected);
    }
  });

  it('purges destroyed permanents instead of keeping phantoms', () => {
    const ids = replay().battlefield.map((x) => x.instanceId);
    // 215 (Dwarf Bard) was on the battlefield mid-game and is deleted at line 136.
    expect(ids).not.toContain(215);
    // 234 (Saga enchantment) was present at line 100 and is gone by the end.
    expect(ids).not.toContain(234);
    // Pre-rename ids from AnnotationType_ObjectIdChanged must never linger.
    expect(ids).not.toContain(128);
    expect(ids).not.toContain(172);
  });

  it('never leaks non-battlefield objects onto the battlefield', () => {
    // Hand/library/stack objects (incl. ability objects in zones 25 and 27)
    // are the bulk of the log; only 17 objects end in the battlefield zone.
    expect(replay().battlefield).toHaveLength(17);
  });

  it('produces the same state whatever the read chunking is', () => {
    const reference = replay(Number.MAX_SAFE_INTEGER, 8192);
    for (const size of [1, 97, 4096, 1_000_000]) {
      expect(replay(Number.MAX_SAFE_INTEGER, size)).toEqual(reference);
    }
  });
});

describe('GameStateTracker — mid-match snapshots', () => {
  it('has only the opponent first land after line 10', () => {
    const state = replay(10);
    expect(state.localSeatId).toBe(2);
    expect(state.battlefield).toEqual([p(208, 81182, 1, false, true)]);
  });

  it('matches the hand-verified board after line 100', () => {
    const state = replay(100);
    expect(state.battlefield).toEqual([
      p(208, 81182, 1, true, true),
      p(210, 105182, 2, false, true),
      p(211, 103510, 2, false, false),
      p(214, 105174, 1, true, true),
      p(219, 105180, 2, false, true),
      p(220, 103520, 2, false, false),
      p(224, 103537, 1, false, false),
      p(228, 103585, 1, true, false),
      p(231, 105182, 2, false, true),
      p(233, 81182, 1, true, true),
      p(234, 103390, 1, false, false),
      p(241, 103584, 1, false, false),
    ]);
  });

  it('starts from an empty battlefield at the GameStateType_Full message', () => {
    // Lines 1–3 are ConnectResp, the room state change, and the full state.
    expect(replay(3).battlefield).toEqual([]);
  });
});

describe('GameStateTracker — unit behaviour', () => {
  const gameState = (gsm: Record<string, unknown>, systemSeatIds = [1]): GreEvent => ({
    greToClientMessages: [
      { type: 'GREMessageType_GameStateMessage', systemSeatIds, gameStateMessage: gsm },
    ],
  });

  const battlefieldZone = { zoneId: 28, type: 'ZoneType_Battlefield' };

  it('reports whether the tracked state actually changed', () => {
    const tracker = new GameStateTracker();
    expect(
      tracker.applyEvent(
        gameState({
          type: 'GameStateType_Full',
          zones: [battlefieldZone],
          gameObjects: [{ instanceId: 1, grpId: 99, zoneId: 28, controllerSeatId: 1 }],
        }),
      ),
    ).toBe(true);
    // Same content again: no change.
    expect(
      tracker.applyEvent(
        gameState({
          type: 'GameStateType_Diff',
          gameObjects: [{ instanceId: 1, grpId: 99, zoneId: 28, controllerSeatId: 1 }],
        }),
      ),
    ).toBe(false);
    // Tapping it is a change.
    expect(
      tracker.applyEvent(
        gameState({
          type: 'GameStateType_Diff',
          gameObjects: [
            { instanceId: 1, grpId: 99, zoneId: 28, controllerSeatId: 1, isTapped: true },
          ],
        }),
      ),
    ).toBe(true);
    expect(tracker.getState().battlefield).toEqual([p(1, 99, 1, true, false)]);
    // A message with no game state at all changes nothing.
    expect(
      tracker.applyEvent({
        greToClientMessages: [{ type: 'GREMessageType_TimerStateMessage', systemSeatIds: [1] }],
      }),
    ).toBe(false);
  });

  it('treats a missing isTapped field as untapped (Arena omits it)', () => {
    const tracker = new GameStateTracker();
    tracker.applyEvent(
      gameState({
        type: 'GameStateType_Full',
        zones: [battlefieldZone],
        gameObjects: [
          { instanceId: 1, grpId: 99, zoneId: 28, controllerSeatId: 1, isTapped: true },
        ],
      }),
    );
    expect(tracker.getState().battlefield[0]?.tapped).toBe(true);
    tracker.applyEvent(
      gameState({
        type: 'GameStateType_Diff',
        gameObjects: [{ instanceId: 1, grpId: 99, zoneId: 28, controllerSeatId: 1 }],
      }),
    );
    expect(tracker.getState().battlefield[0]?.tapped).toBe(false);
  });

  it('follows AnnotationType_ObjectIdChanged when no new object record arrives', () => {
    const tracker = new GameStateTracker();
    tracker.applyEvent(
      gameState({
        type: 'GameStateType_Full',
        zones: [battlefieldZone],
        gameObjects: [{ instanceId: 5, grpId: 99, zoneId: 28, controllerSeatId: 1 }],
      }),
    );
    tracker.applyEvent(
      gameState({
        type: 'GameStateType_Diff',
        annotations: [
          {
            type: ['AnnotationType_ObjectIdChanged'],
            details: [
              { key: 'orig_id', valueInt32: [5] },
              { key: 'new_id', valueInt32: [77] },
            ],
          },
        ],
      }),
    );
    expect(tracker.getState().battlefield).toEqual([p(77, 99, 1, false, false)]);
  });

  it('drops objects listed in diffDeletedInstanceIds', () => {
    const tracker = new GameStateTracker();
    tracker.applyEvent(
      gameState({
        type: 'GameStateType_Full',
        zones: [battlefieldZone],
        gameObjects: [
          { instanceId: 1, grpId: 99, zoneId: 28, controllerSeatId: 1 },
          { instanceId: 2, grpId: 98, zoneId: 28, controllerSeatId: 2 },
        ],
      }),
    );
    tracker.applyEvent(gameState({ type: 'GameStateType_Diff', diffDeletedInstanceIds: [1] }));
    expect(tracker.getState().battlefield).toEqual([p(2, 98, 2, false, false)]);
  });

  it('replaces state on GameStateType_Full and resets on a new game', () => {
    const tracker = new GameStateTracker();
    tracker.applyEvent(
      gameState({
        type: 'GameStateType_Full',
        gameInfo: { matchID: 'm1', gameNumber: 1 },
        zones: [battlefieldZone],
        gameObjects: [{ instanceId: 1, grpId: 99, zoneId: 28, controllerSeatId: 1 }],
      }),
    );
    expect(tracker.getState().battlefield).toHaveLength(1);
    // Game 2 of the same match: the old board must not carry over.
    tracker.applyEvent(
      gameState({ type: 'GameStateType_Diff', gameInfo: { matchID: 'm1', gameNumber: 2 } }),
    );
    expect(tracker.getState().battlefield).toEqual([]);
    expect(tracker.getState().localSeatId).toBe(1);
  });

  it('resets the board on a fresh ConnectResp but keeps learning the seat', () => {
    const tracker = new GameStateTracker();
    tracker.applyEvent(
      gameState({
        type: 'GameStateType_Full',
        zones: [battlefieldZone],
        gameObjects: [{ instanceId: 1, grpId: 99, zoneId: 28, controllerSeatId: 1 }],
      }),
    );
    tracker.applyEvent({
      greToClientMessages: [{ type: 'GREMessageType_ConnectResp', systemSeatIds: [2] }],
    });
    expect(tracker.getState()).toEqual({ localSeatId: 2, battlefield: [] });
  });

  it('ignores broadcast systemSeatIds when learning the local seat', () => {
    const tracker = new GameStateTracker();
    tracker.applyEvent(gameState({ type: 'GameStateType_Diff' }, [1, 2]));
    expect(tracker.getState().localSeatId).toBeNull();
    tracker.applyEvent(gameState({ type: 'GameStateType_Diff' }, [1]));
    expect(tracker.getState().localSeatId).toBe(1);
  });

  it('reset() clears the board and the local seat', () => {
    const tracker = new GameStateTracker();
    tracker.applyEvent(
      gameState({
        type: 'GameStateType_Full',
        zones: [battlefieldZone],
        gameObjects: [{ instanceId: 1, grpId: 99, zoneId: 28, controllerSeatId: 1 }],
      }),
    );
    tracker.reset();
    expect(tracker.getState()).toEqual({ localSeatId: null, battlefield: [] });
  });

  it('survives structurally broken events without throwing', () => {
    const tracker = new GameStateTracker();
    expect(() =>
      tracker.applyEvent({ greToClientMessages: null as unknown as [] }),
    ).not.toThrow();
    expect(() =>
      tracker.applyEvent(
        gameState({
          type: 'GameStateType_Diff',
          zones: 'nope',
          gameObjects: [null, { instanceId: 'x' }, { grpId: 1 }],
          annotations: [{ type: ['AnnotationType_ObjectIdChanged'] }],
          diffDeletedInstanceIds: ['x', null],
        }),
      ),
    ).not.toThrow();
    expect(tracker.getState().battlefield).toEqual([]);
  });

  it('returns an independent snapshot each call', () => {
    const tracker = new GameStateTracker();
    tracker.applyEvent(
      gameState({
        type: 'GameStateType_Full',
        zones: [battlefieldZone],
        gameObjects: [{ instanceId: 1, grpId: 99, zoneId: 28, controllerSeatId: 1 }],
      }),
    );
    const first = tracker.getState();
    first.battlefield.push(p(999, 1, 1, false, false));
    expect(tracker.getState().battlefield).toHaveLength(1);
  });
});
