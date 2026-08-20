export type Color = 'W' | 'U' | 'B' | 'R' | 'G';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus';

/** One untapped mana source; `produces` is the set of mana types it can make. */
export interface ManaSource {
  produces: ReadonlyArray<Color | 'C'>; // 'C' = colorless
}

/** The player's open mana: a list of untapped sources. */
export interface OpenMana {
  sources: ManaSource[];
}

/** Parsed mana-cost pip. */
export type Pip =
  | { kind: 'generic'; amount: number }        // {3}
  | { kind: 'colored'; color: Color }          // {W}
  | { kind: 'colorless' }                      // {C}
  | { kind: 'hybrid'; colors: [Color, Color] } // {W/U}
  | { kind: 'monoHybrid'; color: Color }       // {2/W} — pay color OR 2 generic
  | { kind: 'phyrexian'; color: Color }        // {W/P} — pay color OR 2 life
  | { kind: 'snow' }                           // {S} — treat as payable by any source
  | { kind: 'x' };                             // {X} — treat as X=0

export interface ParsedCost {
  pips: Pip[];
}

export interface CastabilityResult {
  castable: boolean;
  usesXZero: boolean;        // cost had {X}, assumed X=0
  mayUseLife: boolean;       // castable only if phyrexian pips paid with life
}

/** Subset of the Scryfall card object we persist. Field names match Scryfall exactly. */
export interface CardFace {
  name: string;
  mana_cost: string;         // e.g. "{1}{U}" — may be "" on backs
  type_line: string;
  oracle_text: string;
  image_uris?: { normal: string; small: string };
}

export interface Card {
  id: string;                // scryfall id
  name: string;
  set: string;               // set code, lowercase
  collector_number: string;
  rarity: Rarity;
  mana_cost?: string;        // absent on multi-face layouts
  cmc: number;
  type_line: string;
  keywords: string[];        // Scryfall's computed keywords, e.g. ["Flash"]
  layout: string;            // 'normal' | 'adventure' | 'split' | 'modal_dfc' | ...
  card_faces?: CardFace[];
  image_uris?: { normal: string; small: string };
  games: string[];           // includes "arena" if on Arena
  scryfall_uri: string;
  arena_id?: number;         // Arena grpId for this printing, when known
  produced_mana?: string[];  // mana this card can produce (Scryfall field)
}

export interface SetInfo {
  code: string;
  name: string;
  released_at: string;       // ISO date
  set_type: string;          // 'expansion' | 'core' | 'draft_innovation' | ...
  card_count: number;
  icon_svg_uri: string;
}

/** A card matched by the trick filter, with which face is castable and why. */
export interface TrickResult {
  card: Card;
  faceName: string;               // which face/half is instant-speed castable
  reason: 'instant' | 'flash';
  castability: CastabilityResult;
}

/** Phase-2 seam. Manual provider on the web; Electron bridge provider on desktop. */
export interface OpenManaProvider {
  /** cb fires with new open mana, or null when the source is unavailable. */
  subscribe(cb: (mana: OpenMana | null) => void): () => void;
}

/** Arena log-tracking status (Phase 2). */
export type ArenaStatus = 'tracking' | 'no-log' | 'log-stale' | 'parse-error';

/** Bridge surface the Electron preload exposes as `window.mtgatricks` (Phase 2). */
export interface ArenaBridge {
  onOpenMana(cb: (mana: OpenMana) => void): () => void;
  onStatus(cb: (status: ArenaStatus) => void): () => void;
}
