import { describe, expect, it } from 'vitest';
import { GameStateTracker } from '../src/tracker.js';
import { countUnresolvedLandMana, deriveOpenMana } from '../src/derive.js';
import { KNOWN_GRP_ID_MANA, getKnownProducedMana } from '../src/knownLands.js';

describe('knownLands mapping', () => {
  it('maps all 5 FRA slow lands', () => {
    expect(getKnownProducedMana(106421)).toEqual(['W', 'U']); // Deserted Beach
    expect(getKnownProducedMana(107921)).toEqual(['W', 'U']); // Deserted Beach (alt)
    expect(getKnownProducedMana(106434)).toEqual(['U', 'B']); // Shipwreck Marsh
    expect(getKnownProducedMana(107925)).toEqual(['U', 'B']); // Shipwreck Marsh (alt)
    expect(getKnownProducedMana(106425)).toEqual(['B', 'R']); // Haunted Ridge
    expect(getKnownProducedMana(107922)).toEqual(['B', 'R']); // Haunted Ridge (alt)
    expect(getKnownProducedMana(106431)).toEqual(['R', 'G']); // Rockfall Vale
    expect(getKnownProducedMana(107924)).toEqual(['R', 'G']); // Rockfall Vale (alt)
    expect(getKnownProducedMana(106430)).toEqual(['G', 'W']); // Overgrown Farmland
    expect(getKnownProducedMana(107923)).toEqual(['G', 'W']); // Overgrown Farmland (alt)
  });

  it('maps all 5 FRA annexes', () => {
    expect(getKnownProducedMana(106422)).toEqual(['W', 'U']); // Fatehold Annex
    expect(getKnownProducedMana(106437)).toEqual(['U', 'B']); // Theorix Annex
    expect(getKnownProducedMana(106435)).toEqual(['B', 'R']); // Stingerquill Annex
    expect(getKnownProducedMana(106428)).toEqual(['R', 'G']); // Konstrari Annex
    expect(getKnownProducedMana(106439)).toEqual(['G', 'W']); // Vigorbloom Annex
  });

  it('maps all 5 FRA tap dual commons', () => {
    expect(getKnownProducedMana(106429)).toEqual(['W', 'B']); // Meticulous Commons
    expect(getKnownProducedMana(106427)).toEqual(['U', 'R']); // Innovative Commons
    expect(getKnownProducedMana(106423)).toEqual(['B', 'G']); // Formidable Commons
    expect(getKnownProducedMana(106420)).toEqual(['R', 'W']); // Dedicated Commons
    expect(getKnownProducedMana(106438)).toEqual(['G', 'U']); // Transformative Commons
  });

  it('maps Room of Refuge to all 5 colors', () => {
    expect(getKnownProducedMana(106433)).toEqual(['W', 'U', 'B', 'R', 'G']);
  });

  it('maps FRA colorless nonbasics and basics', () => {
    expect(getKnownProducedMana(106424)).toEqual(['C']); // Hall of Echoes
    expect(getKnownProducedMana(106426)).toEqual(['C']); // Hexhaven Dueling Arena
    expect(getKnownProducedMana(106526)).toEqual(['W']); // Plains
    expect(getKnownProducedMana(106528)).toEqual(['U']); // Island
    expect(getKnownProducedMana(106530)).toEqual(['B']); // Swamp
    expect(getKnownProducedMana(106532)).toEqual(['R']); // Mountain
    expect(getKnownProducedMana(106534)).toEqual(['G']); // Forest
  });

  it('maps FRA mana artifacts, creatures, and tokens', () => {
    expect(getKnownProducedMana(106419)).toEqual(['W', 'U', 'B', 'R', 'G']); // Murmuring Volume
    expect(getKnownProducedMana(106338)).toEqual(['G']); // Greenhouse Propagator
    expect(getKnownProducedMana(106339)).toEqual(['C']); // Heartwood Crafter
    expect(getKnownProducedMana(106507)).toEqual(['W', 'U', 'B', 'R', 'G']); // Loot, the Nexus
    expect(getKnownProducedMana(106561)).toEqual(['R', 'G']); // Heartwood
    expect(getKnownProducedMana(106562)).toEqual(['W', 'U', 'B', 'R', 'G']); // Lotus
    expect(getKnownProducedMana(106563)).toEqual(['W', 'U', 'B', 'R', 'G']); // Sculpture Treasure
    expect(getKnownProducedMana(106565)).toEqual(['W', 'U', 'B', 'R', 'G']); // Treasure
  });

  it('maps FRC and SPG cards', () => {
    expect(getKnownProducedMana(107953)).toEqual(['W', 'U', 'B', 'R', 'G']); // Arcane Signet
    expect(getKnownProducedMana(107955)).toEqual(['W', 'U', 'B', 'R', 'G']); // Command Tower
    expect(getKnownProducedMana(107956)).toEqual(['W', 'U', 'B', 'R', 'G']); // Reflecting Pool
    expect(getKnownProducedMana(106566)).toEqual(['C']); // Eye of Ugin
  });
});

describe('Reality Fracture permanents in game state derivation', () => {
  const land = (instanceId: number, grpId: number, controllerSeatId = 2, tapped = false) => ({
    instanceId,
    grpId,
    type: 'GameObjectType_Card',
    zoneId: 28,
    visibility: 'Visibility_Public',
    ownerSeatId: controllerSeatId,
    controllerSeatId,
    cardTypes: ['CardType_Land'],
    subtypes: [], // FRA dual lands do not have basic land subtypes
    isTapped: tapped,
  });

  const artifact = (instanceId: number, grpId: number, controllerSeatId = 2, tapped = false) => ({
    instanceId,
    grpId,
    type: 'GameObjectType_Card',
    zoneId: 28,
    visibility: 'Visibility_Public',
    ownerSeatId: controllerSeatId,
    controllerSeatId,
    cardTypes: ['CardType_Artifact'],
    subtypes: ['SubType_Book'],
    isTapped: tapped,
  });

  it('derives dual open mana for opponent FRA dual lands without Scryfall bulk data', () => {
    const tracker = new GameStateTracker();
    tracker.applyEvent({
      greToClientMessages: [
        {
          type: 'GREMessageType_GameStateMessage',
          systemSeatIds: [1],
          gameStateMessage: {
            type: 'GameStateType_Full',
            zones: [{ zoneId: 28, type: 'ZoneType_Battlefield', visibility: 'Visibility_Public' }],
            gameObjects: [
              land(101, 106421), // Deserted Beach (W/U)
              land(102, 106425), // Haunted Ridge (B/R)
              land(103, 106430, 2, true), // Overgrown Farmland (tapped)
            ],
          },
        },
      ],
    });

    // Lookup with an empty external map falls back to KNOWN_GRP_ID_MANA
    const compositeLookup = (grpId: number) => KNOWN_GRP_ID_MANA[grpId];

    const mana = deriveOpenMana(tracker.getState(), compositeLookup, 'opponent');
    expect(mana).toEqual({
      sources: [
        { produces: ['W', 'U'] },
        { produces: ['B', 'R'] },
      ],
    });

    // None of the untapped lands should be marked unresolved
    const unresolved = countUnresolvedLandMana(tracker.getState(), compositeLookup, 'opponent');
    expect(unresolved).toBe(0);
  });

  it('derives open mana for opponent Murmuring Volume and mana rocks', () => {
    const tracker = new GameStateTracker();
    tracker.applyEvent({
      greToClientMessages: [
        {
          type: 'GREMessageType_GameStateMessage',
          systemSeatIds: [1],
          gameStateMessage: {
            type: 'GameStateType_Full',
            zones: [{ zoneId: 28, type: 'ZoneType_Battlefield', visibility: 'Visibility_Public' }],
            gameObjects: [
              artifact(201, 106419), // Murmuring Volume (untapped)
              artifact(202, 106419, 2, true), // Murmuring Volume (tapped)
            ],
          },
        },
      ],
    });

    const compositeLookup = (grpId: number) => KNOWN_GRP_ID_MANA[grpId];
    const mana = deriveOpenMana(tracker.getState(), compositeLookup, 'opponent');
    expect(mana).toEqual({
      sources: [
        { produces: ['W', 'U', 'B', 'R', 'G'] },
      ],
    });
  });
});
