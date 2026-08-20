// Preload bridge — the pinned contract between desktop main and the web UI.
// Compiled to dist/preload.mjs (ESM preload; renderer runs unsandboxed but
// with contextIsolation on and nodeIntegration off).
import { contextBridge, ipcRenderer } from 'electron';
import { CHANNEL_OPEN_MANA, CHANNEL_STATUS } from './ipc.js';

function subscribe(channel: string) {
  return (cb: (payload: unknown) => void): (() => void) => {
    const listener = (_event: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  };
}

// Shape must match core's ArenaBridge (payloads: OpenMana / ArenaStatus).
contextBridge.exposeInMainWorld('mtgatricks', {
  onOpenMana: subscribe(CHANNEL_OPEN_MANA),
  onStatus: subscribe(CHANNEL_STATUS),
});
