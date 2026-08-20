import type { BattlefieldPermanent, GreEvent, GreMessage, TrackerState } from './types.js';

const CONNECT_RESP = 'GREMessageType_ConnectResp';
const STATE_FULL = 'GameStateType_Full';
const ZONE_BATTLEFIELD = 'ZoneType_Battlefield';
const ANNOTATION_OBJECT_ID_CHANGED = 'AnnotationType_ObjectIdChanged';

interface TrackedObject {
  instanceId: number;
  grpId: number;
  controllerSeatId: number;
  zoneId: number;
  tapped: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Reads `details: [{ key, valueInt32: [n] }]` from an annotation. */
function annotationInt(annotation: Record<string, unknown>, key: string): number | null {
  const details = annotation['details'];
  if (!Array.isArray(details)) return null;
  for (const detail of details) {
    if (!isRecord(detail) || detail['key'] !== key) continue;
    const values = detail['valueInt32'];
    if (Array.isArray(values)) return num(values[0]);
  }
  return null;
}

/**
 * Maintains game state from a stream of GRE events: merges full/delta
 * GameStateMessages (gameObjects, zones, diffDeletedInstanceIds), tracks the
 * battlefield zone and per-object isTapped, and learns the local seat from
 * systemSeatIds. Resets on a new game/match.
 *
 * WP6 — see PLAN.md Phase 2.
 */
export class GameStateTracker {
  /** instanceId → object. GRE diffs restate a changed object in full. */
  private objects = new Map<number, TrackedObject>();
  /**
   * grpId → subtypes (SubType_* strings) as last seen for that card. Used as a
   * produced-mana fallback for land types when the Scryfall arena-id map lacks
   * a printing (its coverage lags new sets). Keyed by grpId, so it survives
   * instanceId churn; kept across games since grpId meanings are stable.
   */
  private grpSubtypes = new Map<number, string[]>();
  /** zoneId → zone type string, so battlefield zone ids are known. */
  private zoneTypes = new Map<number, string>();
  private battlefieldZoneIds = new Set<number>();
  private localSeatId: number | null = null;
  /** `${matchID}:${gameNumber}` — a change means a brand new game. */
  private gameKey: string | null = null;

  /** Current state snapshot (callers must not mutate). */
  getState(): TrackerState {
    return { localSeatId: this.localSeatId, battlefield: this.buildBattlefield() };
  }

  /** Subtypes last seen for a grpId (e.g. ['SubType_Mountain']), if any. */
  lookupSubtypes(grpId: number): readonly string[] | undefined {
    return this.grpSubtypes.get(grpId);
  }

  /** Apply one GRE event; returns true if the tracked state changed. */
  applyEvent(event: GreEvent): boolean {
    const before = this.signature();
    const messages = event?.greToClientMessages;
    if (Array.isArray(messages)) {
      for (const message of messages) {
        if (isRecord(message)) this.applyMessage(message as GreMessage);
      }
    }
    return this.signature() !== before;
  }

  reset(): void {
    this.resetGame();
    this.localSeatId = null;
  }

  /** Clears board state but keeps the learned local seat. */
  private resetGame(): void {
    this.objects.clear();
    this.zoneTypes.clear();
    this.battlefieldZoneIds.clear();
    this.gameKey = null;
  }

  private applyMessage(message: GreMessage): void {
    // A fresh connection means a fresh match: drop any stale board.
    if (message.type === CONNECT_RESP) this.resetGame();

    this.learnLocalSeat(message);

    const gsm = message.gameStateMessage;
    if (isRecord(gsm)) this.applyGameState(gsm);
  }

  /**
   * greToClientMessages carry the recipient seat(s). Messages addressed to a
   * single seat are addressed to the local player (verified across two real
   * matches: seat 2 in one log, seat 1 in the other; broadcasts use [1,2]).
   */
  private learnLocalSeat(message: GreMessage): void {
    const seats = message.systemSeatIds;
    if (!Array.isArray(seats) || seats.length !== 1) return;
    const seat = num(seats[0]);
    if (seat === null) return;
    if (message.type === CONNECT_RESP || this.localSeatId === null) this.localSeatId = seat;
  }

  private applyGameState(gsm: Record<string, unknown>): void {
    const gameInfo = gsm['gameInfo'];
    if (isRecord(gameInfo)) {
      const matchId = gameInfo['matchID'];
      const gameNumber = gameInfo['gameNumber'];
      const key = `${typeof matchId === 'string' ? matchId : '?'}:${num(gameNumber) ?? '?'}`;
      if (this.gameKey !== null && this.gameKey !== key) this.resetGame();
      this.gameKey = key;
    }

    // GameStateType_Full replaces state outright; Diff merges into it.
    if (gsm['type'] === STATE_FULL) {
      this.objects.clear();
      this.zoneTypes.clear();
      this.battlefieldZoneIds.clear();
    }

    const zones = gsm['zones'];
    if (Array.isArray(zones)) {
      for (const zone of zones) {
        if (!isRecord(zone)) continue;
        const zoneId = num(zone['zoneId']);
        const type = zone['type'];
        if (zoneId === null || typeof type !== 'string') continue;
        this.zoneTypes.set(zoneId, type);
        if (type === ZONE_BATTLEFIELD) this.battlefieldZoneIds.add(zoneId);
        else this.battlefieldZoneIds.delete(zoneId);
      }
    }

    // Instance ids churn (e.g. a card entering the battlefield gets a new id);
    // AnnotationType_ObjectIdChanged carries orig_id → new_id.
    const annotations = gsm['annotations'];
    if (Array.isArray(annotations)) {
      for (const annotation of annotations) {
        if (!isRecord(annotation)) continue;
        const types = annotation['type'];
        if (!Array.isArray(types) || !types.includes(ANNOTATION_OBJECT_ID_CHANGED)) continue;
        const origId = annotationInt(annotation, 'orig_id');
        const newId = annotationInt(annotation, 'new_id');
        if (origId === null || newId === null || origId === newId) continue;
        this.renameObject(origId, newId);
      }
    }

    const gameObjects = gsm['gameObjects'];
    if (Array.isArray(gameObjects)) {
      for (const gameObject of gameObjects) {
        if (!isRecord(gameObject)) continue;
        const instanceId = num(gameObject['instanceId']);
        if (instanceId === null) continue;
        const grpId = num(gameObject['grpId']) ?? 0;
        const subtypes = gameObject['subtypes'];
        if (grpId !== 0 && Array.isArray(subtypes) && subtypes.length > 0) {
          this.grpSubtypes.set(
            grpId,
            subtypes.filter((s): s is string => typeof s === 'string'),
          );
        }
        this.objects.set(instanceId, {
          instanceId,
          grpId,
          controllerSeatId:
            num(gameObject['controllerSeatId']) ?? num(gameObject['ownerSeatId']) ?? 0,
          zoneId: num(gameObject['zoneId']) ?? -1,
          // isTapped is present only when the permanent is tapped.
          tapped: gameObject['isTapped'] === true,
        });
      }
    }

    // Must purge, or destroyed permanents linger as phantoms forever.
    const deleted = gsm['diffDeletedInstanceIds'];
    if (Array.isArray(deleted)) {
      for (const id of deleted) {
        const instanceId = num(id);
        if (instanceId !== null) this.objects.delete(instanceId);
      }
    }
  }

  private renameObject(origId: number, newId: number): void {
    const existing = this.objects.get(origId);
    if (existing === undefined) return;
    // If the new id already arrived as its own gameObject, that record wins.
    if (!this.objects.has(newId)) {
      this.objects.set(newId, { ...existing, instanceId: newId });
    }
    this.objects.delete(origId);
  }

  private buildBattlefield(): BattlefieldPermanent[] {
    const battlefield: BattlefieldPermanent[] = [];
    for (const object of this.objects.values()) {
      if (!this.battlefieldZoneIds.has(object.zoneId)) continue;
      battlefield.push({
        instanceId: object.instanceId,
        grpId: object.grpId,
        controllerSeatId: object.controllerSeatId,
        tapped: object.tapped,
      });
    }
    // Stable order so downstream diffing/derivation is deterministic.
    battlefield.sort((a, b) => a.instanceId - b.instanceId);
    return battlefield;
  }

  /** Compact rendering of exactly what TrackerState exposes, for change detection. */
  private signature(): string {
    let signature = `${this.localSeatId}`;
    for (const permanent of this.buildBattlefield()) {
      signature += `|${permanent.instanceId},${permanent.grpId},${permanent.controllerSeatId},${permanent.tapped ? 1 : 0}`;
    }
    return signature;
  }
}
