import { useEffect, useMemo, useState } from 'react';
import type { ArenaStatus, Card, OpenMana, SetInfo, TrickResult } from '@mtgatricks/core';
import { findTricks, sortTricks } from '@mtgatricks/core';
import type { CardSource } from './cardSource';
import { ManualManaProvider } from './manaProvider';
import { BridgeManaProvider } from './bridgeManaProvider';
import { SetPicker } from './components/SetPicker';
import { FormatPicker, type Format } from './components/FormatPicker';
import { ManaSection, type ManaMode } from './components/ManaSection';
import { TrickList, type SortDirection } from './components/TrickList';
import { MascotControl, MascotImage, useMascotSelection } from './components/Mascot';

// Persisted UI choices. Deliberately not using @mtgatricks/data's KVStore
// here — the UI stays dependency-light and these are two strings.
// TODO(WP5): consider moving to KVStore if the UI needs to persist more.
const LAST_SET_CODE_KEY = 'mtgatricks:lastSetCode';
const LAST_FORMAT_KEY = 'mtgatricks:lastFormat';

// Flip to true to re-expose the Standard format picker. Hidden for now —
// see README's "Future features" section: ~700 castable-eligible cards is
// too many to browse usefully without a real sort (rarity alone doesn't cut
// it at Standard's scale the way it does for a ~300-card Limited set). The
// data layer (getStandardCards, 24h-TTL cache) is fully built and tested;
// this is the only gate. When flipped, the picker itself still works.
const STANDARD_FORMAT_ENABLED = false;

type TrickComputation =
  | { status: 'ready'; results: TrickResult[] }
  | { status: 'engine-not-ready'; message: string };

interface AppProps {
  cardSource: CardSource;
}

export function App({ cardSource }: AppProps) {
  const [manualManaProvider] = useState(() => new ManualManaProvider());
  // WP9 seam: window.mtgatricks is only ever present in the Electron
  // desktop build (preload-injected); undefined in a plain browser. The
  // bridge object's identity is stable for the app's lifetime, so reading
  // it once here to decide whether to construct a BridgeManaProvider at all
  // is safe — when absent, nothing below this line ever touches it again.
  const [bridgeManaProvider] = useState(() => {
    const bridge = window.mtgatricks;
    return bridge ? new BridgeManaProvider(bridge) : null;
  });
  const [mode, setMode] = useState<ManaMode>('auto');
  const [mana, setMana] = useState<OpenMana>({ sources: [] });
  const [bridgeStatus, setBridgeStatus] = useState<ArenaStatus | null>(null);
  const [unresolvedCount, setUnresolvedCount] = useState<number | null>(null);

  const [format, setFormat] = useState<Format>(() =>
    STANDARD_FORMAT_ENABLED && localStorage.getItem(LAST_FORMAT_KEY) === 'standard' ? 'standard' : 'limited',
  );

  const [sets, setSets] = useState<SetInfo[] | null>(null);
  const [loadingSets, setLoadingSets] = useState(true);
  const [setsError, setSetsError] = useState<string | null>(null);

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);

  const [direction, setDirection] = useState<SortDirection>('common-first');

  const mascotSelection = useMascotSelection();
  const mascotImage = mascotSelection.selected && <MascotImage selected={mascotSelection.selected} />;

  // The active provider is the bridge's in auto mode (only possible when a
  // bridge exists); manual otherwise. With no bridge, activeProvider is
  // always manualManaProvider — same subscription as Phase 1.
  const activeManaProvider = bridgeManaProvider && mode === 'auto' ? bridgeManaProvider : manualManaProvider;
  useEffect(
    () => activeManaProvider.subscribe((next) => setMana(next ?? { sources: [] })),
    [activeManaProvider],
  );

  useEffect(() => {
    if (!bridgeManaProvider) return;
    return bridgeManaProvider.subscribeStatus(setBridgeStatus);
  }, [bridgeManaProvider]);

  useEffect(() => {
    if (!bridgeManaProvider) return;
    return bridgeManaProvider.subscribeUnresolvedCount(setUnresolvedCount);
  }, [bridgeManaProvider]);

  // Load the set list once, then default to the last-used set (if it still
  // exists) or the newest one.
  useEffect(() => {
    let cancelled = false;
    setLoadingSets(true);
    cardSource
      .listSets()
      .then((result) => {
        if (cancelled) return;
        setSets(result);
        setSetsError(null);
        const saved = localStorage.getItem(LAST_SET_CODE_KEY);
        const fallback = result[0]?.code ?? null;
        setSelectedCode(saved && result.some((set) => set.code === saved) ? saved : fallback);
      })
      .catch((err) => {
        if (!cancelled) setSetsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingSets(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardSource]);

  // Fetch cards whenever the format or (in Limited mode) the selected set
  // changes. Clear the previous cards immediately so stale results never
  // show while the new pool loads.
  useEffect(() => {
    if (format === 'limited' && !selectedCode) return;
    let cancelled = false;
    setLoadingCards(true);
    setCardsError(null);
    setCards(null);
    const fetchCards =
      format === 'standard' ? cardSource.getStandardCards() : cardSource.getSetCards(selectedCode as string);
    fetchCards
      .then((result) => {
        if (!cancelled) setCards(result);
      })
      .catch((err) => {
        if (!cancelled) setCardsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingCards(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardSource, format, selectedCode]);

  function handleSelectSet(code: string) {
    setSelectedCode(code);
    localStorage.setItem(LAST_SET_CODE_KEY, code);
  }

  function handleFormatChange(next: Format) {
    setFormat(next);
    localStorage.setItem(LAST_FORMAT_KEY, next);
  }

  // The trick pipeline (packages/core) throws until WP1/WP2 land — guard so
  // the fixture app never white-screens during parallel development.
  const computation = useMemo<TrickComputation | null>(() => {
    if (!cards) return null;
    try {
      const found = findTricks(cards, mana);
      const sorted = sortTricks(found, direction);
      return { status: 'ready', results: sorted };
    } catch (err) {
      return {
        status: 'engine-not-ready',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }, [cards, mana, direction]);

  return (
    <>
      <MascotControl value={mascotSelection.key} onChange={mascotSelection.setKey} />
      <div className="app">
      <div className="header-row">
        <header className="app-header">
          <h1>MTG Combat Canary</h1>
          <p className="tagline">
            {STANDARD_FORMAT_ENABLED
              ? 'Pick a format, enter open mana, see every instant-speed trick.'
              : 'Pick a set, enter open mana, see every instant-speed trick.'}
          </p>
        </header>

        <div className="picker-row">
          {STANDARD_FORMAT_ENABLED && <FormatPicker format={format} onChange={handleFormatChange} />}
          {format === 'limited' && (
            <SetPicker
              sets={sets}
              selectedCode={selectedCode}
              onSelect={handleSelectSet}
              loadingSets={loadingSets}
              loadingCards={loadingCards}
            />
          )}
        </div>
      </div>

      {setsError && <div className="banner banner-error">Could not load sets: {setsError}</div>}

      {cardsError && <div className="banner banner-error">Could not load card data: {cardsError}</div>}

      <ManaSection
        manualManaProvider={manualManaProvider}
        bridgeManaProvider={bridgeManaProvider}
        mana={mana}
        bridgeStatus={bridgeStatus}
        unresolvedCount={unresolvedCount}
        mode={mode}
        onModeChange={setMode}
        mascotImage={mascotImage}
      />

      <main>
        {loadingCards ? (
          <div className="banner banner-loading">
            <span className="spinner" aria-hidden="true" />
            Loading card data…
          </div>
        ) : !computation ? (
          <div className="banner banner-info">
            {format === 'limited' ? 'Pick a set to see possible tricks.' : 'Loading Standard card data…'}
          </div>
        ) : computation.status === 'engine-not-ready' ? (
          <div className="banner banner-warning">
            <strong>Engine not ready.</strong> The core trick-finding logic (WP1/WP2) hasn&rsquo;t
            landed yet, so results can&rsquo;t be computed.
            <div className="banner-detail">{computation.message}</div>
          </div>
        ) : (
          <TrickList results={computation.results} direction={direction} onDirectionChange={setDirection} />
        )}
      </main>
      </div>
    </>
  );
}
