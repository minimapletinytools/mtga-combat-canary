import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import type { Color } from '@mtgatricks/core';

/** Compact lookup: Arena grpId → producible mana colors. */
export interface ArenaIdMap {
  get(grpId: number): ReadonlyArray<Color | 'C'> | undefined;
  size: number;
}

export interface LoadArenaIdMapOptions {
  /** Re-download even if a cache file exists. */
  forceRefresh?: boolean;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

const CACHE_FILE_NAME = 'arena-ids.json';
const CACHE_VERSION = 1;
const BULK_DATA_URL = 'https://api.scryfall.com/bulk-data';

// Scryfall rejects requests missing User-Agent or Accept with a 400. Node's
// fetch sends neither by default, so set both explicitly (see
// packages/data/src/scryfall.ts REQUEST_HEADERS for precedent).
const REQUEST_HEADERS = {
  'User-Agent': 'mtgatricks/0.1',
  Accept: 'application/json',
} as const;

const VALID_MANA_LETTERS = new Set<string>(['W', 'U', 'B', 'R', 'G', 'C']);

type ManaLetter = Color | 'C';

interface CacheFileShape {
  version: number;
  ids: Record<string, string[]>;
}

interface BulkDataEntry {
  type?: unknown;
  download_uri?: unknown;
  jsonl_download_uri?: unknown;
}

interface BulkDataListResponse {
  data?: BulkDataEntry[];
}

/** The subset of a Scryfall bulk card object we care about. */
interface RawBulkCard {
  arena_id?: unknown;
  produced_mana?: unknown;
}

function cacheFilePath(cacheDir: string): string {
  return path.join(cacheDir, CACHE_FILE_NAME);
}

function sanitizeProducedMana(raw: unknown): ManaLetter[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ManaLetter[] = [];
  for (const value of raw) {
    if (typeof value === 'string' && VALID_MANA_LETTERS.has(value)) {
      out.push(value as ManaLetter);
    }
  }
  return out;
}

function isCacheFileShape(value: unknown): value is CacheFileShape {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { version?: unknown; ids?: unknown };
  return (
    candidate.version === CACHE_VERSION &&
    candidate.ids !== null &&
    typeof candidate.ids === 'object' &&
    !Array.isArray(candidate.ids)
  );
}

function buildArenaIdMap(ids: Record<string, ReadonlyArray<string>>): ArenaIdMap {
  const map = new Map<number, ReadonlyArray<ManaLetter>>();
  for (const [key, rawColors] of Object.entries(ids)) {
    const grpId = Number(key);
    if (!Number.isFinite(grpId)) {
      continue;
    }
    const colors = sanitizeProducedMana(rawColors);
    if (colors.length === 0) {
      continue;
    }
    map.set(grpId, colors);
  }
  return {
    get: (grpId: number) => map.get(grpId),
    size: map.size,
  };
}

async function readCache(cacheDir: string): Promise<CacheFileShape | null> {
  let raw: string;
  try {
    raw = await readFile(cacheFilePath(cacheDir), 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isCacheFileShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCache(cacheDir: string, ids: Record<string, ManaLetter[]>): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  const payload: CacheFileShape = { version: CACHE_VERSION, ids };
  await writeFile(cacheFilePath(cacheDir), JSON.stringify(payload), 'utf8');
}

async function discoverDefaultCardsUri(fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl(BULK_DATA_URL, { headers: REQUEST_HEADERS });
  if (!res.ok) {
    throw new Error(`Scryfall /bulk-data request failed: ${res.status} ${res.statusText}`);
  }

  let body: BulkDataListResponse;
  try {
    body = (await res.json()) as BulkDataListResponse;
  } catch (err) {
    throw new Error(`Scryfall /bulk-data response was not valid JSON: ${(err as Error).message}`);
  }

  const entry = body.data?.find((e) => e.type === 'default_cards');
  // Scryfall's 2026 JSONL migration renamed download_uri to jsonl_download_uri;
  // prefer the new field, keep the legacy one as a fallback.
  const uri = [entry?.jsonl_download_uri, entry?.download_uri].find(
    (u): u is string => typeof u === 'string' && u.length > 0,
  );
  if (!uri) {
    throw new Error('Scryfall /bulk-data response has no default_cards entry with a download URI');
  }

  return uri;
}

function addCard(card: RawBulkCard, ids: Record<string, ManaLetter[]>): void {
  const arenaId = card.arena_id;
  if (typeof arenaId !== 'number' || !Number.isFinite(arenaId)) {
    return;
  }
  const colors = sanitizeProducedMana(card.produced_mana);
  if (colors.length === 0) {
    return;
  }
  ids[String(arenaId)] = colors;
}

/**
 * Decompress a gzip byte stream and yield one parsed JSON object per
 * newline-delimited line, without ever materializing the full decompressed
 * text in memory.
 */
async function* iterateGzipJsonLines(compressed: Readable): AsyncGenerator<RawBulkCard> {
  const gunzip = createGunzip();
  const decompressed = compressed.pipe(gunzip);
  const rl = createInterface({ input: decompressed, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    yield JSON.parse(trimmed) as RawBulkCard;
  }
}

function looksGzipByUri(uri: string): boolean {
  return uri.toLowerCase().endsWith('.gz');
}

function looksGzipByHeaders(res: Response): boolean {
  const contentType = res.headers.get('content-type') ?? '';
  const contentEncoding = res.headers.get('content-encoding') ?? '';
  return contentType.includes('gzip') || contentEncoding.includes('gzip');
}

function looksGzipByMagicBytes(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

/**
 * Downloads and parses the Scryfall default_cards bulk file, returning the
 * filtered { arena_id -> produced_mana } map. Supports both a plain JSON
 * array payload and a gzipped JSONL (one JSON object per line) payload.
 */
async function fetchDefaultCardsIds(fetchImpl: typeof fetch): Promise<Record<string, ManaLetter[]>> {
  const downloadUri = await discoverDefaultCardsUri(fetchImpl);

  const res = await fetchImpl(downloadUri, { headers: REQUEST_HEADERS });
  if (!res.ok) {
    throw new Error(`Scryfall bulk data download failed: ${res.status} ${res.statusText}`);
  }

  const ids: Record<string, ManaLetter[]> = {};

  const preemptivelyGzip = looksGzipByUri(downloadUri) || looksGzipByHeaders(res);

  if (preemptivelyGzip) {
    // Stream straight from the response body through gunzip -> line split,
    // so we never hold the full decompressed payload (can be ~400MB) in
    // memory at once.
    if (!res.body) {
      throw new Error('Scryfall bulk data response had no body to stream');
    }
    const nodeStream = Readable.fromWeb(res.body as never);
    for await (const card of iterateGzipJsonLines(nodeStream)) {
      addCard(card, ids);
    }
    return ids;
  }

  // Not obviously gzip by URI/headers — buffer the raw bytes (this is the
  // compressed or plain-JSON size, not the decompressed size) and fall back
  // to a magic-byte check before deciding how to parse it.
  const buffer = Buffer.from(await res.arrayBuffer());

  if (looksGzipByMagicBytes(buffer)) {
    for await (const card of iterateGzipJsonLines(Readable.from(buffer))) {
      addCard(card, ids);
    }
    return ids;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString('utf8'));
  } catch (err) {
    throw new Error(`Scryfall bulk data payload was not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Scryfall bulk data payload was not a JSON array');
  }
  for (const card of parsed as RawBulkCard[]) {
    addCard(card, ids);
  }
  return ids;
}

/**
 * Load (or build) the grpId → produced-mana map: if `{cacheDir}/arena-ids.json`
 * exists use it; otherwise discover the Scryfall bulk "default_cards" file via
 * /bulk-data, stream-parse it, keep `{ arena_id, produced_mana }` for entries
 * with an arena_id and nonempty produced_mana, cache, and return.
 *
 * WP7 — see PLAN.md Phase 2.
 */
export async function loadArenaIdMap(
  cacheDir: string,
  options?: LoadArenaIdMapOptions,
): Promise<ArenaIdMap> {
  const forceRefresh = options?.forceRefresh ?? false;
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;

  if (!forceRefresh) {
    const cached = await readCache(cacheDir);
    if (cached) {
      return buildArenaIdMap(cached.ids);
    }
  }

  let ids: Record<string, ManaLetter[]>;
  try {
    ids = await fetchDefaultCardsIds(fetchImpl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to build arena-id map from Scryfall bulk data: ${message}`);
  }

  await writeCache(cacheDir, ids);

  return buildArenaIdMap(ids);
}
