import type { Card, SetInfo } from '@mtgatricks/core';
import type { KVStore } from './storage';
import { fetchSetCards, fetchSets } from './scryfall';

const SETS_KEY = 'sets';
const SETS_TS_KEY = 'sets:ts';
const SETS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function cardsKey(code: string): string {
  return `cards:${code}`;
}

/**
 * Card repository backed by the Scryfall client with a KVStore cache.
 * Cards cached forever under `cards:{code}` (refresh() to force);
 * sets list cached 24h under `sets` (+ `sets:ts` timestamp). WP3 — see PLAN.md.
 */
export class CachedCardRepository {
  constructor(private store: KVStore) {}

  async listSets(): Promise<SetInfo[]> {
    const [cached, tsRaw] = await Promise.all([
      this.store.get(SETS_KEY),
      this.store.get(SETS_TS_KEY),
    ]);

    if (cached !== null && tsRaw !== null) {
      const ts = Number(tsRaw);
      if (Number.isFinite(ts) && Date.now() - ts < SETS_TTL_MS) {
        return JSON.parse(cached) as SetInfo[];
      }
    }

    const sets = await fetchSets();
    await Promise.all([
      this.store.set(SETS_KEY, JSON.stringify(sets)),
      this.store.set(SETS_TS_KEY, String(Date.now())),
    ]);
    return sets;
  }

  async getSetCards(code: string): Promise<Card[]> {
    const cached = await this.store.get(cardsKey(code));
    if (cached !== null) {
      return JSON.parse(cached) as Card[];
    }
    return this.refresh(code);
  }

  /** Refetches a set's cards from Scryfall and overwrites the cache. */
  async refresh(code: string): Promise<Card[]> {
    const cards = await fetchSetCards(code);
    await this.store.set(cardsKey(code), JSON.stringify(cards));
    return cards;
  }
}
