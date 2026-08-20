import type { GreEvent, GreMessage } from './types.js';

/** Guard against unbounded growth if a "line" never terminates (corrupt log). */
const MAX_PARTIAL_LINE = 32 * 1024 * 1024;

/**
 * Assembles raw appended log text into complete lines. Player.log events are
 * single-line JSON, but reads can split a line across chunks — buffer the
 * partial tail until its newline arrives.
 *
 * WP6 — see PLAN.md Phase 2.
 */
export class LineAssembler {
  private partial = '';

  feed(chunk: string): string[] {
    if (!chunk) return [];

    const text = this.partial + chunk;
    const parts = text.split('\n');
    // The last element is whatever came after the final newline: keep buffering it.
    this.partial = parts.pop() ?? '';
    if (this.partial.length > MAX_PARTIAL_LINE) this.partial = '';

    // Player.log is written with \n on macOS and \r\n on Windows.
    for (let i = 0; i < parts.length; i++) {
      const line = parts[i] as string;
      if (line.charCodeAt(line.length - 1) === 13) parts[i] = line.slice(0, -1);
    }
    return parts;
  }
}

/**
 * If this log line is a GRE event (contains a greToClientEvent JSON payload),
 * parse and return it; otherwise null. Must never throw on garbage input.
 *
 * WP6 — see PLAN.md Phase 2.
 */
export function extractGreEvent(line: string): GreEvent | null {
  // Cheap reject first: the vast majority of Player.log lines are Unity noise.
  if (!line || line.length < 20 || line.indexOf('greToClientEvent') === -1) return null;

  // Verified on this machine: GRE lines are a single pretty-printed JSON object
  // starting at column 0. Slicing from the first brace also tolerates the
  // timestamp/label prefixes older Arena builds emitted.
  const start = line.indexOf('{');
  if (start === -1) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(start === 0 ? line : line.slice(start));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const event = (parsed as { greToClientEvent?: unknown }).greToClientEvent;
  if (!event || typeof event !== 'object') return null;

  const messages = (event as { greToClientMessages?: unknown }).greToClientMessages;
  if (!Array.isArray(messages)) return null;

  const greToClientMessages: GreMessage[] = [];
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    if (typeof (message as { type?: unknown }).type !== 'string') continue;
    greToClientMessages.push(message as GreMessage);
  }
  return { greToClientMessages };
}
