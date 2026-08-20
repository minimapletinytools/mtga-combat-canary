import { describe, expect, it } from 'vitest';
import { findTricks, type OpenMana } from '@mtgatricks/core';
import { fetchSetCards, fetchSets } from '../src/scryfall';

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
});
