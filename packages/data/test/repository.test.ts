import type { Card, SetInfo } from '@mtgatricks/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CachedCardRepository } from '../src/repository';
import { MemoryStore } from '../src/storage';
import * as scryfall from '../src/scryfall';

vi.mock('../src/scryfall', () => ({
  fetchSets: vi.fn(),
  fetchSetCards: vi.fn(),
}));

const mockedFetchSets = vi.mocked(scryfall.fetchSets);
const mockedFetchSetCards = vi.mocked(scryfall.fetchSetCards);

const sampleSets: SetInfo[] = [
  {
    code: 'fdn',
    name: 'Foundations',
    released_at: '2024-11-15',
    set_type: 'core',
    card_count: 300,
    icon_svg_uri: 'https://svgs.scryfall.io/sets/fdn.svg',
  },
];

const sampleCards: Card[] = [
  {
    id: 'card-1',
    name: 'Test Instant',
    set: 'fdn',
    collector_number: '1',
    rarity: 'common',
    mana_cost: '{1}{R}',
    cmc: 2,
    type_line: 'Instant',
    keywords: [],
    layout: 'normal',
    games: ['arena'],
    scryfall_uri: 'https://scryfall.com/card/fdn/1',
  },
];

describe('CachedCardRepository', () => {
  beforeEach(() => {
    mockedFetchSets.mockReset();
    mockedFetchSetCards.mockReset();
  });

  describe('getSetCards', () => {
    it('fetches on a cache miss and persists JSON under cards:{code}', async () => {
      mockedFetchSetCards.mockResolvedValue(sampleCards);
      const store = new MemoryStore();
      const repo = new CachedCardRepository(store);

      const result = await repo.getSetCards('fdn');

      expect(result).toEqual(sampleCards);
      expect(mockedFetchSetCards).toHaveBeenCalledTimes(1);
      expect(mockedFetchSetCards).toHaveBeenCalledWith('fdn');
      expect(await store.get('cards:fdn')).toBe(JSON.stringify(sampleCards));
    });

    it('serves from cache on subsequent calls without refetching (cards cache forever)', async () => {
      mockedFetchSetCards.mockResolvedValue(sampleCards);
      const store = new MemoryStore();
      const repo = new CachedCardRepository(store);

      await repo.getSetCards('fdn');
      const second = await repo.getSetCards('fdn');

      expect(second).toEqual(sampleCards);
      expect(mockedFetchSetCards).toHaveBeenCalledTimes(1);
    });

    it('keeps separate cache entries per set code', async () => {
      const otherCards: Card[] = [{ ...sampleCards[0]!, id: 'card-2', name: 'Other Set Card', set: 'znr' }];
      mockedFetchSetCards.mockImplementation(async (code: string) =>
        code === 'fdn' ? sampleCards : otherCards,
      );
      const store = new MemoryStore();
      const repo = new CachedCardRepository(store);

      const fdn = await repo.getSetCards('fdn');
      const znr = await repo.getSetCards('znr');

      expect(fdn).toEqual(sampleCards);
      expect(znr).toEqual(otherCards);
      expect(mockedFetchSetCards).toHaveBeenCalledTimes(2);
    });
  });

  describe('refresh', () => {
    it('always refetches and overwrites the cards cache, even on a cache hit', async () => {
      mockedFetchSetCards.mockResolvedValueOnce(sampleCards).mockResolvedValueOnce([]);
      const store = new MemoryStore();
      const repo = new CachedCardRepository(store);

      await repo.getSetCards('fdn');
      expect(mockedFetchSetCards).toHaveBeenCalledTimes(1);

      const refreshed = await repo.refresh('fdn');
      expect(refreshed).toEqual([]);
      expect(mockedFetchSetCards).toHaveBeenCalledTimes(2);
      expect(await store.get('cards:fdn')).toBe(JSON.stringify([]));

      // A subsequent getSetCards should now see the refreshed (overwritten) value.
      const afterRefresh = await repo.getSetCards('fdn');
      expect(afterRefresh).toEqual([]);
      expect(mockedFetchSetCards).toHaveBeenCalledTimes(2);
    });
  });

  describe('listSets', () => {
    it('fetches on a cache miss and persists JSON + timestamp', async () => {
      mockedFetchSets.mockResolvedValue(sampleSets);
      const store = new MemoryStore();
      const repo = new CachedCardRepository(store);

      const before = Date.now();
      const result = await repo.listSets();
      const after = Date.now();

      expect(result).toEqual(sampleSets);
      expect(mockedFetchSets).toHaveBeenCalledTimes(1);
      expect(await store.get('sets')).toBe(JSON.stringify(sampleSets));

      const ts = Number(await store.get('sets:ts'));
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('serves from cache within the 24h TTL without refetching', async () => {
      mockedFetchSets.mockResolvedValue(sampleSets);
      const store = new MemoryStore();
      const repo = new CachedCardRepository(store);

      await repo.listSets();
      const second = await repo.listSets();

      expect(second).toEqual(sampleSets);
      expect(mockedFetchSets).toHaveBeenCalledTimes(1);
    });

    it('refetches once the 24h TTL has expired', async () => {
      mockedFetchSets.mockResolvedValue(sampleSets);
      const store = new MemoryStore();
      const repo = new CachedCardRepository(store);

      await repo.listSets();
      expect(mockedFetchSets).toHaveBeenCalledTimes(1);

      // Inject an expired timestamp (25h old) directly, per PLAN.md guidance.
      const staleTs = Date.now() - 25 * 60 * 60 * 1000;
      await store.set('sets:ts', String(staleTs));

      const refreshedSets: SetInfo[] = [{ ...sampleSets[0]!, code: 'new-fdn' }];
      mockedFetchSets.mockResolvedValue(refreshedSets);

      const result = await repo.listSets();
      expect(result).toEqual(refreshedSets);
      expect(mockedFetchSets).toHaveBeenCalledTimes(2);
    });

    it('does not refetch when the cache is just under the 24h TTL', async () => {
      mockedFetchSets.mockResolvedValue(sampleSets);
      const store = new MemoryStore();
      const repo = new CachedCardRepository(store);

      await repo.listSets();
      expect(mockedFetchSets).toHaveBeenCalledTimes(1);

      const freshTs = Date.now() - (24 * 60 * 60 * 1000 - 1000);
      await store.set('sets:ts', String(freshTs));

      const result = await repo.listSets();
      expect(result).toEqual(sampleSets);
      expect(mockedFetchSets).toHaveBeenCalledTimes(1);
    });

    it('treats a missing timestamp as a cache miss even if sets JSON is present', async () => {
      mockedFetchSets.mockResolvedValue(sampleSets);
      const store = new MemoryStore();
      await store.set('sets', JSON.stringify(sampleSets));

      const repo = new CachedCardRepository(store);
      const result = await repo.listSets();

      expect(result).toEqual(sampleSets);
      expect(mockedFetchSets).toHaveBeenCalledTimes(1);
    });
  });
});
