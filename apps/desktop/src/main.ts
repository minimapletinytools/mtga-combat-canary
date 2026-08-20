import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ArenaStatus, OpenMana } from '@mtgatricks/core';
import { ArenaTracker } from '@mtgatricks/arena';
import { CHANNEL_OPEN_MANA, CHANNEL_STATUS, CHANNEL_UNRESOLVED_COUNT } from './ipc.js';
import { loadArenaIdMap } from './arenaIds.js';
import { resolvePlayerLogPath } from './logPath.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Latest known state, kept so a renderer that reloads (or a newly created
// window) can recover it instead of waiting for the next tracker event.
let latestMana: OpenMana | null = null;
let latestStatus: ArenaStatus | null = null;
let latestUnresolvedCount: number | null = null;

let tracker: ArenaTracker | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 1000,
    webPreferences: {
      preload: path.join(here, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // ESM preload requires an unsandboxed renderer
    },
  });

  const devUrl = process.env['MTGATRICKS_DEV_URL'];
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(here, '../../web/dist/index.html'));
  }

  // Reloads (or a fresh window) miss whatever events already fired — replay
  // the latest known state so the UI recovers without waiting on the tracker.
  win.webContents.on('did-finish-load', () => {
    if (latestMana !== null) {
      win.webContents.send(CHANNEL_OPEN_MANA, latestMana);
    }
    if (latestStatus !== null) {
      win.webContents.send(CHANNEL_STATUS, latestStatus);
    }
    if (latestUnresolvedCount !== null) {
      win.webContents.send(CHANNEL_UNRESOLVED_COUNT, latestUnresolvedCount);
    }
  });

  return win;
}

function broadcastOpenMana(mana: OpenMana): void {
  latestMana = mana;
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(CHANNEL_OPEN_MANA, mana);
  }
}

function broadcastStatus(status: ArenaStatus): void {
  latestStatus = status;
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(CHANNEL_STATUS, status);
  }
}

function broadcastUnresolvedCount(count: number): void {
  latestUnresolvedCount = count;
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(CHANNEL_UNRESOLVED_COUNT, count);
  }
}

/**
 * Wires up the arena-id map + ArenaTracker. Both are implemented in parallel
 * (WP6/WP7) and their current stubs throw — that, and any future parse
 * failure, must never take the app down. Any failure here degrades to a
 * 'parse-error' status broadcast and the UI's manual-entry fallback; it is
 * not a "only during parallel dev" safeguard, it's permanent.
 */
async function setupTracker(): Promise<void> {
  const logPath = resolvePlayerLogPath();
  if (logPath === null) {
    broadcastStatus('no-log');
    return;
  }

  try {
    const map = await loadArenaIdMap(path.join(app.getPath('userData'), 'cache'));

    const newTracker = new ArenaTracker({
      logPath,
      producedMana: (grpId) => map.get(grpId),
      track: 'opponent',
    });
    tracker = newTracker;

    newTracker.onOpenMana((mana) => broadcastOpenMana(mana));
    newTracker.onStatus((status) => broadcastStatus(status));
    newTracker.onUnresolvedCount((count) => broadcastUnresolvedCount(count));
    newTracker.start();
  } catch (err) {
    console.error('[mtgatricks] failed to start arena tracker:', err);
    tracker = null;
    broadcastStatus('parse-error');
  }
}

app.whenReady().then(() => {
  createWindow();
  void setupTracker();
});

app.on('window-all-closed', () => {
  try {
    tracker?.stop();
  } catch (err) {
    console.error('[mtgatricks] error stopping arena tracker:', err);
  } finally {
    tracker = null;
  }
  app.quit();
});
