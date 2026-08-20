import type { ArenaBridge, ArenaStatus, OpenMana, OpenManaProvider } from '@mtgatricks/core';

/**
 * Phase-2 implementation of the `OpenManaProvider` seam, backed by the
 * Electron preload's `window.mtgatricks` bridge (see global.d.ts). Wraps
 * `ArenaBridge.onOpenMana` so the rest of the app (the trick pipeline in
 * App.tsx) can consume it exactly like `ManualManaProvider` — same
 * `subscribe()` shape, no bridge-specific code downstream.
 *
 * Mana is `{ sources: [] }` until the bridge's first `onOpenMana` callback
 * fires, per WP9's "until the first onOpenMana arrives treat mana as empty".
 *
 * `ArenaStatus` isn't part of `OpenManaProvider`, so it's surfaced through a
 * second, parallel subscription (`subscribeStatus`) rather than overloading
 * the mana stream — keeps this a clean superset of the interface instead of
 * repurposing it.
 */
export class BridgeManaProvider implements OpenManaProvider {
  private mana: OpenMana = { sources: [] };
  private manaSubscribers = new Set<(mana: OpenMana | null) => void>();

  private status: ArenaStatus | null = null;
  private statusSubscribers = new Set<(status: ArenaStatus | null) => void>();

  private readonly unsubscribeMana: () => void;
  private readonly unsubscribeStatus: () => void;

  constructor(bridge: ArenaBridge) {
    this.unsubscribeMana = bridge.onOpenMana((mana) => {
      this.mana = mana;
      for (const cb of this.manaSubscribers) cb(mana);
    });
    this.unsubscribeStatus = bridge.onStatus((status) => {
      this.status = status;
      for (const cb of this.statusSubscribers) cb(status);
    });
  }

  subscribe(cb: (mana: OpenMana | null) => void): () => void {
    this.manaSubscribers.add(cb);
    cb(this.mana);
    return () => {
      this.manaSubscribers.delete(cb);
    };
  }

  /** Latest tracking status; null until the bridge's first onStatus fires. */
  subscribeStatus(cb: (status: ArenaStatus | null) => void): () => void {
    this.statusSubscribers.add(cb);
    cb(this.status);
    return () => {
      this.statusSubscribers.delete(cb);
    };
  }

  /** Detach from the underlying bridge. Not currently called (the provider
   * lives for the app's lifetime) but kept for correctness/testability. */
  destroy(): void {
    this.unsubscribeMana();
    this.unsubscribeStatus();
  }
}
