import type { Card, SetInfo } from '@mtgatricks/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CachedCardRepository } from '../src/repository';
import { MemoryStore } from '../src/storage';
import * as scryfall from '../src/scryfall';

vi.mock('../src/scryfall', () => ({
  fetchSets: vi.fn(),
  fetchSetCards: vi.fn(),
  fetchStandardCards: vi.fn(),
}));

const mockedFetchSets = vi.mocked(scryfall.fetchSets);
const mockedFetchSetCards = vi.mocked(scryfall.fetchSetCards);
const mockedFetchStandardCards = vi.mocked(scryfall.fetchStandardCards);

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
    mockedFetchStandardCards.mockReset();
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

  describe('getStandardCards', () => {
    it('fetches on a cache miss and persists JSON + timestamp under cards:standard', async () => {
      mockedFetchStandardCards.mockResolvedValue(sampleCards);
      const store = new MemoryStore();
      const repo = new CachedCardRepository(store);

      const before = Date.now();
      const result = await repo.getStandardCards();
      const after = Date.now();

      expect(result).toEqual(sampleCards);
      expect(mockedFetchStandardCards).toHaveBeenCalledTimes(1);
      expect(await store.get('cards:standard')).toBe(JSON.stringify(sampleCards));

      const ts = Number(await store.get('cards:standard:ts'));
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('serves from cache within the 24h TTL without refetching', async () => {
      mockedFetchStandardCards.mockResolvedValue(sampleCards);
      const store = new MemoryStore();
      const repo = new CachedCardRepository(store);

      await repo.getStandardCards();
      const second = await repo.getStandardCards();

      expect(second).toEqual(sampleCards);
      expect(mockedFetchStandardCards).toHaveBeenCalledTimes(1);
    });

    it('refetches once the 24h TTL has expired (Standard rotates, unlike a printed set)', async () => {
      mockedFetchStandardCards.mockResolvedValue(sampleCards);
      const store = new MemoryStore();
      const repo = new CachedCardRepository(store);

      await repo.getStandardCards();
      expect(mockedFetchStandardCards).toHaveBeenCalledTimes(1);

      const staleTs = Date.now() - 25 * 60 * 60 * 1000;
      await store.set('cards:standard:ts', String(staleTs));

      const rotatedCards: Card[] = [{ ...sampleCards[0]!, id: 'card-rotated', name: 'Post-Rotation Card' }];
      mockedFetchStandardCards.mockResolvedValue(rotatedCards);

      const result = await repo.getStandardCards();
      expect(result).toEqual(rotatedCards);
      expect(mockedFetchStandardCards).toHaveBeenCalledTimes(2);
    });

    it('treats a missing timestamp as a cache miss even if the JSON is present', async () => {
      mockedFetchStandardCards.mockResolvedValue(sampleCards);
      const store = new MemoryStore();
      await store.set('cards:standard', JSON.stringify(sampleCards));

      const repo = new CachedCardRepository(store);
      const result = await repo.getStandardCards();

      expect(result).toEqual(sampleCards);
      expect(mockedFetchStandardCards).toHaveBeenCalledTimes(1);
    });

    it('does not collide with the forever-cached per-set cache under cards:{code}', async () => {
      mockedFetchSetCards.mockResolvedValue(sampleCards);
      mockedFetchStandardCards.mockResolvedValue([
        { ...sampleCards[0]!, id: 'card-standard', name: 'Standard-Only Card' },
      ]);
      const store = new MemoryStore();
      const repo = new CachedCardRepository(store);

      const setResult = await repo.getSetCards('fdn');
      const standardResult = await repo.getStandardCards();

      expect(setResult[0]?.name).toBe('Test Instant');
      expect(standardResult[0]?.name).toBe('Standard-Only Card');
      expect(await store.get('cards:fdn')).not.toBe(await store.get('cards:standard'));
    });
  });

  describe('refreshStandard', () => {
    it('always refetches and overwrites the Standard cache, even on a cache hit', async () => {
      mockedFetchStandardCards.mockResolvedValueOnce(sampleCards).mockResolvedValueOnce([]);
      const store = new MemoryStore();
      const repo = new CachedCardRepository(store);

      await repo.getStandardCards();
      expect(mockedFetchStandardCards).toHaveBeenCalledTimes(1);

      const refreshed = await repo.refreshStandard();
      expect(refreshed).toEqual([]);
      expect(mockedFetchStandardCards).toHaveBeenCalledTimes(2);
      expect(await store.get('cards:standard')).toBe(JSON.stringify([]));

      const afterRefresh = await repo.getStandardCards();
      expect(afterRefresh).toEqual([]);
      expect(mockedFetchStandardCards).toHaveBeenCalledTimes(2);
    });
  });
});
