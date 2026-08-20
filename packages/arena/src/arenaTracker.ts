import * as fs from 'node:fs';
import type { ArenaStatus, OpenMana } from '@mtgatricks/core';
import { LineAssembler, extractGreEvent } from './chunker.js';
import { deriveOpenMana, subtypesToProducedMana } from './derive.js';
import { GameStateTracker } from './tracker.js';
import { LogTailer } from './tailer.js';
import type { ArenaTrackerOptions } from './types.js';

function sameMana(a: OpenMana, b: OpenMana): boolean {
  if (a.sources.length !== b.sources.length) return false;
  for (let i = 0; i < a.sources.length; i++) {
    const left = a.sources[i]?.produces ?? [];
    const right = b.sources[i]?.produces ?? [];
    if (left.length !== right.length) return false;
    for (let j = 0; j < left.length; j++) {
      if (left[j] !== right[j]) return false;
    }
  }
  return true;
}

/**
 * Composition root: LogTailer → LineAssembler → extractGreEvent →
 * GameStateTracker → deriveOpenMana, with status reporting. This is the only
 * class the Electron main process uses.
 *
 * Status semantics: 'no-log' when the file is absent; 'tracking' once GRE
 * events are being applied; 'log-stale' when the file exists but nothing new
 * arrives and no game state is known; 'parse-error' after an internal failure
 * (tracker must swallow the error and keep running — never throw).
 *
 * WP6 — see PLAN.md Phase 2.
 */
export class ArenaTracker {
  private readonly options: ArenaTrackerOptions;
  private readonly track: 'opponent' | 'local';
  private readonly tracker = new GameStateTracker();
  private assembler = new LineAssembler();
  private tailer: LogTailer | null = null;

  private status: ArenaStatus = 'no-log';
  private fileMissing = true;
  private parseError = false;
  private sawGameState = false;
  private lastMana: OpenMana | null = null;

  private readonly manaListeners = new Set<(mana: OpenMana) => void>();
  private readonly statusListeners = new Set<(status: ArenaStatus) => void>();

  constructor(options: ArenaTrackerOptions) {
    this.options = options;
    this.track = options.track ?? 'opponent';
  }

  start(): void {
    if (this.tailer !== null) return;
    this.fileMissing = !this.fileExists();
    this.updateStatus();
    this.tailer = new LogTailer(
      this.options.logPath,
      {
        onChunk: (text) => this.handleChunk(text),
        onTruncate: () => this.handleTruncate(),
        onError: (err) => this.handleError(err),
      },
      this.options.pollIntervalMs ?? 500,
    );
    this.tailer.start();
  }

  stop(): void {
    this.tailer?.stop();
    this.tailer = null;
  }

  /** Fires whenever the derived open mana for the tracked player changes. */
  onOpenMana(cb: (mana: OpenMana) => void): () => void {
    this.manaListeners.add(cb);
    // Late subscribers (e.g. a renderer that just connected) get the current value.
    if (this.lastMana !== null) this.safe(() => cb(this.lastMana as OpenMana));
    return () => {
      this.manaListeners.delete(cb);
    };
  }

  onStatus(cb: (status: ArenaStatus) => void): () => void {
    this.statusListeners.add(cb);
    this.safe(() => cb(this.status));
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private fileExists(): boolean {
    try {
      return fs.statSync(this.options.logPath).isFile();
    } catch {
      return false;
    }
  }

  private handleChunk(text: string): void {
    this.fileMissing = false;
    try {
      this.parseError = false;
      let changed = false;
      for (const line of this.assembler.feed(text)) {
        const event = extractGreEvent(line);
        if (event === null) continue;
        for (const message of event.greToClientMessages) {
          if (message.gameStateMessage !== undefined && message.gameStateMessage !== null) {
            this.sawGameState = true;
          }
        }
        if (this.tracker.applyEvent(event)) changed = true;
      }
      if (changed) this.emitMana();
    } catch {
      // Never let a log-format surprise take the app down.
      this.parseError = true;
    }
    this.updateStatus();
  }

  private handleTruncate(): void {
    // Arena empties Player.log on launch: everything we knew is gone.
    this.assembler = new LineAssembler();
    this.tracker.reset();
    this.sawGameState = false;
    this.lastMana = null;
    this.parseError = false;
    this.fileMissing = false;
    this.updateStatus();
  }

  private handleError(err: Error): void {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === undefined) {
      this.fileMissing = true;
      this.parseError = false;
    } else {
      this.parseError = true;
    }
    this.assembler = new LineAssembler();
    this.tracker.reset();
    this.sawGameState = false;
    this.lastMana = null;
    this.updateStatus();
  }

  /**
   * Composite lookup: the configured map first; when it has no answer (its
   * coverage lags new sets), fall back to land subtypes seen in the log.
   */
  private lookupProducedMana = (grpId: number) => {
    const fromMap = this.options.producedMana(grpId);
    if (fromMap !== undefined && fromMap.length > 0) return fromMap;
    const subtypes = this.tracker.lookupSubtypes(grpId);
    if (subtypes === undefined) return fromMap;
    const fromSubtypes = subtypesToProducedMana(subtypes);
    return fromSubtypes.length > 0 ? fromSubtypes : fromMap;
  };

  private emitMana(): void {
    const state = this.tracker.getState();
    // Summoning-sick creatures can't tap for mana — drop them before derivation.
    const battlefield = state.battlefield.filter(
      (p) => !this.tracker.isSummonSickCreature(p.instanceId),
    );
    const mana = deriveOpenMana({ ...state, battlefield }, this.lookupProducedMana, this.track);
    if (mana === null) return;
    if (this.lastMana !== null && sameMana(this.lastMana, mana)) return;
    this.lastMana = mana;
    for (const listener of [...this.manaListeners]) this.safe(() => listener(mana));
  }

  private updateStatus(): void {
    const next: ArenaStatus = this.parseError
      ? 'parse-error'
      : this.fileMissing
        ? 'no-log'
        : this.sawGameState
          ? 'tracking'
          : 'log-stale';
    if (next === this.status) return;
    this.status = next;
    for (const listener of [...this.statusListeners]) this.safe(() => listener(next));
  }

  /** Consumer callbacks must never propagate out of the tracker. */
  private safe(fn: () => void): void {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}
