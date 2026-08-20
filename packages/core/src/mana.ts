import type { CastabilityResult, Color, ManaSource, OpenMana, ParsedCost, Pip } from './types.js';

const COLORS: ReadonlyArray<Color> = ['W', 'U', 'B', 'R', 'G'];

function isColor(value: string): value is Color {
  return (COLORS as ReadonlyArray<string>).includes(value);
}

function unknownSymbol(symbol: string, cost: string): Error {
  return new Error(`Unknown mana symbol "{${symbol}}" in mana cost "${cost}"`);
}

/**
 * Parse a Scryfall mana-cost string (e.g. "{1}{W/U}{X}") into pips.
 * Throws on unknown symbols. Empty string parses to zero pips.
 *
 * Supported symbols:
 *   {3} generic, {W} colored, {C} colorless, {W/U} hybrid, {2/W} mono-hybrid,
 *   {W/P} phyrexian, {G/U/P} hybrid phyrexian, {S} snow, {X} variable.
 *
 * Note: `Pip` carries a single color, so a hybrid phyrexian symbol such as {G/U/P}
 * is modelled as a phyrexian pip on its *first* color. Life payment is always
 * available for phyrexian pips, so this only ever costs us precision on the
 * `mayUseLife` flag (never on castability).
 *
 * WP1 — see PLAN.md.
 */
export function parseManaCost(cost: string): ParsedCost {
  const pips: Pip[] = [];
  let i = 0;

  while (i < cost.length) {
    const ch = cost[i];
    if (ch === undefined) break;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch !== '{') {
      throw new Error(`Malformed mana cost "${cost}": expected "{" at index ${i}`);
    }
    const end = cost.indexOf('}', i + 1);
    if (end === -1) {
      throw new Error(`Malformed mana cost "${cost}": unclosed "{" at index ${i}`);
    }
    pips.push(parseSymbol(cost.slice(i + 1, end), cost));
    i = end + 1;
  }

  return { pips };
}

function parseSymbol(rawSymbol: string, cost: string): Pip {
  const symbol = rawSymbol.trim().toUpperCase();
  if (symbol.length === 0) {
    throw unknownSymbol(rawSymbol, cost);
  }

  if (/^\d+$/.test(symbol)) {
    return { kind: 'generic', amount: Number.parseInt(symbol, 10) };
  }

  if (!symbol.includes('/')) {
    if (symbol === 'X') return { kind: 'x' };
    if (symbol === 'S') return { kind: 'snow' };
    if (symbol === 'C') return { kind: 'colorless' };
    if (isColor(symbol)) return { kind: 'colored', color: symbol };
    throw unknownSymbol(rawSymbol, cost);
  }

  const parts = symbol.split('/');

  // {W/P} — phyrexian; {W/U} — hybrid; {2/W} — mono-hybrid.
  if (parts.length === 2) {
    const [a, b] = parts;
    if (a === undefined || b === undefined) throw unknownSymbol(rawSymbol, cost);
    if (isColor(a) && b === 'P') return { kind: 'phyrexian', color: a };
    if (a === '2' && isColor(b)) return { kind: 'monoHybrid', color: b };
    if (isColor(a) && isColor(b) && a !== b) return { kind: 'hybrid', colors: [a, b] };
    throw unknownSymbol(rawSymbol, cost);
  }

  // {G/U/P} — hybrid phyrexian; either color pays, or 2 life.
  if (parts.length === 3) {
    const [a, b, p] = parts;
    if (a === undefined || b === undefined) throw unknownSymbol(rawSymbol, cost);
    if (isColor(a) && isColor(b) && a !== b && p === 'P') {
      return { kind: 'phyrexian', color: a };
    }
  }

  throw unknownSymbol(rawSymbol, cost);
}

/** Predicate: can this source produce a mana type this pip accepts? */
type Requirement = (source: ManaSource) => boolean;

function requires(...types: ReadonlyArray<Color | 'C'>): Requirement {
  return (source) => types.some((t) => source.produces.includes(t));
}

const ANY_SOURCE: Requirement = () => true;

function requirementFor(pip: Pip): Requirement | null {
  switch (pip.kind) {
    case 'colored':
      return requires(pip.color);
    case 'colorless':
      return requires('C');
    case 'hybrid':
      return requires(pip.colors[0], pip.colors[1]);
    case 'snow':
      // Snow mana is just mana from a snow permanent; we cannot know which sources
      // are snow, so PLAN.md says treat {S} as payable by any source.
      return ANY_SOURCE;
    default:
      return null;
  }
}

/**
 * Maximum bipartite matching between requirements and sources (Kuhn's algorithm,
 * simple augmenting paths). Pools here are tiny (≤ ~15 on both sides).
 */
function maxMatching(reqs: ReadonlyArray<Requirement>, sources: ReadonlyArray<ManaSource>): number {
  const sourceToReq: number[] = new Array(sources.length).fill(-1);

  const augment = (req: number, visited: boolean[]): boolean => {
    const accepts = reqs[req];
    if (accepts === undefined) return false;
    for (let s = 0; s < sources.length; s++) {
      if (visited[s]) continue;
      const source = sources[s];
      if (source === undefined || !accepts(source)) continue;
      visited[s] = true;
      const holder = sourceToReq[s];
      if (holder === undefined || holder === -1 || augment(holder, visited)) {
        sourceToReq[s] = req;
        return true;
      }
    }
    return false;
  };

  let matched = 0;
  for (let r = 0; r < reqs.length; r++) {
    if (augment(r, new Array(sources.length).fill(false))) matched++;
  }
  return matched;
}

/**
 * One fully-resolved payment plan: every specific pip must get its own source, and
 * whatever is left over must cover the generic amount (any source pays generic).
 */
function feasible(
  reqs: ReadonlyArray<Requirement>,
  generic: number,
  sources: ReadonlyArray<ManaSource>,
): boolean {
  if (reqs.length + generic > sources.length) return false;
  if (reqs.length === 0) return true;
  // Any assignment covering every pip is already a maximum matching, so the number of
  // leftover sources is the same for all of them: sources.length - reqs.length.
  return maxMatching(reqs, sources) === reqs.length;
}

/**
 * Brute-force the mono-hybrid choices ({2/W}: pay the color, or pay 2 generic).
 * Pips of the same color are interchangeable, so we only branch on *how many* of
 * each color are paid with colored mana — a handful of combinations at most.
 */
function feasibleWithMonoHybrids(
  reqs: ReadonlyArray<Requirement>,
  generic: number,
  monoHybrids: ReadonlyArray<[Color, number]>,
  sources: ReadonlyArray<ManaSource>,
  index = 0,
): boolean {
  const group = monoHybrids[index];
  if (group === undefined) return feasible(reqs, generic, sources);

  const [color, count] = group;
  for (let paidWithColor = 0; paidWithColor <= count; paidWithColor++) {
    const nextReqs = reqs.slice();
    for (let n = 0; n < paidWithColor; n++) nextReqs.push(requires(color));
    const nextGeneric = generic + 2 * (count - paidWithColor);
    if (feasibleWithMonoHybrids(nextReqs, nextGeneric, monoHybrids, sources, index + 1)) {
      return true;
    }
  }
  return false;
}

/**
 * Mana-cost satisfiability against a pool of untapped sources.
 * Bipartite matching over pips × sources; see PLAN.md WP1 for the algorithm.
 *
 * WP1 — see PLAN.md.
 */
export function canCast(cost: ParsedCost, mana: OpenMana): CastabilityResult {
  const sources = mana.sources;

  const fixed: Requirement[] = [];
  const phyrexian: Requirement[] = [];
  const monoHybridCounts = new Map<Color, number>();
  let generic = 0;
  let usesXZero = false;

  for (const pip of cost.pips) {
    switch (pip.kind) {
      case 'generic':
        generic += pip.amount;
        break;
      case 'x':
        // X is assumed to be 0: the pip contributes nothing.
        usesXZero = true;
        break;
      case 'monoHybrid':
        monoHybridCounts.set(pip.color, (monoHybridCounts.get(pip.color) ?? 0) + 1);
        break;
      case 'phyrexian':
        phyrexian.push(requires(pip.color));
        break;
      default: {
        const req = requirementFor(pip);
        if (req !== null) fixed.push(req);
        break;
      }
    }
  }

  const monoHybrids: Array<[Color, number]> = [...monoHybridCounts.entries()];

  // First attempt: pay phyrexian pips with mana, like ordinary colored pips.
  const withMana = feasibleWithMonoHybrids([...fixed, ...phyrexian], generic, monoHybrids, sources);
  if (withMana) {
    return { castable: true, usesXZero, mayUseLife: false };
  }

  // Fallback: phyrexian pips are paid with life, so they are free of mana.
  if (phyrexian.length > 0) {
    const withLife = feasibleWithMonoHybrids(fixed, generic, monoHybrids, sources);
    if (withLife) {
      return { castable: true, usesXZero, mayUseLife: true };
    }
  }

  return { castable: false, usesXZero, mayUseLife: false };
}
