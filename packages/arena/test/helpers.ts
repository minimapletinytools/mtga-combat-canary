import * as fs from 'node:fs';
import type { Color } from '@mtgatricks/core';

/** The 218-line scrubbed excerpt of a real Player.log (one complete match). */
export function fixtureText(): string {
  return fs.readFileSync(new URL('./fixtures/match-log.jsonl', import.meta.url), 'utf8');
}

export function fixtureLines(): string[] {
  return fixtureText().split('\n').filter((line) => line.length > 0);
}

/**
 * grpIds of the basic lands that appear in the fixture, hand-checked against
 * the gameObjects' subtypes (SubType_Mountain / Forest / Plains / Swamp).
 */
export const FIXTURE_LANDS: Record<number, ReadonlyArray<Color | 'C'>> = {
  81182: ['R'], // Mountain
  105174: ['W'], // Plains
  105178: ['B'], // Swamp
  105180: ['R'], // Mountain (different printing)
  105182: ['G'], // Forest
};

export function fixtureLookup(grpId: number): ReadonlyArray<Color | 'C'> | undefined {
  return FIXTURE_LANDS[grpId];
}

/** Splits text into fixed-size pieces to simulate partial log reads. */
export function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls `check` until it returns true, or throws after `timeoutMs`. */
export async function waitFor(
  check: () => boolean,
  timeoutMs = 2000,
  label = 'condition',
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await delay(5);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
