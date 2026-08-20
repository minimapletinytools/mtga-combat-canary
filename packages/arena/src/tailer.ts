import * as fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

export interface LogTailerCallbacks {
  /** New text appended to the log since the last poll. */
  onChunk(text: string): void;
  /** The log shrank (Arena truncates it on launch) — caller should reset state. */
  onTruncate(): void;
  /** The log file is missing or unreadable. */
  onError(err: Error): void;
}

/** Cap bytes consumed per poll so a huge backlog is streamed, not slurped. */
const MAX_READ_PER_POLL = 4 * 1024 * 1024;

/**
 * Poll-based follower of Player.log: remembers the byte position, emits
 * appended text, detects truncation (size decreased) and restarts from zero.
 * Poll-based rather than fs.watch for cross-platform reliability.
 *
 * WP6 — see PLAN.md Phase 2.
 */
export class LogTailer {
  private readonly path: string;
  private readonly callbacks: LogTailerCallbacks;
  private readonly pollIntervalMs: number;

  private timer: ReturnType<typeof setInterval> | null = null;
  private position = 0;
  /** UTF-8 sequences can straddle a read boundary; the decoder holds the tail. */
  private decoder = new StringDecoder('utf8');
  /** Deduped error signature, cleared as soon as a poll succeeds. */
  private lastErrorKey: string | null = null;
  private inode: number | null = null;

  constructor(path: string, callbacks: LogTailerCallbacks, pollIntervalMs = 500) {
    this.path = path;
    this.callbacks = callbacks;
    this.pollIntervalMs = pollIntervalMs > 0 ? pollIntervalMs : 500;
  }

  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
    // Don't keep a Node process alive just for the tail loop.
    (this.timer as { unref?: () => void }).unref?.();
    // Read whatever is already there, so a mid-match start still rebuilds state.
    this.poll();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private poll(): void {
    let stats: fs.Stats;
    try {
      stats = fs.statSync(this.path);
    } catch (err) {
      this.rewind();
      this.emitError(err);
      return;
    }

    try {
      if (!stats.isFile()) {
        this.rewind();
        this.emitError(new Error(`Not a file: ${this.path}`));
        return;
      }

      // The log was replaced (new inode) or truncated — restart from byte 0.
      const replaced =
        this.inode !== null && stats.ino !== 0 && this.inode !== 0 && stats.ino !== this.inode;
      if (replaced || stats.size < this.position) {
        this.rewind();
        this.safe(() => this.callbacks.onTruncate());
      }
      this.inode = stats.ino;
      this.lastErrorKey = null;

      if (stats.size <= this.position) return;

      const length = Math.min(stats.size - this.position, MAX_READ_PER_POLL);
      const buffer = Buffer.allocUnsafe(length);
      let bytesRead = 0;
      const fd = fs.openSync(this.path, 'r');
      try {
        bytesRead = fs.readSync(fd, buffer, 0, length, this.position);
      } finally {
        fs.closeSync(fd);
      }
      if (bytesRead <= 0) return;

      this.position += bytesRead;
      const text = this.decoder.write(buffer.subarray(0, bytesRead));
      if (text.length > 0) this.safe(() => this.callbacks.onChunk(text));
    } catch (err) {
      this.emitError(err);
    }
  }

  private rewind(): void {
    this.position = 0;
    this.inode = null;
    this.decoder = new StringDecoder('utf8');
  }

  private emitError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    const key = `${(error as NodeJS.ErrnoException).code ?? ''}:${error.message}`;
    // A missing log stays missing for every poll — report it once.
    if (key === this.lastErrorKey) return;
    this.lastErrorKey = key;
    this.safe(() => this.callbacks.onError(error));
  }

  /** A throwing consumer must never kill the poll loop. */
  private safe(fn: () => void): void {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}
