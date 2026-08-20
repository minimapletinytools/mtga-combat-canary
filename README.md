# mtgatricks

Companion app for MTG / MTG Arena: pick a set, enter the opponent's open mana, and see
every card they could cast at instant speed (instants + flash), grouped by rarity.

## Run (web)

```sh
pnpm install
pnpm --filter @mtgatricks/web dev     # dev server
pnpm --filter @mtgatricks/web build   # static build → apps/web/dist
pnpm test                             # all package tests
LIVE_SCRYFALL=1 pnpm --filter @mtgatricks/data exec vitest run test/live.integration.test.ts
                                      # optional live end-to-end smoke test
```

The web app is fully static — card data comes from the Scryfall API in the browser and
is cached in IndexedDB (a set is fetched once, then works offline). Deploy `apps/web/dist`
to any static host.

## Run (desktop, with MTGA auto-tracking)

```sh
pnpm -r build                            # builds core/arena/data + web dist + desktop
pnpm --filter @mtgatricks/desktop start  # launches the Electron app
```

The desktop app is the same UI plus automatic open-mana tracking: it tails MTG Arena's
`Player.log` (enable **Options → Account → Detailed Logs (Plugin Support)** in Arena)
and shows the opponent's untapped mana live, with a status chip and a manual-override
toggle. First launch downloads Scryfall's bulk card data once (~100MB) to build the
Arena-id → produced-mana map, cached under the app's user-data dir. Printings Scryfall
doesn't know yet (new sets) fall back to land subtypes read from the log, so basics and
typed duals always count. Dev mode: `MTGATRICKS_DEV_URL=http://localhost:5173
pnpm --filter @mtgatricks/desktop start` against a running vite dev server.

## Layout

- `packages/core` — pure, dependency-free logic: mana-cost parsing, castability
  (bipartite matching, handles hybrid/phyrexian/mono-hybrid/X), instant-speed filtering,
  rarity sort. Shared verbatim by web and the future desktop companion.
- `packages/data` — Scryfall client (`/sets`, paginated `/cards/search`) + cached
  repository over a `KVStore` abstraction (IndexedDB in the browser, in-memory in tests).
- `apps/web` — React + Vite UI: set picker, mana steppers (W/U/B/R/G/C/any),
  rarity-grouped trick grid with X=0 and phyrexian-life badges.

See `PLAN.md` for the full architecture, pinned types, and the Phase 2 design
(a local Node process that tails MTG Arena's `Player.log` and pushes open mana into the
same UI over a localhost WebSocket via the `OpenManaProvider` seam).
