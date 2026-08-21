import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSetCards, fetchStandardCards, fetchSets } from '../src/scryfall';
import searchFixture from './fixtures/search-page.json';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestedUrl(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): URL {
  return new URL(String(fetchMock.mock.calls[callIndex]?.[0]));
}

describe('fetchSetCards', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a URL-encoded search request for the given set code', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ object: 'list', data: [], has_more: false }));

    await fetchSetCards('fdn');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = requestedUrl(fetchMock, 0);
    expect(url.origin + url.pathname).toBe('https://api.scryfall.com/cards/search');
    expect(url.searchParams.get('q')).toBe('set:fdn');
    expect(url.searchParams.get('unique')).toBe('cards');
  });

  it('sets User-Agent and Accept headers (Scryfall 400s without them)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ object: 'list', data: [], has_more: false }));

    await fetchSetCards('fdn');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get('User-Agent')).toBe('mtgatricks/0.1');
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('maps raw Scryfall cards to the pinned Card shape', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...searchFixture, has_more: false }));

    const cards = await fetchSetCards('fdn');

    expect(cards).toHaveLength(searchFixture.data.length);

    const abrade = cards.find((c) => c.name === 'Abrade');
    expect(abrade).toEqual({
      id: '548947dc-a5ca-43b5-9531-bcef20fa4ae5',
      name: 'Abrade',
      set: 'fdn',
      collector_number: '188',
      rarity: 'uncommon',
      mana_cost: '{1}{R}',
      cmc: 2,
      type_line: 'Instant',
      keywords: [],
      layout: 'normal',
      games: ['paper', 'arena', 'mtgo'],
      scryfall_uri: 'https://scryfall.com/card/fdn/188/abrade?utm_source=api',
      image_uris: {
        normal:
          'https://cards.scryfall.io/normal/front/5/4/548947dc-a5ca-43b5-9531-bcef20fa4ae5.jpg?1783909069',
        small:
          'https://cards.scryfall.io/small/front/5/4/548947dc-a5ca-43b5-9531-bcef20fa4ae5.jpg?1783909069',
      },
    });

    const burstLightning = cards.find((c) => c.name === 'Burst Lightning');
    expect(burstLightning?.keywords).toEqual(['Kicker']);
    expect(burstLightning?.rarity).toBe('common');
  });

  it('maps multi-face cards, including per-face mana_cost/type_line/oracle_text/image_uris, and omits mana_cost/image_uris at the card level when absent', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...searchFixture, has_more: false }));

    const cards = await fetchSetCards('fdn');
    const jwari = cards.find((c) => c.name.startsWith('Jwari Disruption'));

    expect(jwari).toBeDefined();
    expect(jwari?.mana_cost).toBeUndefined();
    expect(jwari?.image_uris).toBeUndefined();
    expect(jwari?.layout).toBe('modal_dfc');
    expect(jwari?.card_faces).toHaveLength(2);

    const [front, back] = jwari!.card_faces!;
    expect(front).toEqual({
      name: 'Jwari Disruption',
      mana_cost: '{1}{U}',
      type_line: 'Instant',
      oracle_text: expect.any(String),
      image_uris: {
        normal: expect.stringContaining('cards.scryfall.io/normal/front/'),
        small: expect.stringContaining('cards.scryfall.io/small/front/'),
      },
    });
    expect(back).toEqual({
      name: 'Jwari Ruins',
      mana_cost: '',
      type_line: 'Land',
      oracle_text: expect.any(String),
      image_uris: {
        normal: expect.stringContaining('cards.scryfall.io/normal/back/'),
        small: expect.stringContaining('cards.scryfall.io/small/back/'),
      },
    });
  });

  it('follows next_page while has_more is true, waiting between page requests', async () => {
    const pageOneCard = {
      id: 'id-1',
      name: 'Page One Card',
      set: 'abc',
      collector_number: '1',
      rarity: 'common',
      mana_cost: '{U}',
      cmc: 1,
      type_line: 'Instant',
      keywords: [],
      layout: 'normal',
      games: ['arena'],
      scryfall_uri: 'https://scryfall.com/card/abc/1',
    };
    const pageTwoCard = { ...pageOneCard, id: 'id-2', name: 'Page Two Card', collector_number: '2' };

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          object: 'list',
          data: [pageOneCard],
          has_more: true,
          next_page: 'https://api.scryfall.com/cards/search?q=set%3Aabc&unique=cards&page=2',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          object: 'list',
          data: [pageTwoCard],
          has_more: false,
        }),
      );

    const start = Date.now();
    const cards = await fetchSetCards('abc');
    const elapsed = Date.now() - start;

    expect(cards.map((c) => c.name)).toEqual(['Page One Card', 'Page Two Card']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://api.scryfall.com/cards/search?q=set%3Aabc&unique=cards&page=2',
    );
    // At least 75ms delay between paginated requests.
    expect(elapsed).toBeGreaterThanOrEqual(70);
  });

  it('retries once after a 1s backoff on HTTP 429', async () => {
    const card = {
      id: 'id-1',
      name: 'Rate Limited Card',
      set: 'abc',
      collector_number: '1',
      rarity: 'common',
      mana_cost: '{U}',
      cmc: 1,
      type_line: 'Instant',
      keywords: [],
      layout: 'normal',
      games: ['arena'],
      scryfall_uri: 'https://scryfall.com/card/abc/1',
    };

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ object: 'error', status: 429, code: 'rate_limited' }, 429))
      .mockResolvedValueOnce(jsonResponse({ object: 'list', data: [card], has_more: false }));

    const start = Date.now();
    const cards = await fetchSetCards('abc');
    const elapsed = Date.now() - start;

    expect(cards).toHaveLength(1);
    expect(cards[0]?.name).toBe('Rate Limited Card');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(elapsed).toBeGreaterThanOrEqual(950);
  }, 10000);

  it('returns an empty array on a 404 "no cards found" error response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ object: 'error', status: 404, code: 'not_found', details: 'No cards found' }, 404),
    );

    const cards = await fetchSetCards('zzz-nonexistent');

    expect(cards).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchStandardCards', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('queries legal:standard pre-filtered to instant-speed cards, not the whole pool', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ object: 'list', data: [], has_more: false }));

    await fetchStandardCards();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = requestedUrl(fetchMock, 0);
    expect(url.origin + url.pathname).toBe('https://api.scryfall.com/cards/search');
    expect(url.searchParams.get('q')).toBe('legal:standard (t:instant or keyword:flash)');
    expect(url.searchParams.get('unique')).toBe('cards');
  });

  it('shares fetchSetCards\' mapping, pagination, and headers (reuses fetchAllCards)', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          object: 'list',
          data: [
            {
              id: 'std-1',
              name: 'Standard Instant',
              set: 'abc',
              collector_number: '1',
              rarity: 'common',
              mana_cost: '{U}',
              cmc: 1,
              type_line: 'Instant',
              keywords: [],
              layout: 'normal',
              games: ['arena'],
              scryfall_uri: 'https://scryfall.com/card/abc/1',
            },
          ],
          has_more: true,
          next_page: 'https://api.scryfall.com/cards/search?q=legal%3Astandard&unique=cards&page=2',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ object: 'list', data: [], has_more: false }));

    const cards = await fetchStandardCards();

    expect(cards).toEqual([
      expect.objectContaining({ id: 'std-1', name: 'Standard Instant', rarity: 'common' }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // pagination followed
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get('User-Agent')).toBe('mtgatricks/0.1'); // same header etiquette
  });
});

describe('fetchSets', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps only expansion/core/draft_innovation sets with card_count > 0, sorted newest first', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        object: 'list',
        data: [
          {
            code: 'old',
            name: 'Old Core Set',
            released_at: '2010-01-01',
            set_type: 'core',
            card_count: 249,
            icon_svg_uri: 'https://svgs.scryfall.io/sets/old.svg',
          },
          {
            code: 'new',
            name: 'New Expansion',
            released_at: '2025-01-01',
            set_type: 'expansion',
            card_count: 281,
            icon_svg_uri: 'https://svgs.scryfall.io/sets/new.svg',
          },
          {
            code: 'promo',
            name: 'Some Promos',
            released_at: '2025-06-01',
            set_type: 'promo',
            card_count: 12,
            icon_svg_uri: 'https://svgs.scryfall.io/sets/promo.svg',
          },
          {
            code: 'empty',
            name: 'Unreleased Expansion',
            released_at: '2026-01-01',
            set_type: 'expansion',
            card_count: 0,
            icon_svg_uri: 'https://svgs.scryfall.io/sets/empty.svg',
          },
          {
            code: 'dft',
            name: 'A Draft Innovation Set',
            released_at: '2024-06-01',
            set_type: 'draft_innovation',
            card_count: 63,
            icon_svg_uri: 'https://svgs.scryfall.io/sets/dft.svg',
          },
        ],
      }),
    );

    const sets = await fetchSets();

    expect(sets.map((s) => s.code)).toEqual(['new', 'dft', 'old']);
    expect(sets[0]).toEqual({
      code: 'new',
      name: 'New Expansion',
      released_at: '2025-01-01',
      set_type: 'expansion',
      card_count: 281,
      icon_svg_uri: 'https://svgs.scryfall.io/sets/new.svg',
    });
  });
});
