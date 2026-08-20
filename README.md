# mtgatricks

A companion app for Magic: The Gathering / MTG Arena that answers one question fast:
**given the opponent's open mana, what could they cast at instant speed?** Pick a set,
enter (or auto-detect) the untapped mana, and get every instant and flash card they
could have, grouped by rarity — commons first, since those are what you'll actually
face in limited.

It ships two ways from one codebase:

- **Web app** — fully static, manual mana entry. Card data comes from the Scryfall API
  in the browser and is cached in IndexedDB, so a set is fetched once and then works
  offline. Deploy `apps/web/dist` to any static host.
- **Desktop app (Electron)** — the same UI plus live tracking: it tails MTG Arena's
  `Player.log` and fills in the opponent's untapped mana automatically as you play,
  with a status chip and a manual-override toggle.

## How it works

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
- `apps/web` — React + Vite UI: set picker, mana steppers, rarity-grouped trick grid,
  and the desktop bridge detection (inert on the plain web).
- `apps/desktop` — Electron shell: main-process tracker wiring, the Scryfall bulk
  arena-id map, and a contextBridge preload exposing `window.mtgatricks`.

See `PLAN.md` for the full architecture, pinned interfaces, and phase history.

## Running

```sh
pnpm install
pnpm -r test                             # all package tests
pnpm --filter @mtgatricks/web dev        # web dev server
pnpm --filter @mtgatricks/web build      # static build → apps/web/dist
```

Desktop:

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

## Known gaps

- **Eldrazi Spawn / Scion tokens aren't counted.** They sacrifice for `{C}`, but their
  subtypes aren't in the fallback table — and because they're creature tokens, the
  summoning-sickness filter would wrongly exclude fresh ones even if they were (sac
  abilities work while sick). No current Arena set leans on them; revisit if that
  changes.
- **Powerstone mana over-reports.** It's counted as `{C}` but really can't pay for
  nonartifact spells. Over-reporting is the deliberate direction for a warning tool.
- **Untyped nonbasic lands from brand-new sets** can be missed until Scryfall backfills
  `arena_id`s for the printing. Basic-typed lands and duals are covered by the subtype
  fallback regardless.
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
