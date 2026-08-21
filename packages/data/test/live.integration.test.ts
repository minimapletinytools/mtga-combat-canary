import { describe, expect, it } from 'vitest';
import { findTricks, type OpenMana } from '@mtgatricks/core';
import { fetchSetCards, fetchStandardCards, fetchSets } from '../src/scryfall';

// End-to-end smoke test against the real Scryfall API. Skipped by default so
// the suite stays offline-safe; run with LIVE_SCRYFALL=1 to enable.
// (globalThis access keeps this package free of @types/node.)
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const live = env?.['LIVE_SCRYFALL'] === '1';

describe.skipIf(!live)('live Scryfall smoke test', () => {
  it('fetches Foundations and finds real tricks', async () => {
    const sets = await fetchSets();
    expect(sets.length).toBeGreaterThan(50);
    expect(sets.some((s) => s.code === 'fdn')).toBe(true);

    const cards = await fetchSetCards('fdn');
    expect(cards.length).toBeGreaterThan(200);

    const twoRed: OpenMana = {
      sources: [{ produces: ['R'] }, { produces: ['R'] }],
    };
    const tricks = findTricks(cards, twoRed);
    expect(tricks.length).toBeGreaterThan(10);

    // Abrade ({1}{R}) is in FDN and castable off two red sources.
    const abrade = tricks.find((t) => t.card.name === 'Abrade');
    expect(abrade?.castability.castable).toBe(true);

    // Cancel ({1}{U}{U}) is in FDN and must not be castable off two red.
    const cancel = tricks.find((t) => t.card.name === 'Cancel');
    expect(cancel).toBeDefined();
    expect(cancel?.castability.castable).toBe(false);
  }, 60_000);

  it('fetches the Standard-legal instant-speed pool, pre-filtered server-side', async () => {
    const cards = await fetchStandardCards();
    // ~700 as of writing (Standard's full legal pool is ~4,900) — a wide
    // sanity band since the pool shifts every rotation/banning, not a tight
    // pin. The real assertion is the query-level filter actually worked:
    // every returned card must be an instant OR carry the Flash keyword.
    expect(cards.length).toBeGreaterThan(300);
    expect(cards.length).toBeLessThan(1500);
    for (const card of cards) {
      const isInstant = card.type_line.includes('Instant');
      const hasFlash = card.keywords.includes('Flash');
      const faceIsInstant = card.card_faces?.some((f) => f.type_line.includes('Instant')) ?? false;
      expect(isInstant || hasFlash || faceIsInstant, `${card.name}: ${card.type_line}`).toBe(true);
    }
  }, 60_000);
});
