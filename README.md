# mtga-combat-canary

A companion app for Magic: The Gathering / Arena Sealed/Draft play that answers one question fast:
**given the opponent's open mana, what could they cast at instant speed?** 

There are 2 version. The web versino you can use [HERE](https://minimapletinytools.github.io/mtga-combat-canary/)

The desktop electron app version supports tailing your MTGA log file to auto-detect open mana.

## Running

### Desktop

```sh
pnpm -r build                            # core/arena/data + web dist + desktop
pnpm --filter @mtgatricks/desktop start  # launch the Electron app
```

For auto-tracking, enable **Options → Account → Detailed Logs (Plugin Support)** in
MTG Arena. First desktop launch downloads Scryfall's bulk card data once (~100MB) to
build the arena-id map, cached under the app's user-data directory. Dev mode:
`MTGATRICKS_DEV_URL=http://localhost:5173 pnpm --filter @mtgatricks/desktop start`
against a running vite dev server. Optional live API smoke test:
`LIVE_SCRYFALL=1 pnpm --filter @mtgatricks/data exec vitest run test/live.integration.test.ts`.

### Web

The web app is hosted at [https://minimapletinytools.github.io/mtga-combat-canary/](https://minimapletinytools.github.io/mtga-combat-canary/) so you can just use it there

```sh
pnpm install
pnpm -r test                             # all package tests
pnpm --filter @mtgatricks/web dev        # web dev server
pnpm --filter @mtgatricks/web build      # static build → apps/web/dist
```


## How it works

**Two card pools.** A Format dropdown picks Limited (then a second dropdown picks
which set, its full printed pool) or Standard (the current constructed-legal
instant-speed pool, no set to pick — fetched pre-filtered via Scryfall's own search
syntax, `legal:standard (t:instant or keyword:flash)`, since the full Standard pool is
~6.6x bigger than what's actually shown). Limited defaults on. Standard's pool is
cached for 24h (it rotates) rather than forever, unlike a printed set's cards.

**Castability is real satisfiability, not a mana-value check.** Each card's cost is
parsed into pips (colored, hybrid `{W/U}`, mono-hybrid `{2/W}`, phyrexian `{W/P}`,
colorless `{C}`, snow, X) and matched against the open sources with bipartite maximum
matching, so duals and flexible sources are assigned correctly. X spells count at X=0
(badged), phyrexian pips count as payable via life (badged).

**The desktop tracker** replays Arena's GRE protocol from `Player.log`: it merges
full/delta `GameStateMessage`s (game objects, battlefield zone, deleted-instance
purging, object-id renames), reads tap state and summoning sickness straight off the
game objects, and identifies your seat from the message envelopes. Untapped permanents
the opponent controls become mana sources through a two-step lookup:

1. a `grpId → produced mana` map built once from Scryfall bulk data (cached locally);
2. a fallback from the log's own subtypes — basic land types (`SubType_Mountain` → R,
   including typed duals) and mana tokens (Treasure/Gold → any color, Powerstone → C)
   — which covers everything Scryfall's Arena-id data doesn't know, such as token
   grpIds and printings from brand-new sets.

Summoning-sick creatures are excluded until the flag clears. The log format is
unofficial; any parse failure degrades to a status chip and manual entry — never a
crash.

## Repository layout

- `packages/core` — pure, dependency-free logic: mana parsing, castability solver,
  instant-speed filtering, rarity sort. Shared by every deployment.
- `packages/arena` — Player.log machinery: line assembly, GRE state tracker, log
  tailer, open-mana derivation. Tested against a real (scrubbed) log fixture.
- `packages/data` — Scryfall client (sets, paginated set search) + cached repository
  over a `KVStore` abstraction (IndexedDB in the browser, memory in tests).
- `apps/web` — React + Vite UI: format/set pickers, mana steppers, rarity-grouped
  trick grid, and the desktop bridge detection (inert on the plain web).
- `apps/desktop` — Electron shell: main-process tracker wiring, the Scryfall bulk
  arena-id map, and a contextBridge preload exposing `window.mtgatricks`.

See `PLAN.md` for the full architecture, pinned interfaces, and phase history.

## Known gaps

- **Eldrazi Spawn / Scion tokens aren't counted.** They sacrifice for `{C}`, but their
  subtypes aren't in the fallback table — and because they're creature tokens, the
  summoning-sickness filter would wrongly exclude fresh ones even if they were (sac
  abilities work while sick). No current Arena set leans on them; revisit if that
  changes.
- **Powerstone mana over-reports.** It's counted as `{C}` but really can't pay for
  nonartifact spells. Over-reporting is the deliberate direction for a warning tool.
- **Dual/tri-lands without basic land types depend entirely on Scryfall's data.** The
  subtype fallback only helps when the log itself flags a land with basic land
  subtypes — shocklands (Steam Vents), the original ABUR duals (Tundra), battle lands
  (Prairie Stream), and the Ikoria/Streets of New Capenna triomes (Zagoth Triome) all
  carry real basic land types, so those are covered even before Scryfall indexes the
  printing. Guildgates, checklands (Rootbound Crag), fastlands (Seachrome Coast), and
  the original Khans tri-lands (Nomad Outpost) carry no basic land type at all, so
  those rely entirely on the Scryfall arena-id map — if that specific printing isn't
  indexed yet (brand-new set), the land is silently dropped as a source instead of
  guessed at.
- **Hasty mana dorks** may be briefly under-counted if Arena still flags them
  summoning-sick in the log (sickness only matters at activation time for tap
  abilities).
- **Activation costs and color restrictions beyond tapping are ignored** — conditional
  lands ("tap for X only if…", filter lands, spell-type restrictions) count as plain
  sources of their listed colors.
- **The arena-id cache never expires.** New-set coverage improves only when the cache
  file is deleted (or `forceRefresh` is wired to a UI button someday).
- **Alchemy rebalanced cards (`A-` prefix)** aren't specially handled; set pools come
  from Scryfall and may differ slightly from Arena's Alchemy variants.
- **The log format is unofficial** and has broken across Arena patches before. The app
  is built to degrade to manual mode, but tracking can silently lag a patch until the
  parser is updated.

## Future features

- **Sort by real-world play frequency.** The obvious next step for Standard mode —
  order results by how often each card actually shows up in decks, not just rarity.
  Investigated and shelved for now: TopDeck.gg has a real, free, documented API
  (`topdeck.gg/docs/tournaments-v2`), but a live check (2026-08-20/21) found its
  Standard coverage is far too sparse to be representative — 118 tournaments and only
  **39 decklisted entries total** over the last 6 months, concentrated in one local
  game store's weekly league. (Their real strength is Commander/cEDH — an EDH pull
  over just 60 days returned 134MB of data, versus a few hundred KB for Standard.)
  Building a "most played" sort on that sample would rank a couple of specific local
  players' pet cards above genuine staples — actively misleading, not just noisy. The
  path forward is **Melee.gg** (WotC's actual organized-play platform, so premier
  Standard events — RCQs, Arena Opens — genuinely happen there): access isn't
  self-serve, it requires emailing `contact@melee.gg` and possibly a fee/approval
  wait. If that data ever lands, the plumbing is a small, contained addition: a
  `play_count?: number` field on the pinned `Card` type (same pattern as `arena_id`/
  `produced_mana`), a `'most-played'` direction in `sortTricks`, a scheduled CI job
  (mirroring `.github/workflows/deploy-pages.yml`) that precomputes a
  `play-frequency.json` static asset server-side — never calling the data source's
  API from the browser, since that would mean shipping an API key in a public static
  bundle — and a small merge-by-name step in the web app before sorting.
- **Formats beyond Standard.** Pioneer, Modern, Historic/Explorer, Alchemy, etc. The
  Standard-mode plumbing generalizes cleanly: `CardSource.getStandardCards()` is
  really "fetch a format's Scryfall-legal instant-speed pool with a 24h TTL" — turning
  it into `getFormatCards(format)` and widening `FormatPicker`'s dropdown is most of
  the work. Held off until there's a real reason to add more than one non-Limited
  format at once (possibly the same moment play-frequency data arrives, since ranking
  matters more once the pool isn't small enough to just scan by eye).

## Maintenance and Contribution

This app queries and caches data from scryfall so it should stay most up to date without any maintenance unless scryfall APIs change.

The desktop floating mana detection is likely to break with each new sets as the lands ids change and this requires someone to manually update the new card ids or perhaps we can find a more stable solution... I play on and off so I may not always update it. You're welcome to open issues or create PRs and I will take a look though!
