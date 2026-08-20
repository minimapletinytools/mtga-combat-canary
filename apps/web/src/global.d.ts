import type { ArenaBridge } from '@mtgatricks/core';

/**
 * Phase-2 seam (WP9): the Electron desktop build's preload script exposes
 * this bridge on `window.mtgatricks`. In a plain browser it is simply
 * absent (`undefined`) — every read of `window.mtgatricks` in this app must
 * treat that as the normal, expected case, not an error.
 */
declare global {
  interface Window {
    mtgatricks?: ArenaBridge;
  }
}

export {};
