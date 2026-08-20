import { describe, expect, it } from 'vitest';
import { canCast, parseManaCost } from '../src/mana';
import type { Color, ManaSource, OpenMana, Pip } from '../src/types';

/** One source producing the given mana types, e.g. `src('W')`, `src('W', 'U')`. */
function src(...produces: Array<Color | 'C'>): ManaSource {
  return { produces };
}

/** All five colors — the UI's "any color" stepper. */
function any(): ManaSource {
  return { produces: ['W', 'U', 'B', 'R', 'G'] };
}

function pool(...sources: ManaSource[]): OpenMana {
  return { sources };
}

function pips(cost: string): Pip[] {
  return parseManaCost(cost).pips;
}

function cast(cost: string, ...sources: ManaSource[]) {
  return canCast(parseManaCost(cost), pool(...sources));
}

function castable(cost: string, ...sources: ManaSource[]): boolean {
  return cast(cost, ...sources).castable;
}

describe('parseManaCost', () => {
  it('parses the empty cost as zero pips', () => {
    expect(parseManaCost('')).toEqual({ pips: [] });
  });

  it('parses generic pips', () => {
    expect(pips('{3}')).toEqual([{ kind: 'generic', amount: 3 }]);
    expect(pips('{0}')).toEqual([{ kind: 'generic', amount: 0 }]);
    expect(pips('{10}')).toEqual([{ kind: 'generic', amount: 10 }]);
  });

  it('parses colored pips', () => {
    expect(pips('{W}')).toEqual([{ kind: 'colored', color: 'W' }]);
    expect(pips('{U}{B}{R}{G}')).toEqual([
      { kind: 'colored', color: 'U' },
      { kind: 'colored', color: 'B' },
      { kind: 'colored', color: 'R' },
      { kind: 'colored', color: 'G' },
    ]);
  });

  it('parses colorless {C}', () => {
    expect(pips('{C}')).toEqual([{ kind: 'colorless' }]);
  });

  it('parses hybrid {W/U}', () => {
    expect(pips('{W/U}')).toEqual([{ kind: 'hybrid', colors: ['W', 'U'] }]);
    expect(pips('{B/G}')).toEqual([{ kind: 'hybrid', colors: ['B', 'G'] }]);
  });

  it('parses mono-hybrid {2/W}', () => {
    expect(pips('{2/W}')).toEqual([{ kind: 'monoHybrid', color: 'W' }]);
  });

  it('parses phyrexian {W/P}', () => {
    expect(pips('{W/P}')).toEqual([{ kind: 'phyrexian', color: 'W' }]);
  });

  it('parses hybrid phyrexian {G/U/P} as a phyrexian pip', () => {
    expect(pips('{G/U/P}')).toEqual([{ kind: 'phyrexian', color: 'G' }]);
  });

  it('parses snow {S}', () => {
    expect(pips('{S}')).toEqual([{ kind: 'snow' }]);
  });

  it('parses {X}', () => {
    expect(pips('{X}')).toEqual([{ kind: 'x' }]);
    expect(pips('{X}{X}')).toEqual([{ kind: 'x' }, { kind: 'x' }]);
  });

  it('parses a real multi-symbol cost in order', () => {
    expect(pips('{X}{2}{W/U}{2/R}{B/P}{S}{C}{G}')).toEqual([
      { kind: 'x' },
      { kind: 'generic', amount: 2 },
      { kind: 'hybrid', colors: ['W', 'U'] },
      { kind: 'monoHybrid', color: 'R' },
      { kind: 'phyrexian', color: 'B' },
      { kind: 'snow' },
      { kind: 'colorless' },
      { kind: 'colored', color: 'G' },
    ]);
  });

  it('keeps multiple generic pips separate (they are summed at cast time)', () => {
    expect(pips('{2}{1}')).toEqual([
      { kind: 'generic', amount: 2 },
      { kind: 'generic', amount: 1 },
    ]);
    expect(castable('{2}{1}', src('W'), src('W'), src('W'))).toBe(true);
    expect(castable('{2}{1}', src('W'), src('W'))).toBe(false);
  });

  it('accepts lowercase symbols', () => {
    expect(pips('{1}{w/u}{x}')).toEqual([
      { kind: 'generic', amount: 1 },
      { kind: 'hybrid', colors: ['W', 'U'] },
      { kind: 'x' },
    ]);
  });

  it('throws on unknown symbols', () => {
    expect(() => parseManaCost('{Q}')).toThrow(/Unknown mana symbol/);
    expect(() => parseManaCost('{W/Q}')).toThrow(/Unknown mana symbol/);
    expect(() => parseManaCost('{3/W}')).toThrow(/Unknown mana symbol/);
    expect(() => parseManaCost('{W/U/B}')).toThrow(/Unknown mana symbol/);
    expect(() => parseManaCost('{W/W}')).toThrow(/Unknown mana symbol/);
    expect(() => parseManaCost('{P}')).toThrow(/Unknown mana symbol/);
    expect(() => parseManaCost('{}')).toThrow(/Unknown mana symbol/);
    expect(() => parseManaCost('{1.5}')).toThrow(/Unknown mana symbol/);
  });

  it('throws on malformed costs', () => {
    expect(() => parseManaCost('W')).toThrow(/Malformed mana cost/);
    expect(() => parseManaCost('{1')).toThrow(/unclosed/);
    expect(() => parseManaCost('{1}{U')).toThrow(/unclosed/);
    expect(() => parseManaCost('{1}U')).toThrow(/Malformed mana cost/);
    // split-card card-level costs are not supported; faces must be parsed separately
    expect(() => parseManaCost('{1}{U} // {2}{R}')).toThrow();
  });
});

describe('canCast — basics', () => {
  it('treats an empty cost as castable, even with no mana', () => {
    const result = cast('');
    expect(result).toEqual({ castable: true, usesXZero: false, mayUseLife: false });
  });

  it('{R} is castable with a red source but not a green one', () => {
    expect(castable('{R}', src('R'))).toBe(true);
    expect(castable('{R}', src('G'))).toBe(false);
    expect(castable('{R}')).toBe(false);
    expect(castable('{R}', any())).toBe(true);
  });

  it('{U}{U} needs two U sources', () => {
    expect(castable('{U}{U}', src('U'))).toBe(false);
    expect(castable('{U}{U}', src('U'), src('U'))).toBe(true);
    expect(castable('{U}{U}', src('U'), src('G'))).toBe(false);
    expect(castable('{U}{U}', src('U'), any())).toBe(true);
  });

  it('{1}{U} is castable with [U, G] but not [G, G]', () => {
    expect(castable('{1}{U}', src('U'), src('G'))).toBe(true);
    expect(castable('{1}{U}', src('G'), src('G'))).toBe(false);
    expect(castable('{1}{U}', src('U'))).toBe(false);
  });

  it('generic can be paid by any source, including colorless ones', () => {
    expect(castable('{1}', src('C'))).toBe(true);
    expect(castable('{2}', src('C'), src('W'))).toBe(true);
    expect(castable('{3}', src('C'), src('W'))).toBe(false);
    expect(castable('{0}')).toBe(true);
  });

  it('counts leftover sources against the generic amount', () => {
    // {2}{U} needs three sources total
    expect(castable('{2}{U}', src('U'), src('U'))).toBe(false);
    expect(castable('{2}{U}', src('U'), src('U'), src('G'))).toBe(true);
  });

  it('does not mutate the source pool', () => {
    const sources = [src('W', 'U'), src('U')];
    const snapshot = JSON.parse(JSON.stringify(sources));
    canCast(parseManaCost('{W}{U}'), { sources });
    expect(sources).toEqual(snapshot);
  });
});

describe('canCast — colorless {C}', () => {
  it('{C} is not castable with [W] but is with [C]', () => {
    expect(castable('{C}', src('W'))).toBe(false);
    expect(castable('{C}', src('C'))).toBe(true);
    expect(castable('{C}', any())).toBe(false); // "any color" makes no colorless mana
    expect(castable('{C}', src('W', 'C'))).toBe(true);
  });

  it('{1}{C} uses the C source for the colorless pip', () => {
    expect(castable('{1}{C}', src('C'), src('W'))).toBe(true);
    expect(castable('{1}{C}', src('W'), src('W'))).toBe(false);
    expect(castable('{C}{C}', src('C'), src('W', 'C'))).toBe(true);
    expect(castable('{C}{C}', src('C'), src('W'))).toBe(false);
  });
});

describe('canCast — hybrid and matching', () => {
  it('{W/U} is castable with either half', () => {
    expect(castable('{W/U}', src('W'))).toBe(true);
    expect(castable('{W/U}', src('U'))).toBe(true);
    expect(castable('{W/U}', src('G'))).toBe(false);
    expect(castable('{W/U}')).toBe(false);
  });

  it('{U}{W/U} works with [U, W|U dual] and with [U, U]', () => {
    expect(castable('{U}{W/U}', src('U'), src('W', 'U'))).toBe(true);
    expect(castable('{U}{W/U}', src('U'), src('U'))).toBe(true);
    expect(castable('{U}{W/U}', src('W'), src('W'))).toBe(false);
  });

  it('{W}{U} with [W|U dual, U-only] needs real matching (greedy on pip order fails)', () => {
    // Greedy would give the dual to {W}... which is right; the failing greedy order is
    // the other one: assign the dual to {U} first and {W} is stranded. Both orders must
    // succeed via augmenting paths.
    expect(castable('{W}{U}', src('W', 'U'), src('U'))).toBe(true);
    expect(castable('{U}{W}', src('W', 'U'), src('U'))).toBe(true);
    expect(castable('{U}{W}', src('U'), src('W', 'U'))).toBe(true);
    expect(castable('{W}{W}', src('W', 'U'), src('U'))).toBe(false);
  });

  it('handles a three-deep augmenting chain', () => {
    // pips W, U, B against duals WU, UB, BW — the only solution needs re-assignment.
    expect(castable('{W}{U}{B}', src('W', 'U'), src('U', 'B'), src('B', 'W'))).toBe(true);
    // {W}{W}{B} still fits (WU + BW pay the whites, UB pays the black)...
    expect(castable('{W}{W}{B}', src('W', 'U'), src('U', 'B'), src('B', 'W'))).toBe(true);
    // ...but only two of the three duals make white.
    expect(castable('{W}{W}{W}', src('W', 'U'), src('U', 'B'), src('B', 'W'))).toBe(false);
  });

  it('handles hybrids competing for the same source', () => {
    expect(castable('{W/U}{W/U}', src('W', 'U'), src('G'))).toBe(false);
    expect(castable('{W/U}{W/U}', src('W', 'U'), src('U'))).toBe(true);
    expect(castable('{1}{W/U}{U}', src('W', 'U'), src('U'), src('G'))).toBe(true);
    expect(castable('{1}{W/U}{U}', src('W', 'U'), src('U'))).toBe(false);
  });
});

describe('canCast — mono-hybrid {2/W}', () => {
  it('{2/W} is castable with [W] and with [G, G], but not with [G]', () => {
    expect(castable('{2/W}', src('W'))).toBe(true);
    expect(castable('{2/W}', src('G'), src('G'))).toBe(true);
    expect(castable('{2/W}', src('G'))).toBe(false);
    expect(castable('{2/W}')).toBe(false);
  });

  it('branches per pip: one paid with color, one with two generic', () => {
    expect(castable('{2/W}{2/W}', src('W'), src('G'), src('G'))).toBe(true);
    expect(castable('{2/W}{2/W}', src('W'), src('W'))).toBe(true);
    expect(castable('{2/W}{2/W}', src('W'), src('G'))).toBe(false);
    expect(castable('{2/W}{2/W}', src('G'), src('G'), src('G'), src('G'))).toBe(true);
    expect(castable('{2/W}{2/W}', src('G'), src('G'), src('G'))).toBe(false);
  });

  it('branches across different mono-hybrid colors', () => {
    expect(castable('{2/W}{2/U}', src('W'), src('U'))).toBe(true);
    expect(castable('{2/W}{2/U}', src('W'), src('G'), src('G'))).toBe(true);
    expect(castable('{2/W}{2/U}', src('G'), src('G'), src('G'))).toBe(false);
  });

  it('mixes with other pips', () => {
    // paying {2/W} with color leaves the W source unavailable for {W}
    expect(castable('{W}{2/W}', src('W'), src('W'))).toBe(true);
    expect(castable('{W}{2/W}', src('W'), src('G'), src('G'))).toBe(true);
    expect(castable('{W}{2/W}', src('W'), src('G'))).toBe(false);
  });
});

describe('canCast — {X}', () => {
  it('{X}{R} is castable with [R] and flags usesXZero', () => {
    expect(cast('{X}{R}', src('R'))).toEqual({
      castable: true,
      usesXZero: true,
      mayUseLife: false,
    });
  });

  it('flags usesXZero even when the cost is not castable', () => {
    expect(cast('{X}{R}', src('G'))).toEqual({
      castable: false,
      usesXZero: true,
      mayUseLife: false,
    });
  });

  it('{X}{X}{U} only drops the X pips', () => {
    expect(cast('{X}{X}{U}', src('U'))).toEqual({
      castable: true,
      usesXZero: true,
      mayUseLife: false,
    });
    expect(castable('{X}{1}{U}', src('U'))).toBe(false);
  });
});

describe('canCast — phyrexian', () => {
  it('{U/P} is castable with no mana via life', () => {
    expect(cast('{U/P}')).toEqual({ castable: true, usesXZero: false, mayUseLife: true });
  });

  it('{U/P} with [U] is castable without paying life', () => {
    expect(cast('{U/P}', src('U'))).toEqual({
      castable: true,
      usesXZero: false,
      mayUseLife: false,
    });
  });

  it('{U/P} with an off-color source falls back to life', () => {
    expect(cast('{U/P}', src('G'))).toEqual({
      castable: true,
      usesXZero: false,
      mayUseLife: true,
    });
  });

  it('{1}{U/P} still needs the generic mana', () => {
    expect(cast('{1}{U/P}', src('G'))).toEqual({
      castable: true,
      usesXZero: false,
      mayUseLife: true,
    });
    expect(cast('{1}{U/P}', src('U'), src('G'))).toEqual({
      castable: true,
      usesXZero: false,
      mayUseLife: false,
    });
    expect(cast('{1}{U/P}')).toEqual({
      castable: false,
      usesXZero: false,
      mayUseLife: false,
    });
  });

  it('prefers mana payment when the whole cost fits', () => {
    expect(cast('{U/P}{U/P}', src('U'), src('U'))).toEqual({
      castable: true,
      usesXZero: false,
      mayUseLife: false,
    });
    // only one U: the pair is castable only if at least one is paid with life
    expect(cast('{U/P}{U/P}', src('U'))).toEqual({
      castable: true,
      usesXZero: false,
      mayUseLife: true,
    });
  });

  it('hybrid phyrexian {G/U/P} is castable with either color or with life', () => {
    expect(cast('{G/U/P}', src('G'))).toEqual({
      castable: true,
      usesXZero: false,
      mayUseLife: false,
    });
    // documented simplification: the pip keeps only the first color, so a U-only pool
    // is reported as castable via life rather than via mana. Castability is unaffected.
    const withU = cast('{G/U/P}', src('U'));
    expect(withU.castable).toBe(true);
    expect(cast('{G/U/P}')).toEqual({
      castable: true,
      usesXZero: false,
      mayUseLife: true,
    });
  });

  it('never reports mayUseLife when there is no phyrexian pip', () => {
    expect(cast('{U}', src('U')).mayUseLife).toBe(false);
    expect(cast('{U}', src('G')).mayUseLife).toBe(false);
  });
});

describe('canCast — snow {S}', () => {
  it('{S} is payable by any source', () => {
    expect(castable('{S}', src('G'))).toBe(true);
    expect(castable('{S}', src('C'))).toBe(true);
    expect(castable('{S}')).toBe(false);
    expect(castable('{S}{S}', src('G'))).toBe(false);
    expect(castable('{S}{S}', src('G'), src('C'))).toBe(true);
  });

  it('{1}{S}{G} needs three sources, one of them green', () => {
    expect(castable('{1}{S}{G}', src('G'), src('C'), src('C'))).toBe(true);
    expect(castable('{1}{S}{G}', src('C'), src('C'), src('C'))).toBe(false);
    expect(castable('{1}{S}{G}', src('G'), src('C'))).toBe(false);
  });
});

describe('canCast — realistic costs', () => {
  it('Cryptic Command {1}{U}{U}{U}', () => {
    expect(castable('{1}{U}{U}{U}', src('U'), src('U'), src('U'), src('W'))).toBe(true);
    expect(castable('{1}{U}{U}{U}', src('U'), src('U'), src('W'), src('W'))).toBe(false);
  });

  it('Boros Charm {R}{W} off a Sacred Foundry plus a Mountain', () => {
    expect(castable('{R}{W}', src('R', 'W'), src('R'))).toBe(true);
    expect(castable('{R}{W}', src('R'), src('R'))).toBe(false);
  });

  it('Beseech the Queen {2/B}{2/B}{2/B} with six generic sources', () => {
    const six = Array.from({ length: 6 }, () => src('G'));
    expect(castable('{2/B}{2/B}{2/B}', ...six)).toBe(true);
    expect(castable('{2/B}{2/B}{2/B}', ...six.slice(1))).toBe(false);
    expect(castable('{2/B}{2/B}{2/B}', src('B'), src('B'), src('G'), src('G'))).toBe(true);
  });

  it('handles a fifteen-source pool', () => {
    const big = [
      ...Array.from({ length: 5 }, () => src('W')),
      ...Array.from({ length: 5 }, () => src('U')),
      ...Array.from({ length: 5 }, () => src('C')),
    ];
    expect(castable('{10}{W}{U}{C}', ...big)).toBe(true);
    expect(castable('{12}{W}{U}{C}', ...big)).toBe(true); // exactly 15 sources
    expect(castable('{13}{W}{U}{C}', ...big)).toBe(false); // 16 needed
    expect(castable('{W}{W}{W}{W}{W}{W}', ...big)).toBe(false);
  });
});

// Dual/tri-land sources (a source that can produce 2 or 3 specific colors,
// e.g. an Azorius or Bant land) use the exact same ManaSource shape as the
// "any color" 5-color source already covered above — the matching algorithm
// is generic over produces.length, so no engine changes were needed to add
// them to the UI. These lock that in.
describe('canCast — dual and tri-land sources', () => {
  it('an Azorius dual (WU) pays either color pip, but only one at a time', () => {
    expect(castable('{W}', src('W', 'U'))).toBe(true);
    expect(castable('{U}', src('W', 'U'))).toBe(true);
    expect(castable('{W}{U}', src('W', 'U'))).toBe(false); // one source, two pips
    expect(castable('{W}{U}', src('W', 'U'), src('W', 'U'))).toBe(true);
  });

  it('a Bant tri-land (WUG) satisfies any one of its three colors', () => {
    expect(castable('{W}', src('W', 'U', 'G'))).toBe(true);
    expect(castable('{U}', src('W', 'U', 'G'))).toBe(true);
    expect(castable('{G}', src('W', 'U', 'G'))).toBe(true);
    expect(castable('{B}', src('W', 'U', 'G'))).toBe(false);
  });

  it('a WUBRG cost needs five duals matched to five distinct colors', () => {
    const wu = src('W', 'U');
    const ub = src('U', 'B');
    const br = src('B', 'R');
    const rg = src('R', 'G');
    const gw = src('G', 'W');
    // A valid perfect matching exists (each dual takes its "other" color).
    expect(castable('{W}{U}{B}{R}{G}', wu, ub, br, rg, gw)).toBe(true);
  });

  it('duals still pay generic costs with any leftover source', () => {
    expect(castable('{3}', src('W', 'U'), src('B', 'R'), src('G', 'W', 'U'))).toBe(true);
    expect(castable('{4}', src('W', 'U'), src('B', 'R'), src('G', 'W', 'U'))).toBe(false);
  });
});
