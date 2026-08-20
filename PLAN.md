# mtgatricks — Phase 1 Plan

A companion app for MTG / MTG Arena: pick a set, enter open mana, and see every card
that could be cast at instant speed (instants + flash) with that mana, sorted by rarity.
Primary use case: "my opponent has N untapped lands in colors X/Y — what tricks could
they have?"

## Architecture decision: web-first, desktop = same app + local companion process

The UI is **always a plain web app** (static build, no backend — Scryfall's API is
CORS-enabled). "Desktop deployment" for Phase 2 is NOT Electron/Tauri; it is the same
static build served by a small local Node process that also tails the MTGA `Player.log`
and pushes open-mana updates over a WebSocket on localhost. The web app connects to that
socket when available and falls back to manual entry otherwise.

This means zero platform forks in the UI code. The only seam is the `OpenManaProvider`
interface (defined below): Phase 1 ships `ManualManaProvider`; Phase 2 adds
`WebSocketManaProvider` + the Node tailer app.

## Stack

- pnpm workspaces monorepo, TypeScript everywhere, ES modules
- `packages/core` — pure logic, **no DOM, no Node APIs, no dependencies**
- `packages/data` — Scryfall client + caching (platform-abstracted storage)
- `apps/web` — React + Vite + vanilla CSS (no UI framework needed at this size)
- Vitest for all tests (core logic must be heavily tested)
- Phase 2 (not now): `apps/companion` — Node log tailer + static server + WS

```
mtgatricks/
  pnpm-workspace.yaml
  package.json
  tsconfig.base.json
  packages/
    core/
      src/types.ts        # pinned types below — do not deviate
      src/mana.ts         # cost parser + castability solver
      src/filter.ts       # instant-speed detection + pipeline
      test/
    data/
      src/scryfall.ts     # API client
      src/repository.ts   # CardRepository with cache
      src/storage.ts      # KVStore interface + IndexedDB impl + in-memory impl
      test/
  apps/
    web/                  # React + Vite
```

## Pinned types (`packages/core/src/types.ts`)

These are the contract between all work packages. Implementers: do not rename or
restructure; add fields only if a work package explicitly requires it.

```ts
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

export interface ParsedCost { pips: Pip[] }

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

/** Phase-2 seam. Manual provider now; WebSocket provider later. */
export interface OpenManaProvider {
  /** cb fires with new open mana, or null when the source is unavailable. */
  subscribe(cb: (mana: OpenMana | null) => void): () => void;
}
```

## WP1 — core mana logic (`packages/core/src/mana.ts`)

Depends on: types only. Fully parallel with WP2–WP4.

1. `parseManaCost(cost: string): ParsedCost` — parse Scryfall mana-cost strings.
   Symbols appear as `{...}` groups: `{3}`, `{W}`, `{C}`, `{W/U}`, `{2/W}`, `{W/P}`,
   `{G/U/P}` (hybrid phyrexian — treat as phyrexian on either color; model as
   two-option phyrexian by picking `{ kind: 'phyrexian' }` with either color being
   acceptable — simplest correct handling: treat it as always payable-with-life like
   other phyrexian), `{S}`, `{X}`. Empty string ⇒ zero pips (castable for free).
   Unknown symbols: throw — tests must cover the full symbol set above.

2. `canCast(cost: ParsedCost, mana: OpenMana): CastabilityResult` — satisfiability
   check, NOT a cmc comparison. Algorithm:
   - Phyrexian pips: for this app assume life payment is always available ⇒ pip is
     satisfiable for free, set `mayUseLife: true` if any phyrexian pip exists and the
     cost is not payable with mana alone (compute both ways: try paying with mana
     first; fall back to life). Keep it simple: first attempt treats phyrexian pips as
     colored pips; if that fails, retry treating them as free and set `mayUseLife`.
   - `{X}`: drop the pip, set `usesXZero: true`.
   - Mono-hybrid `{2/W}`: branch — there are at most a few such pips; brute-force all
     pay-color vs pay-2-generic combinations.
   - Remaining problem: colored/colorless/hybrid/snow pips + a generic amount vs a
     list of sources. Solve with bipartite maximum matching (pips × sources; an edge
     when the source can produce an acceptable mana type; snow accepts any source).
     Pool sizes are tiny (≤ ~15) — simple augmenting-path matching, no libraries.
     Castable iff all non-generic pips matched AND (unmatched sources ≥ generic amount).
   - Note: any source can pay generic; `{C}` requires a source producing 'C'.

Tests (synthetic Card fixtures are fine; also these real costs):
- `{R}` castable with 1 red source; not with 1 green source
- `{U}{U}` needs two U sources
- `{1}{U}` castable with [U, G]; not with [G, G]
- hybrid: `{W/U}` castable with either; matching case: pips `{U}{W/U}` with sources
  [U, {W|U}-dual] castable; with [U-only, U-only] castable; pips `{W}{U}` with sources
  [{W|U}-dual, U-only] castable (requires real matching, greedy on pip order can fail)
- `{2/W}` castable with [W] and with [G, G], not with [G]
- `{X}{R}` castable with [R], flag usesXZero
- `{U/P}` castable with [] via life, flag mayUseLife; with [U] castable without flag
- `{C}` not castable with [W]; castable with [C]
- `` (empty, e.g. Ancestral Vision has no cost — it can't be cast, but that's a card
  design edge; treat empty cost as castable and don't special-case)

## WP2 — instant-speed filter (`packages/core/src/filter.ts`)

Depends on: types + WP1's exported functions (develop against the signatures; fine in
parallel).

1. `instantSpeedFaces(card: Card): { faceName: string; reason: 'instant'|'flash'; manaCost: string }[]`
   - Single-face: type_line includes 'Instant' ⇒ instant; else keywords includes
     'Flash' ⇒ flash. (Scryfall `keywords` covers flash on the card.)
   - Multi-face (`card_faces` present): evaluate each face — a face whose type_line
     includes 'Instant' counts (adventure halves like Petty Theft, split halves);
     for flash on multi-face cards, keywords is card-level: attribute it to faces whose
     oracle_text or type context supports casting (simplification: if keywords has
     Flash, include the front face with reason 'flash'). Skip faces with empty
     mana_cost (back faces of transform cards can't be cast).
   - Exclude type_line 'Land' faces.
2. `findTricks(cards: Card[], mana: OpenMana): TrickResult[]`
   - For each card, for each instant-speed face, parse its mana_cost and run canCast;
     emit at most one TrickResult per card (prefer the castable face).
3. `sortTricks(results: TrickResult[], direction: 'common-first' | 'mythic-first')`
   — stable sort by rarity rank then by card name. Default UI direction:
   common-first (commons are the most probable tricks in limited).

Tests: fixture cards — an instant, a flash creature, a sorcery (excluded), an
adventure card with instant half (layout 'adventure', face 2 type 'Instant —
Adventure'), a split card, a transform card with castable front only, a land (excluded).

## WP3 — data layer (`packages/data`)

Depends on: types only. Parallel-safe.

1. `storage.ts`: `interface KVStore { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; }`
   + `IndexedDbStore` (use the `idb` package, single object store) + `MemoryStore` for
   tests/SSR.
2. `scryfall.ts`: minimal client, `fetch`-based, base `https://api.scryfall.com`.
   - `fetchSets(): Promise<SetInfo[]>` — GET `/sets`, keep only
     `set_type in ('expansion','core','draft_innovation')` and `card_count > 0`,
     sorted newest first.
   - `fetchSetCards(code: string): Promise<Card[]>` — GET
     `/cards/search?q=set:{code}&unique=cards`, follow `next_page` pagination
     (~75/page), map each raw object to the pinned `Card` type (pick only the pinned
     fields, including nested `card_faces` mapping).
   - Etiquette: ≥75ms delay between paginated requests; on 429 back off and retry once.
     Do not set a User-Agent header (browsers forbid it; browser UA is acceptable per
     Scryfall docs).
3. `repository.ts`: `class CachedCardRepository { constructor(store: KVStore); listSets(): Promise<SetInfo[]>; getSetCards(code: string): Promise<Card[]>; }`
   - Cache key `cards:{code}` (cards change rarely; cache forever, expose
     `refresh(code)` to force refetch). Sets list cached 24h with timestamp key.

Tests: mapping from a captured raw Scryfall payload fixture (save one real page of a
recent set as a JSON fixture in `test/fixtures/`), pagination handling with a mocked
fetch, cache hit/miss with MemoryStore.

## WP4 — web UI (`apps/web`)

Depends on: types; develop against WP1–WP3 signatures using a small hardcoded fixture
repository, then swap in the real one at integration.

React + Vite. Views/components:
- **SetPicker**: dropdown of sets from repository (name + release date, newest default).
  Show fetch/caching state ("downloading set…").
- **ManaInput**: steppers (0–12) for W U B R G C, plus an "any color" stepper for
  unknown/flexible sources (a source with produces = all five colors + C... no: 'any
  color' = all five colors; keep C separate). Converts counts → `OpenMana` (each unit
  of a stepper is one single-type source; 'any' units are sources producing WUBRG).
  This feeds a `ManualManaProvider` implementing `OpenManaProvider`.
- **TrickList**: grid of card images (Scryfall `image_uris.normal`, lazy-loaded),
  grouped under rarity headers, sort-direction toggle (default common-first). Each
  card links to `scryfall_uri`. Badge on cards with `usesXZero` ("X=0") or
  `mayUseLife` ("via life"). Empty state: "no tricks possible" — arguably the most
  important output, style it clearly.
- Top-level wiring: chosen set + subscribed mana → `findTricks` → `sortTricks` →
  TrickList. Recompute is cheap (a few hundred cards); no memoization heroics needed.
- A small status line: "N of M instant-speed cards in {set} castable".
- Keep all state in React; persist last chosen set in the KVStore.

No router, no state library. Must build to a fully static `dist/` (deployable to any
static host; later served by the Phase-2 companion process).

## WP5 — integration & polish (after WP1–WP4 merge)

- Wire real repository into the app, verify against a real set end to end.
- `pnpm -r test` green; `pnpm -r build` green; README with run instructions.
- Sanity-check known cases in a recent set (e.g. all commons with Flash appear at the
  right mana).

## Order & fan-out

- **WP0 (scaffold)** first, single agent: pnpm workspace, tsconfigs, vitest config,
  `types.ts` copied verbatim from this file, empty module stubs with exported
  signatures so all packages typecheck. Everything else branches from this.
- WP1, WP2, WP3, WP4 in parallel after WP0.
- WP5 last, single agent.

Notes for implementers: `packages/core` must stay dependency-free and browser/node
agnostic — this is the code Phase 2's companion process will also import. Do not add
platform APIs to it. Do not invent extra fields on the pinned types.

## Phase 2 — standalone Electron app with MTGA log integration

Decision (supersedes the earlier local-companion-process sketch): Phase 2 is a
standalone **Electron** desktop app. The web deployment stays exactly as Phase 1 —
the only web-side change is an inert provider-detection shim (WP9) that does nothing
when the Electron bridge is absent. All MTGA integration lives in the desktop build.

### Architecture

`apps/desktop` (Electron, new):
- **main process** (Node): creates the BrowserWindow, locates and tails
  `Player.log`, feeds `packages/arena`'s parser, derives `OpenMana` for the chosen
  player (default: opponent — the "what tricks could they have" use case), pushes
  updates over IPC. Also owns the arena-id card mapping (WP7) on the filesystem.
- **preload** (contextBridge, contextIsolation on, nodeIntegration off): exposes
  `window.mtgatricks = { onOpenMana(cb): unsubscribe, onStatus(cb): unsubscribe }`
  where status is `'tracking' | 'no-log' | 'log-stale' | 'parse-error'`. Nothing
  else crosses the bridge.
- **renderer**: loads `apps/web`'s built `dist/` via `file://` (requires
  `base: './'` in the web vite config — harmless for web hosting). Dev mode loads
  the vite dev server URL instead. No desktop-specific UI code.

`packages/arena` (new): the parsing/derivation brain, structured so everything
except the file tailer is pure and fixture-testable:
- **chunk parser**: raw appended log text → stream of GRE JSON payloads
  (`greToClientEvent` → `greToClientMessages[]`, type `GameStateMessage`). Must
  tolerate interleaved non-JSON lines and split/partial writes.
- **state tracker**: merge full/delta GameStateMessages — `gameObjects`, `zones`
  (battlefield zone), `diffDeletedInstanceIds` (purge or you get phantom cards),
  `AnnotationType_TappedUntappedPermanent` — into per-player battlefield state:
  `{ instanceId, grpId, controllerSeatId, tapped }[]`. Also track which seat is the
  local player (from match start messages) so "opponent" is well-defined.
- **mana derivation**: battlefield state + a `(grpId) => producedMana` lookup →
  `OpenMana` (each untapped permanent with nonempty produced mana = one
  `ManaSource` with `produces` = its produced colors).
- **tailer** (Node-only module, kept separate from the pure parts): follow
  `Player.log` by byte position; detect truncation (Arena empties the log on
  launch) and reset; macOS path `~/Library/Logs/Wizards Of The Coast/MTGA/`,
  Windows path `%LOCALAPPDATA%Low\Wizards Of The Coast\MTGA\`.

### grpId → produced mana (WP7)

Arena logs identify cards by `grpId`; Scryfall exposes this as `arena_id`. The
desktop main process downloads Scryfall bulk **default_cards** once (URL discovered
via `/bulk-data`), streams it, keeps only `{ arena_id, name, produced_mana }` for
cards with an `arena_id`, and caches that compact map as JSON in Electron
`userData` (few MB; refresh on demand or when a grpId misses). Add optional
`arena_id?: number` and `produced_mana?: string[]` to the pinned `Card` type —
additive, web ignores them.

### UI seam (WP9, the only web change)

At startup `apps/web` checks `window.mtgatricks`: present → `BridgeManaProvider`
(implements the existing `OpenManaProvider`) in **auto mode**, with a visible
tracking-status chip and a manual-override toggle that switches back to the
steppers; absent → `ManualManaProvider`, byte-for-byte today's web behavior.

### Known fragility / fallbacks

- The log format is unofficial and has broken across Arena patches. Any parse
  failure must degrade to status `parse-error` + manual mode — never crash, never
  block the UI.
- Requires Options → Account → Detailed Logs (Plugin Support) in Arena (verified
  enabled on this machine; real logs available as fixture material).
- v1 simplifications: summon-sick mana creatures still count as sources; activation
  costs beyond tapping are ignored; opponent lands only known once played (public
  info). Fine for the tricks use case.
- Log fixtures committed to the repo must have identity fields stripped
  (account ids, screen names) — scrub before committing.

### Work packages

- **WP6** `packages/arena`: chunk parser + state tracker + derivation, tested
  against real captured Player.log excerpts (scrubbed). The riskiest WP — the log
  format is folklore, not spec; budget for iterating against the local fixtures.
- **WP7** arena-id mapping: bulk default_cards ingestion + compact map + cache
  (desktop main), `arena_id`/`produced_mana` added to `Card` mapping in
  packages/data.
- **WP8** `apps/desktop`: Electron main/preload/window, IPC plumbing, loads web
  dist (`base: './'`), dev-mode loading, electron-builder config stub.
- **WP9** `apps/web`: BridgeManaProvider + auto/manual toggle + status chip.
- **WP10** integration + packaging (electron-builder, macOS dmg first; Windows
  target configured but built on demand).

Order: WP6 and WP7 in parallel first; WP8 and WP9 in parallel after; WP10 last.
WP6's fixture extraction (from the local Player.log) should happen before fan-out
so the format assumptions are grounded in reality.
