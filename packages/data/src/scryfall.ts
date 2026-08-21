import type { Card, CardFace, SetInfo } from '@mtgatricks/core';

const API_BASE = 'https://api.scryfall.com';

/** set_type values we keep for the set picker — draftable/constructed sets. */
const KEEP_SET_TYPES = new Set(['expansion', 'core', 'draft_innovation']);

/** Minimum delay between paginated search requests, per Scryfall etiquette. */
const PAGE_DELAY_MS = 75;
/** Backoff before retrying a single 429. */
const RATE_LIMIT_BACKOFF_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Scryfall rejects requests missing User-Agent or Accept with a 400. Browsers
// always send both (and silently drop a scripted User-Agent, which is a
// forbidden header name there); Node's fetch sends neither, so set both.
const REQUEST_HEADERS = {
  'User-Agent': 'mtgatricks/0.1',
  Accept: 'application/json',
} as const;

function apiFetch(url: string): Promise<Response> {
  return fetch(url, { headers: REQUEST_HEADERS });
}

/**
 * GET https://api.scryfall.com/sets — filtered to draftable set types,
 * newest first. See PLAN.md WP3.
 */
export async function fetchSets(): Promise<SetInfo[]> {
  const res = await apiFetch(`${API_BASE}/sets`);
  if (!res.ok) {
    throw new Error(`Scryfall /sets request failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { data: RawSet[] };

  const sets: SetInfo[] = body.data
    .filter((s) => KEEP_SET_TYPES.has(s.set_type) && s.card_count > 0)
    .map((s) => ({
      code: s.code,
      name: s.name,
      released_at: s.released_at ?? '',
      set_type: s.set_type,
      card_count: s.card_count,
      icon_svg_uri: s.icon_svg_uri,
    }));

  sets.sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? ''));

  return sets;
}

interface RawSet {
  code: string;
  name: string;
  released_at?: string;
  set_type: string;
  card_count: number;
  icon_svg_uri: string;
}

interface RawImageUris {
  normal?: string;
  small?: string;
  [key: string]: string | undefined;
}

interface RawCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  image_uris?: RawImageUris;
}

interface RawCard {
  id: string;
  name: string;
  set: string;
  collector_number: string;
  rarity: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  keywords?: string[];
  layout: string;
  card_faces?: RawCardFace[];
  image_uris?: RawImageUris;
  games?: string[];
  scryfall_uri: string;
}

interface RawSearchPage {
  object: 'list';
  data: RawCard[];
  has_more: boolean;
  next_page?: string;
}

interface RawError {
  object: 'error';
  status: number;
  code: string;
  details?: string;
}

function mapImageUris(raw: RawImageUris | undefined): { normal: string; small: string } | undefined {
  if (!raw || raw.normal === undefined || raw.small === undefined) {
    return undefined;
  }
  return { normal: raw.normal, small: raw.small };
}

function mapCardFace(raw: RawCardFace): CardFace {
  const face: CardFace = {
    name: raw.name,
    mana_cost: raw.mana_cost ?? '',
    type_line: raw.type_line ?? '',
    oracle_text: raw.oracle_text ?? '',
  };
  const image_uris = mapImageUris(raw.image_uris);
  if (image_uris) {
    face.image_uris = image_uris;
  }
  return face;
}

function mapCard(raw: RawCard): Card {
  const card: Card = {
    id: raw.id,
    name: raw.name,
    set: raw.set,
    collector_number: raw.collector_number,
    rarity: raw.rarity as Card['rarity'],
    cmc: raw.cmc,
    type_line: raw.type_line,
    keywords: raw.keywords ?? [],
    layout: raw.layout,
    games: raw.games ?? [],
    scryfall_uri: raw.scryfall_uri,
  };

  if (raw.mana_cost !== undefined) {
    card.mana_cost = raw.mana_cost;
  }

  if (raw.card_faces) {
    card.card_faces = raw.card_faces.map(mapCardFace);
  }

  const image_uris = mapImageUris(raw.image_uris);
  if (image_uris) {
    card.image_uris = image_uris;
  }

  return card;
}

function buildSearchUrl(query: string): string {
  const url = new URL(`${API_BASE}/cards/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('unique', 'cards');
  return url.toString();
}

/**
 * Fetches one search-results page, retrying once (after a 1s backoff) on a
 * 429. Returns null if Scryfall responds with a 404 "no cards found" error
 * object (an empty/nonexistent set), so the caller can treat it as no cards.
 */
async function fetchSearchPage(url: string): Promise<RawSearchPage | null> {
  let res = await apiFetch(url);

  if (res.status === 429) {
    await sleep(RATE_LIMIT_BACKOFF_MS);
    res = await apiFetch(url);
  }

  if (res.status === 404) {
    const body = (await res.json().catch(() => null)) as RawError | null;
    if (body && body.object === 'error') {
      return null;
    }
  }

  if (!res.ok) {
    throw new Error(`Scryfall /cards/search request failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as RawSearchPage;
}

/**
 * Runs a Scryfall search query to completion, following pagination (with the
 * etiquette delay/429-retry from fetchSearchPage), mapped to the pinned Card
 * type. Shared by fetchSetCards and fetchStandardCards. See PLAN.md WP3.
 */
async function fetchAllCards(query: string): Promise<Card[]> {
  const cards: Card[] = [];
  let url: string | null = buildSearchUrl(query);
  let isFirstPage = true;

  while (url) {
    if (!isFirstPage) {
      await sleep(PAGE_DELAY_MS);
    }
    isFirstPage = false;

    const page = await fetchSearchPage(url);
    if (page === null) {
      break;
    }

    for (const raw of page.data) {
      cards.push(mapCard(raw));
    }

    url = page.has_more && page.next_page ? page.next_page : null;
  }

  return cards;
}

/** GET /cards/search?q=set:{code}&unique=cards — every card in a set. */
export async function fetchSetCards(code: string): Promise<Card[]> {
  return fetchAllCards(`set:${code}`);
}

/**
 * GET /cards/search?q=legal:standard (t:instant or keyword:flash)&unique=cards.
 * Standard's full legal pool (~4,900 cards) is an order of magnitude bigger
 * than any single set, so — unlike fetchSetCards, which fetches a whole set
 * and lets packages/core filter client-side — this pre-filters to
 * instant-speed cards in the query itself (Scryfall's own search syntax),
 * shrinking the fetch to ~700 cards. The app never displays anything but
 * instant-speed cards, so nothing is lost by filtering server-side here.
 */
export async function fetchStandardCards(): Promise<Card[]> {
  return fetchAllCards('legal:standard (t:instant or keyword:flash)');
}
