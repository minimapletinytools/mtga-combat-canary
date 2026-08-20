import { describe, expect, it } from 'vitest';
import { LineAssembler, extractGreEvent } from '../src/chunker.js';
import { chunkText, fixtureLines } from './helpers.js';

describe('LineAssembler', () => {
  it('returns only complete lines and buffers the partial tail', () => {
    const assembler = new LineAssembler();
    expect(assembler.feed('hello\nwor')).toEqual(['hello']);
    expect(assembler.feed('ld\n')).toEqual(['world']);
  });

  it('returns nothing until the first newline arrives', () => {
    const assembler = new LineAssembler();
    expect(assembler.feed('{ "a"')).toEqual([]);
    expect(assembler.feed(': 1 }')).toEqual([]);
    expect(assembler.feed('\ntail')).toEqual(['{ "a": 1 }']);
  });

  it('handles several lines in one chunk and empty chunks', () => {
    const assembler = new LineAssembler();
    expect(assembler.feed('a\nb\nc\n')).toEqual(['a', 'b', 'c']);
    expect(assembler.feed('')).toEqual([]);
  });

  it('strips Windows carriage returns', () => {
    const assembler = new LineAssembler();
    expect(assembler.feed('a\r\nb\r\n')).toEqual(['a', 'b']);
  });

  it('reassembles the whole fixture regardless of chunk boundaries', () => {
    const lines = fixtureLines();
    const text = `${lines.join('\n')}\n`;
    for (const size of [1024, 7919, 65536]) {
      const assembler = new LineAssembler();
      const out: string[] = [];
      for (const chunk of chunkText(text, size)) out.push(...assembler.feed(chunk));
      expect(out).toEqual(lines);
    }
  });

  it('splits a single fixture line across many chunks without corrupting it', () => {
    const first = fixtureLines()[0] as string;
    const assembler = new LineAssembler();
    const out: string[] = [];
    for (const chunk of chunkText(`${first}\n`, 17)) out.push(...assembler.feed(chunk));
    expect(out).toEqual([first]);
  });
});

describe('extractGreEvent', () => {
  it('parses a real GRE line from the fixture', () => {
    const first = fixtureLines()[0] as string;
    const event = extractGreEvent(first);
    expect(event).not.toBeNull();
    expect(event?.greToClientMessages[0]?.type).toBe('GREMessageType_ConnectResp');
    expect(event?.greToClientMessages[0]?.systemSeatIds).toEqual([2]);
  });

  it('returns null for Unity noise, blanks and junk', () => {
    for (const line of [
      '',
      '   ',
      'Initialize engine version: 2022.3.62f2 (7670c08855a9)',
      '[PhysX] Initialized MultithreadedTaskDispatcher with 18 workers.',
      'Metal devices available: 1',
      'not json at all, but long enough to reach the length guard',
    ]) {
      expect(extractGreEvent(line)).toBeNull();
    }
  });

  it('returns null for valid JSON that is not a GRE event', () => {
    const nonGre = fixtureLines().find((l) => l.includes('matchGameRoomStateChangedEvent'));
    expect(nonGre).toBeDefined();
    expect(extractGreEvent(nonGre as string)).toBeNull();
    expect(extractGreEvent('{ "greToClientEventX": 1, "padding": "aaaaaaaaaaaaaaaa" }')).toBeNull();
  });

  it('never throws on malformed or truncated GRE lines', () => {
    const first = fixtureLines()[0] as string;
    for (const line of [
      first.slice(0, 400),
      '{ "greToClientEvent": ',
      '{ "greToClientEvent": null }',
      '{ "greToClientEvent": { } }',
      '{ "greToClientEvent": { "greToClientMessages": "nope" } }',
      `${'{'.repeat(500)} greToClientEvent`,
    ]) {
      expect(() => extractGreEvent(line)).not.toThrow();
      expect(extractGreEvent(line)).toBeNull();
    }
  });

  it('drops malformed entries inside greToClientMessages', () => {
    const line =
      '{ "greToClientEvent": { "greToClientMessages": [ null, 7, { "nope": 1 }, { "type": "GREMessageType_GameStateMessage" } ] } }';
    const event = extractGreEvent(line);
    expect(event?.greToClientMessages).toHaveLength(1);
    expect(event?.greToClientMessages[0]?.type).toBe('GREMessageType_GameStateMessage');
  });

  it('tolerates a prefix before the JSON payload', () => {
    const first = fixtureLines()[0] as string;
    expect(extractGreEvent(`[UnityCrossThreadLogger]==> ${first}`)).not.toBeNull();
  });

  it('finds a GRE event in every fixture line that has one', () => {
    const lines = fixtureLines();
    const parsed = lines.map(extractGreEvent).filter((e) => e !== null);
    // 218 fixture lines: 216 GRE events + 2 matchGameRoomStateChangedEvent lines.
    expect(lines).toHaveLength(218);
    expect(parsed).toHaveLength(216);
  });
});
