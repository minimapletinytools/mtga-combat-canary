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

  // --- Star Trek (TRK) Lands ---
  // Gain lands (enter tapped, gain 1 life)
  106852: ['U', 'R'], // Andoria
  106854: ['R', 'W'], // Bajor
  106857: ['W', 'B'], // Cardassia Prime
  106858: ['G', 'U'], // Earth, Sector 001
  106860: ['B', 'G'], // Ferenginar
  106865: ['R', 'G'], // Orion
  106868: ['B', 'R'], // Qo'noS
  106870: ['G', 'W'], // Risa
  106871: ['U', 'B'], // Romulus
  106882: ['W', 'U'], // Vulcan

  // Mono-color surveil lands (untapped with 2+ other lands)
  106859: ['W'], 107534: ['W'],               // Federation Outpost
  106864: ['U'], 107535: ['U'],               // Ni'Var Science Academy
  106881: ['B'], 107539: ['B'],               // The Unicomplex
  106869: ['R'], 107537: ['R'], 107552: ['R'], // Quark's Bar
  106867: ['G'], 107536: ['G'],               // Q Continuum

  // Colorless utility lands
  106853: ['C'], // Artificial Anomaly
  106861: ['C'], // Gaseous Anomaly
  106873: ['C'], // Spatial Anomaly
  106877: ['C'], // Subspace Anomaly
  106879: ['C'], // Temporal Anomaly
  106880: ['C'], // Unexplored Territory
  106874: ['C'], 107538: ['C'], // Starfleet Academy (Federation any-color ability ignored)

  // Shocklands (backup in case log subtypes are missing)
  106855: ['B', 'R'], 109431: ['B', 'R'], // Blood Crypt
  106856: ['U', 'G'], 109438: ['U', 'G'], // Breeding Pool
  106862: ['W', 'B'], 109434: ['W', 'B'], // Godless Shrine
  106863: ['W', 'U'], 109429: ['W', 'U'], // Hallowed Fountain
  106866: ['B', 'G'], 109436: ['B', 'G'], // Overgrown Tomb
  106872: ['R', 'W'], 109437: ['R', 'W'], // Sacred Foundry
  106875: ['U', 'R'], 109435: ['U', 'R'], // Steam Vents
  106876: ['R', 'G'], 109432: ['R', 'G'], // Stomping Ground
  106878: ['G', 'W'], 109433: ['G', 'W'], // Temple Garden
  106883: ['U', 'B'], 109430: ['U', 'B'], // Watery Grave

  // Basics (backup in case log subtypes are missing)
  106884: ['W'], 106889: ['W'], 106894: ['W'], 106895: ['W'], // Plains
  106885: ['U'], 106890: ['U'], 106896: ['U'], 106897: ['U'], // Island
  106886: ['B'], 106891: ['B'], 106898: ['B'], 106899: ['B'], // Swamp
  106887: ['R'], 106892: ['R'], 106900: ['R'], 106901: ['R'], // Mountain
  106888: ['G'], 106893: ['G'], 106902: ['G'], 106903: ['G'], // Forest

  // --- Star Trek (TRK) Mana Artifacts & Rocks ---
  106836: ['W', 'U', 'B', 'R', 'G'], // Class-F Shuttlecraft
  106843: ['C'],                      // Isolinear Processor (artifact-only mana; over-reports)

  // --- Star Trek (TRK) Mana Creatures ---
  106748: ['R'],                      // Savvy Profiteer
  106801: ['W', 'U', 'B', 'R', 'G'], // Xenobotanist

  // --- Star Trek (TRK) Mana Tokens ---
  106929: ['W', 'U', 'B', 'R', 'G'], // Treasure
  106930: ['W', 'U', 'B', 'R', 'G'], // New Planet (land token)

  // --- Star Trek Commander (TRC) Mana Creatures ---
  107707: ['U'], // La Forge, Perceptive Engineer (artifact-only mana; over-reports)
  107733: ['G'], // Gumato (taps for GGG; counted as one source)
};

/**
 * Returns produced mana for known unindexed grpIds, or undefined if not known.
 */
export function getKnownProducedMana(grpId: number): ReadonlyArray<ManaLetter> | undefined {
  return KNOWN_GRP_ID_MANA[grpId];
}
