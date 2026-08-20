import type { Color } from '@mtgatricks/core';

/** One permanent on the battlefield, as tracked from the log. */
export interface BattlefieldPermanent {
  instanceId: number;
  grpId: number;
  controllerSeatId: number;
  tapped: boolean;
  /** From gameObject.cardTypes — lets derive.ts tell "a land whose colors we
   * couldn't resolve" apart from "a nonland permanent that legitimately
   * produces no mana" (e.g. a vanilla creature). */
  isLand: boolean;
}

export interface TrackerState {
  /** Seat id of the local player (from GRE systemSeatIds), or null if unknown. */
  localSeatId: number | null;
  /** All battlefield permanents, every controller. */
  battlefield: BattlefieldPermanent[];
}

/** grpId → producible mana colors; undefined when the grpId is unknown. */
export type ProducedManaLookup = (grpId: number) => ReadonlyArray<Color | 'C'> | undefined;

/** Minimal shape of a GRE message inside greToClientMessages. */
export interface GreMessage {
  type: string;
  systemSeatIds?: number[];
  gameStateMessage?: unknown;
  [key: string]: unknown;
}

export interface GreEvent {
  greToClientMessages: GreMessage[];
}

export interface ArenaTrackerOptions {
  logPath: string;
  producedMana: ProducedManaLookup;
  /** Whose open mana to derive. Default: 'opponent'. */
  track?: 'opponent' | 'local';
  /** Log poll interval. Default: 500ms. */
  pollIntervalMs?: number;
}
