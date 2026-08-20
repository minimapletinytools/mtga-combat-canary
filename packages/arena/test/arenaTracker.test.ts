import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ArenaStatus, Color, OpenMana } from '@mtgatricks/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ArenaTracker } from '../src/arenaTracker.js';
import { delay, fixtureLines, fixtureLookup, waitFor } from './helpers.js';

const POLL = 10;

describe('ArenaTracker end-to-end', () => {
  let dir: string;
  let logPath: string;
  let tracker: ArenaTracker | null;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-e2e-'));
    logPath = path.join(dir, 'Player.log');
    tracker = null;
  });

  afterEach(() => {
    tracker?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  interface Harness {
    tracker: ArenaTracker;
    mana: OpenMana[];
    statuses: ArenaStatus[];
  }

  const harness = (
    options: {
      track?: 'opponent' | 'local';
      lookup?: (grpId: number) => ReadonlyArray<Color | 'C'> | undefined;
    } = {},
  ): Harness => {
    const mana: OpenMana[] = [];
    const statuses: ArenaStatus[] = [];
    const instance = new ArenaTracker({
      logPath,
      producedMana: options.lookup ?? fixtureLookup,
      track: options.track ?? 'opponent',
      pollIntervalMs: POLL,
    });
    tracker = instance;
    instance.onOpenMana((m) => mana.push(m));
    instance.onStatus((s) => statuses.push(s));
    return { tracker: instance, mana, statuses };
  };

  /** Writes the fixture into the log in `parts` appends, like Arena would. */
  const streamFixture = async (parts: number): Promise<void> => {
    const lines = fixtureLines();
    const per = Math.ceil(lines.length / parts);
    for (let i = 0; i < lines.length; i += per) {
      fs.appendFileSync(logPath, `${lines.slice(i, i + per).join('\n')}\n`);
      await delay(POLL * 3);
    }
  };

  it('streams a whole match and reports the opponent open mana', async () => {
    fs.writeFileSync(logPath, '');
    const h = harness();
    h.tracker.start();
    expect(h.statuses[h.statuses.length - 1]).toBe('log-stale');

    await streamFixture(8);
    await waitFor(() => h.statuses.includes('tracking'), 3000, 'tracking status');

    // Opponent (seat 1) ends the match with one untapped Mountain.
    await waitFor(
      () => JSON.stringify(h.mana[h.mana.length - 1]) === JSON.stringify({ sources: [{ produces: ['R'] }] }),
      3000,
      'final opponent mana',
    );
    expect(h.statuses).toEqual(['no-log', 'log-stale', 'tracking']);
    // The opponent's pool changes many times over a match, but never repeats
    // back to back — emissions are deduped.
    expect(h.mana.length).toBeGreaterThan(3);
    for (let i = 1; i < h.mana.length; i++) {
      expect(JSON.stringify(h.mana[i])).not.toBe(JSON.stringify(h.mana[i - 1]));
    }
  });

  it('tracks the local player when asked', async () => {
    fs.writeFileSync(logPath, `${fixtureLines().join('\n')}\n`);
    const h = harness({ track: 'local' });
    h.tracker.start();
    await waitFor(() => h.mana.length > 0, 3000, 'local mana');
    expect(h.mana[h.mana.length - 1]).toEqual({
      sources: [
        { produces: ['G'] },
        { produces: ['R'] },
        { produces: ['G'] },
        { produces: ['G'] },
        { produces: ['B'] },
      ],
    });
  });

  it('reports no-log while the file is absent, then recovers', async () => {
    const h = harness();
    h.tracker.start();
    await waitFor(() => h.statuses[h.statuses.length - 1] === 'no-log', 2000, 'no-log');

    fs.writeFileSync(logPath, `${fixtureLines().join('\n')}\n`);
    await waitFor(() => h.statuses[h.statuses.length - 1] === 'tracking', 3000, 'recovery');
    expect(h.mana[h.mana.length - 1]).toEqual({ sources: [{ produces: ['R'] }] });
  });

  it('resets on truncation (Arena wipes the log at launch)', async () => {
    fs.writeFileSync(logPath, `${fixtureLines().join('\n')}\n`);
    const h = harness();
    h.tracker.start();
    await waitFor(() => h.statuses.includes('tracking'), 3000, 'tracking');
    const beforeCount = h.mana.length;

    fs.writeFileSync(logPath, 'Initialize engine version: 2022.3.62f2\n');
    await waitFor(() => h.statuses[h.statuses.length - 1] === 'log-stale', 3000, 'reset to stale');

    // Replaying the match again re-derives the same final pool.
    fs.appendFileSync(logPath, `${fixtureLines().join('\n')}\n`);
    await waitFor(() => h.mana.length > beforeCount, 3000, 'mana after replay');
    await waitFor(
      () => h.statuses[h.statuses.length - 1] === 'tracking',
      3000,
      'tracking again',
    );
    expect(h.mana[h.mana.length - 1]).toEqual({ sources: [{ produces: ['R'] }] });
  });

  it('reports parse-error and keeps running when the lookup throws', async () => {
    fs.writeFileSync(logPath, '');
    let explode = true;
    const h = harness({
      lookup: (grpId) => {
        if (explode) throw new Error('bulk data not loaded');
        return fixtureLookup(grpId);
      },
    });
    h.tracker.start();

    const lines = fixtureLines();
    fs.appendFileSync(logPath, `${lines.slice(0, 60).join('\n')}\n`);
    await waitFor(() => h.statuses.includes('parse-error'), 3000, 'parse-error');

    explode = false;
    fs.appendFileSync(logPath, `${lines.slice(60).join('\n')}\n`);
    await waitFor(() => h.statuses[h.statuses.length - 1] === 'tracking', 3000, 'recovered');
    expect(h.mana[h.mana.length - 1]).toEqual({ sources: [{ produces: ['R'] }] });
  });

  it('never lets a throwing consumer callback escape', async () => {
    fs.writeFileSync(logPath, '');
    const seen: OpenMana[] = [];
    const instance = new ArenaTracker({
      logPath,
      producedMana: fixtureLookup,
      pollIntervalMs: POLL,
    });
    tracker = instance;
    instance.onOpenMana(() => {
      throw new Error('renderer exploded');
    });
    instance.onStatus(() => {
      throw new Error('status listener exploded');
    });
    instance.onOpenMana((m) => seen.push(m));

    expect(() => instance.start()).not.toThrow();
    fs.appendFileSync(logPath, `${fixtureLines().join('\n')}\n`);
    await waitFor(() => seen.length > 0, 3000, 'second listener still fed');
  });

  it('replays the current value to late subscribers and honours unsubscribe', async () => {
    fs.writeFileSync(logPath, `${fixtureLines().join('\n')}\n`);
    const h = harness();
    h.tracker.start();
    await waitFor(() => h.mana.length > 0, 3000, 'first mana');

    const late: OpenMana[] = [];
    const lateStatuses: ArenaStatus[] = [];
    const off = h.tracker.onOpenMana((m) => late.push(m));
    const offStatus = h.tracker.onStatus((s) => lateStatuses.push(s));
    expect(late).toEqual([h.mana[h.mana.length - 1]]);
    expect(lateStatuses).toEqual(['tracking']);

    off();
    offStatus();
    off(); // idempotent
    fs.appendFileSync(logPath, `${fixtureLines().join('\n')}\n`);
    await delay(POLL * 6);
    expect(late).toHaveLength(1);
  });

  it('stop() halts updates and start() is idempotent', async () => {
    fs.writeFileSync(logPath, '');
    const h = harness();
    h.tracker.start();
    h.tracker.start();
    fs.appendFileSync(logPath, `${fixtureLines().slice(0, 60).join('\n')}\n`);
    await waitFor(() => h.mana.length > 0, 3000, 'initial mana');
    const count = h.mana.length;

    h.tracker.stop();
    fs.appendFileSync(logPath, `${fixtureLines().slice(60).join('\n')}\n`);
    await delay(POLL * 8);
    expect(h.mana).toHaveLength(count);
  });

  it('ignores non-GRE noise interleaved with the log', async () => {
    const noisy = fixtureLines()
      .map((line, i) => (i % 3 === 0 ? `Metal devices available: 1\n${line}` : line))
      .join('\n');
    fs.writeFileSync(logPath, `${noisy}\n`);
    const h = harness();
    h.tracker.start();
    await waitFor(() => h.mana.length > 0, 3000, 'mana despite noise');
    expect(h.mana[h.mana.length - 1]).toEqual({ sources: [{ produces: ['R'] }] });
  });
});
