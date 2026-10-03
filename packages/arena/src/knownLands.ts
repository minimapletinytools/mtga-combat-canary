import type { Color } from '@mtgatricks/core';

export type ManaLetter = Color | 'C';

/**
 * Fallback mapping of Arena grpIds to produced mana for cards not yet
 * indexed in Scryfall's bulk data (e.g. newly released sets like Reality Fracture).
 */
export const KNOWN_GRP_ID_MANA: Readonly<Record<number, ReadonlyArray<ManaLetter>>> = {
  // --- Reality Fracture (FRA) Dual Lands ---
  // Slow lands (allied/enemy cycles)
  106421: ['W', 'U'], // Deserted Beach
  107921: ['W', 'U'], // Deserted Beach (showcase/alt)
  106434: ['U', 'B'], // Shipwreck Marsh
  107925: ['U', 'B'], // Shipwreck Marsh (showcase/alt)
  106425: ['B', 'R'], // Haunted Ridge
  107922: ['B', 'R'], // Haunted Ridge (showcase/alt)
  106431: ['R', 'G'], // Rockfall Vale
  107924: ['R', 'G'], // Rockfall Vale (showcase/alt)
  106430: ['G', 'W'], // Overgrown Farmland
  107923: ['G', 'W'], // Overgrown Farmland (showcase/alt)

  // Annex cycle (friendly & enemy color pairs)
  106422: ['W', 'U'], // Fatehold Annex
  106437: ['U', 'B'], // Theorix Annex
  106435: ['B', 'R'], // Stingerquill Annex
  106428: ['R', 'G'], // Konstrari Annex
  106439: ['G', 'W'], // Vigorbloom Annex

  // Commons cycle (tap duals)
  106429: ['W', 'B'], // Meticulous Commons
  106427: ['U', 'R'], // Innovative Commons
  106423: ['B', 'G'], // Formidable Commons
  106420: ['R', 'W'], // Dedicated Commons
  106438: ['G', 'U'], // Transformative Commons

  // Any-color land
  106433: ['W', 'U', 'B', 'R', 'G'], // Room of Refuge

  // Utility & mono nonbasics
  106424: ['C'],      // Hall of Echoes
  107918: ['C'],      // Hall of Echoes (alt)
  106426: ['C'],      // Hexhaven Dueling Arena
  106432: ['G'],      // Roiling Canopy
  107919: ['G'],      // Roiling Canopy (alt)
  106436: ['U'],      // Theorist's Sanctum
  107920: ['U'],      // Theorist's Sanctum (alt)
  106559: ['G'],      // Forest Tentacle (token land)

  // Basics (backup in case log subtypes are missing)
  106526: ['W'], 106527: ['W'], 106536: ['W'], 106537: ['W'], 106538: ['W'], // Plains
  106528: ['U'], 106529: ['U'], 106539: ['U'], 106540: ['U'], 106541: ['U'], // Island
  106530: ['B'], 106531: ['B'], 106542: ['B'], 106543: ['B'], 106544: ['B'], // Swamp
  106532: ['R'], 106533: ['R'], 106545: ['R'], 106546: ['R'], 106547: ['R'], // Mountain
  106534: ['G'], 106535: ['G'], 106548: ['G'], 106549: ['G'], 106550: ['G'], // Forest

  // --- Reality Fracture (FRA) Mana Artifacts & Rocks ---
  106419: ['W', 'U', 'B', 'R', 'G'], // Murmuring Volume
  106443: ['W', 'U', 'B', 'R', 'G'], // Gideon's Memorial
  107831: ['W', 'U', 'B', 'R', 'G'], // Gideon's Memorial (alt)

  // --- Reality Fracture (FRA) Mana Creatures ---
  106338: ['G'],                      // Greenhouse Propagator
  106339: ['C'],                      // Heartwood Crafter
  106507: ['W', 'U', 'B', 'R', 'G'], // Loot, the Nexus

  // --- Reality Fracture (FRA) Mana Tokens ---
  106561: ['R', 'G'],                // Heartwood
  106562: ['W', 'U', 'B', 'R', 'G'], // Lotus
  106563: ['W', 'U', 'B', 'R', 'G'], // Sculpture Treasure
  106565: ['W', 'U', 'B', 'R', 'G'], // Treasure

  // --- Reality Fracture Commander (FRC) ---
  107953: ['W', 'U', 'B', 'R', 'G'], // Arcane Signet
  107955: ['W', 'U', 'B', 'R', 'G'], // Command Tower
  107956: ['W', 'U', 'B', 'R', 'G'], // Reflecting Pool

  // --- Special Guests (SPG) ---
  106566: ['C'], // Eye of Ugin
};

/**
 * Returns produced mana for known unindexed grpIds, or undefined if not known.
 */
export function getKnownProducedMana(grpId: number): ReadonlyArray<ManaLetter> | undefined {
  return KNOWN_GRP_ID_MANA[grpId];
}
