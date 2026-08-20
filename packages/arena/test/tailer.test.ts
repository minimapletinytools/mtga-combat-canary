import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LogTailer } from '../src/tailer.js';
import { delay, waitFor } from './helpers.js';

const POLL = 10;

describe('LogTailer', () => {
  let dir: string;
  let logPath: string;
  let chunks: string[];
  let truncates: number;
  let errors: Error[];
  let tailer: LogTailer | null;

  const makeTailer = (p = logPath): LogTailer =>
    new LogTailer(
      p,
      {
        onChunk: (text) => chunks.push(text),
        onTruncate: () => {
          truncates += 1;
        },
        onError: (err) => errors.push(err),
      },
      POLL,
    );

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-tailer-'));
    logPath = path.join(dir, 'Player.log');
    chunks = [];
    truncates = 0;
    errors = [];
    tailer = null;
  });

  afterEach(() => {
    tailer?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('emits existing content on start, then appended text', async () => {
    fs.writeFileSync(logPath, 'first\n');
    tailer = makeTailer();
    tailer.start();
    await waitFor(() => chunks.join('') === 'first\n', 2000, 'initial content');

    fs.appendFileSync(logPath, 'second\n');
    await waitFor(() => chunks.join('') === 'first\nsecond\n', 2000, 'appended content');

    fs.appendFileSync(logPath, 'third\n');
    await waitFor(() => chunks.join('') === 'first\nsecond\nthird\n', 2000, 'more content');
    expect(truncates).toBe(0);
    expect(errors).toEqual([]);
  });

  it('does not re-emit unchanged content', async () => {
    fs.writeFileSync(logPath, 'stable\n');
    tailer = makeTailer();
    tailer.start();
    await waitFor(() => chunks.length === 1);
    await delay(POLL * 6);
    expect(chunks).toEqual(['stable\n']);
  });

  it('detects truncation and resumes from byte zero', async () => {
    fs.writeFileSync(logPath, 'aaaaaaaaaaaaaaaaaaaa\n');
    tailer = makeTailer();
    tailer.start();
    await waitFor(() => chunks.length === 1, 2000, 'initial read');

    fs.writeFileSync(logPath, 'b\n'); // shorter file = Arena wiped the log
    await waitFor(() => truncates === 1, 2000, 'truncate');
    await waitFor(() => chunks[chunks.length - 1] === 'b\n', 2000, 'post-truncate content');

    fs.appendFileSync(logPath, 'c\n');
    await waitFor(() => chunks[chunks.length - 1] === 'c\n', 2000, 'post-truncate append');
    expect(truncates).toBe(1);
  });

  it('reports a missing file once, not on every poll', async () => {
    tailer = makeTailer(path.join(dir, 'nope.log'));
    tailer.start();
    await waitFor(() => errors.length === 1, 2000, 'first error');
    await delay(POLL * 8);
    expect(errors).toHaveLength(1);
    expect((errors[0] as NodeJS.ErrnoException).code).toBe('ENOENT');
  });

  it('picks the file up when it appears, and re-reports if it vanishes again', async () => {
    tailer = makeTailer();
    tailer.start();
    await waitFor(() => errors.length === 1, 2000, 'missing error');

    fs.writeFileSync(logPath, 'hello\n');
    await waitFor(() => chunks.join('') === 'hello\n', 2000, 'file appeared');
    expect(errors).toHaveLength(1);

    fs.rmSync(logPath);
    await waitFor(() => errors.length === 2, 2000, 'second missing error');
  });

  it('handles UTF-8 sequences split across reads', async () => {
    const text = 'héllo — ✨\n';
    const bytes = Buffer.from(text, 'utf8');
    // Cut in the middle of the two-byte 'é' so the decoder must hold the tail.
    fs.writeFileSync(logPath, bytes.subarray(0, 2));
    tailer = makeTailer();
    tailer.start();
    await waitFor(() => chunks.length >= 1, 2000, 'partial write');
    expect(chunks.join('')).toBe('h');
    fs.appendFileSync(logPath, bytes.subarray(2));
    await waitFor(() => chunks.join('') === text, 2000, 'complete text');
  });

  it('stops polling after stop()', async () => {
    fs.writeFileSync(logPath, 'a\n');
    tailer = makeTailer();
    tailer.start();
    await waitFor(() => chunks.length === 1);
    tailer.stop();
    fs.appendFileSync(logPath, 'b\n');
    await delay(POLL * 8);
    expect(chunks).toEqual(['a\n']);
  });

  it('start() is idempotent', async () => {
    fs.writeFileSync(logPath, 'a\n');
    tailer = makeTailer();
    tailer.start();
    tailer.start();
    await waitFor(() => chunks.length === 1);
    await delay(POLL * 4);
    expect(chunks).toEqual(['a\n']);
  });

  it('keeps polling when a consumer callback throws', async () => {
    fs.writeFileSync(logPath, 'a\n');
    let seen = 0;
    tailer = new LogTailer(
      logPath,
      {
        onChunk: () => {
          seen += 1;
          throw new Error('consumer blew up');
        },
        onTruncate: () => {},
        onError: () => {},
      },
      POLL,
    );
    expect(() => (tailer as LogTailer).start()).not.toThrow();
    fs.appendFileSync(logPath, 'b\n');
    await waitFor(() => seen >= 2, 2000, 'second chunk despite throwing consumer');
  });

  it('reports a directory as an error rather than crashing', async () => {
    tailer = makeTailer(dir);
    tailer.start();
    await waitFor(() => errors.length === 1, 2000, 'directory error');
    expect(errors[0]?.message).toContain('Not a file');
  });
});
