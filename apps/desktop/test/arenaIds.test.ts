import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { loadArenaIdMap } from '../src/arenaIds';

const BULK_DATA_URL = 'https://api.scryfall.com/bulk-data';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function bulkDataListResponse(downloadUri: string): Response {
  return jsonResponse({
    object: 'list',
    data: [
      { object: 'bulk_data', type: 'oracle_cards', download_uri: 'https://data.scryfall.io/oracle-cards.json' },
      { object: 'bulk_data', type: 'default_cards', download_uri: downloadUri },
    ],
  });
}

/** Current Scryfall shape (2026 JSONL migration): jsonl_download_uri only. */
function bulkDataListResponseJsonlOnly(jsonlUri: string): Response {
  return jsonResponse({
    object: 'list',
    data: [
      { object: 'bulk_data', type: 'oracle_cards', jsonl_download_uri: 'https://data.scryfall.io/oracle-cards.jsonl.gz' },
      { object: 'bulk_data', type: 'default_cards', jsonl_download_uri: jsonlUri },
    ],
  });
}

interface FakeCard {
  arena_id?: number;
  name: string;
  produced_mana?: string[];
}

const SAMPLE_CARDS: FakeCard[] = [
  { arena_id: 70382, name: 'Forest', produced_mana: ['G'] },
  { arena_id: 70383, name: 'Island', produced_mana: ['U'] },
  { arena_id: 12345, name: 'Some Nonland Card' }, // no produced_mana -> dropped
  { name: 'No Arena Id Card', produced_mana: ['R'] }, // no arena_id -> dropped
  { arena_id: 99999, name: 'Empty Produced Mana', produced_mana: [] }, // empty -> dropped
  { arena_id: 88888, name: 'Bogus Mana Letters', produced_mana: ['W', 'X', 'Q', 'C'] }, // sanitize
];

function gzipJsonlResponse(cards: FakeCard[]): Response {
  const jsonl = cards.map((c) => JSON.stringify(c)).join('\n') + '\n';
  const gz = gzipSync(Buffer.from(jsonl, 'utf8'));
  return new Response(gz, {
    status: 200,
    headers: { 'content-type': 'application/octet-stream' },
  });
}

function plainArrayResponse(cards: FakeCard[]): Response {
  return jsonResponse(cards);
}

function requestedUrl(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): string {
  return String(fetchMock.mock.calls[callIndex]?.[0]);
}

function requestedHeaders(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): Headers {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

describe('loadArenaIdMap', () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), 'arena-ids-test-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('discovers the default_cards bulk file and parses a plain JSON array payload', async () => {
    const downloadUri = 'https://data.scryfall.io/default-cards/default-cards.json';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(bulkDataListResponse(downloadUri))
      .mockResolvedValueOnce(plainArrayResponse(SAMPLE_CARDS));

    const map = await loadArenaIdMap(cacheDir, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(requestedUrl(fetchImpl, 0)).toBe(BULK_DATA_URL);
    expect(requestedUrl(fetchImpl, 1)).toBe(downloadUri);

    expect(map.size).toBe(3);
    expect(map.get(70382)).toEqual(['G']);
    expect(map.get(70383)).toEqual(['U']);
    expect(map.get(88888)).toEqual(['W', 'C']);
  });

  it('sends User-Agent and Accept headers on every Scryfall request', async () => {
    const downloadUri = 'https://data.scryfall.io/default-cards/default-cards.json';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(bulkDataListResponse(downloadUri))
      .mockResolvedValueOnce(plainArrayResponse(SAMPLE_CARDS));

    await loadArenaIdMap(cacheDir, { fetchImpl });

    for (const callIndex of [0, 1]) {
      const headers = requestedHeaders(fetchImpl, callIndex);
      expect(headers.get('User-Agent')).toBe('mtgatricks/0.1');
      expect(headers.get('Accept')).toBe('application/json');
    }
  });

  it('discovers the default_cards bulk file and streams a gzipped JSONL payload', async () => {
    const downloadUri = 'https://data.scryfall.io/default-cards/default-cards.jsonl.gz';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(bulkDataListResponse(downloadUri))
      .mockResolvedValueOnce(gzipJsonlResponse(SAMPLE_CARDS));

    const map = await loadArenaIdMap(cacheDir, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(map.size).toBe(3);
    expect(map.get(70382)).toEqual(['G']);
    expect(map.get(70383)).toEqual(['U']);
    expect(map.get(88888)).toEqual(['W', 'C']);
  });

  it('prefers jsonl_download_uri when download_uri is absent (current Scryfall shape)', async () => {
    const jsonlUri = 'https://data.scryfall.io/default-cards/default-cards-20260819.jsonl.gz';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(bulkDataListResponseJsonlOnly(jsonlUri))
      .mockResolvedValueOnce(gzipJsonlResponse(SAMPLE_CARDS));

    const map = await loadArenaIdMap(cacheDir, { fetchImpl });

    expect(requestedUrl(fetchImpl, 1)).toBe(jsonlUri);
    expect(map.size).toBe(3);
    expect(map.get(70382)).toEqual(['G']);
  });

  it('drops entries without arena_id or with empty produced_mana, and sanitizes bogus mana letters', async () => {
    const downloadUri = 'https://data.scryfall.io/default-cards/default-cards.json';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(bulkDataListResponse(downloadUri))
      .mockResolvedValueOnce(plainArrayResponse(SAMPLE_CARDS));

    const map = await loadArenaIdMap(cacheDir, { fetchImpl });

    expect(map.get(12345)).toBeUndefined();
    expect(map.get(99999)).toBeUndefined();
    expect(map.get(88888)).toEqual(['W', 'C']);
  });

  it('writes a cache file after fetching and reuses it on the next call (zero further fetches)', async () => {
    const downloadUri = 'https://data.scryfall.io/default-cards/default-cards.json';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(bulkDataListResponse(downloadUri))
      .mockResolvedValueOnce(plainArrayResponse(SAMPLE_CARDS));

    const first = await loadArenaIdMap(cacheDir, { fetchImpl });
    expect(first.size).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const cacheRaw = await readFile(path.join(cacheDir, 'arena-ids.json'), 'utf8');
    const cacheParsed = JSON.parse(cacheRaw) as { version: number; ids: Record<string, string[]> };
    expect(cacheParsed.version).toBe(1);
    expect(cacheParsed.ids['70382']).toEqual(['G']);

    const second = await loadArenaIdMap(cacheDir, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2); // no additional fetches
    expect(second.size).toBe(3);
    expect(second.get(70382)).toEqual(['G']);
  });

  it('creates cacheDir recursively if it does not exist yet', async () => {
    const nestedDir = path.join(cacheDir, 'nested', 'deeper');
    const downloadUri = 'https://data.scryfall.io/default-cards/default-cards.json';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(bulkDataListResponse(downloadUri))
      .mockResolvedValueOnce(plainArrayResponse(SAMPLE_CARDS));

    const map = await loadArenaIdMap(nestedDir, { fetchImpl });
    expect(map.size).toBe(3);

    const cacheRaw = await readFile(path.join(nestedDir, 'arena-ids.json'), 'utf8');
    expect(JSON.parse(cacheRaw)).toHaveProperty('version', 1);
  });

  it('forceRefresh re-fetches even when a valid cache file exists', async () => {
    const downloadUri = 'https://data.scryfall.io/default-cards/default-cards.json';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(bulkDataListResponse(downloadUri))
      .mockResolvedValueOnce(plainArrayResponse(SAMPLE_CARDS))
      .mockResolvedValueOnce(bulkDataListResponse(downloadUri))
      .mockResolvedValueOnce(plainArrayResponse([{ arena_id: 1, name: 'Different Card', produced_mana: ['B'] }]));

    const first = await loadArenaIdMap(cacheDir, { fetchImpl });
    expect(first.size).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const second = await loadArenaIdMap(cacheDir, { fetchImpl, forceRefresh: true });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(second.size).toBe(1);
    expect(second.get(1)).toEqual(['B']);
  });

  it('refetches when the cache file is corrupt/unparseable', async () => {
    await writeFile(path.join(cacheDir, 'arena-ids.json'), '{ not valid json ]]', 'utf8');

    const downloadUri = 'https://data.scryfall.io/default-cards/default-cards.json';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(bulkDataListResponse(downloadUri))
      .mockResolvedValueOnce(plainArrayResponse(SAMPLE_CARDS));

    const map = await loadArenaIdMap(cacheDir, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(map.size).toBe(3);
  });

  it('refetches when the cache file parses but has an unexpected shape', async () => {
    await writeFile(
      path.join(cacheDir, 'arena-ids.json'),
      JSON.stringify({ totallyWrong: true }),
      'utf8',
    );

    const downloadUri = 'https://data.scryfall.io/default-cards/default-cards.json';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(bulkDataListResponse(downloadUri))
      .mockResolvedValueOnce(plainArrayResponse(SAMPLE_CARDS));

    const map = await loadArenaIdMap(cacheDir, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(map.size).toBe(3);
  });

  it('throws a clear error when the bulk-data request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('nope', { status: 500 }));

    await expect(loadArenaIdMap(cacheDir, { fetchImpl })).rejects.toThrow(/bulk data|bulk-data/i);
  });

  it('throws a clear error when no default_cards entry is found', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        object: 'list',
        data: [{ object: 'bulk_data', type: 'oracle_cards', download_uri: 'https://data.scryfall.io/oracle.json' }],
      }),
    );

    await expect(loadArenaIdMap(cacheDir, { fetchImpl })).rejects.toThrow();
  });
});
