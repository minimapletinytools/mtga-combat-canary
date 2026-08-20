import type { OpenMana, OpenManaProvider } from '@mtgatricks/core';

/**
 * Phase-1 implementation of the `OpenManaProvider` seam: the UI (ManaInput)
 * pushes mana updates in via `set()`, and everything downstream (the trick
 * pipeline in App.tsx) reads them via `subscribe()`. Phase 2 adds a
 * `WebSocketManaProvider` with the same interface, fed by the MTGA log
 * tailer, without the rest of the app needing to change.
 */
export class ManualManaProvider implements OpenManaProvider {
  private mana: OpenMana = { sources: [] };
  private subscribers = new Set<(mana: OpenMana | null) => void>();

  subscribe(cb: (mana: OpenMana | null) => void): () => void {
    this.subscribers.add(cb);
    cb(this.mana);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /** Called by the UI (ManaInput) whenever the open-mana steppers change. */
  set(mana: OpenMana): void {
    this.mana = mana;
    for (const cb of this.subscribers) cb(mana);
  }

  getMana(): OpenMana {
    return this.mana;
  }
}
