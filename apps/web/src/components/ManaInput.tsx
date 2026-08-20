import { useEffect, useState } from 'react';
import type { Color, ManaSource, OpenMana } from '@mtgatricks/core';
import type { ManualManaProvider } from '../manaProvider';

/** WUBRG — the standard color-pie order everything below is generated from. */
const COLOR_WHEEL: readonly Color[] = ['W', 'U', 'B', 'R', 'G'];

const COLORS: { key: Color; label: string; className: string }[] = COLOR_WHEEL.map((key) => ({
  key,
  label: key,
  className: `mana-${key.toLowerCase()}`,
}));

/** Every k-color subset of WUBRG: each combo's own letters are already in
 * wheel order (inner loop starts after the outer index), and the list of
 * combos itself comes out in wheel-lexicographic order — e.g. duals are
 * WU, WB, WR, WG, UB, UR, UG, BR, BG, RG, never "UW" or "GW". */
function combosOf(k: number): Color[][] {
  const out: Color[][] = [];
  const current: Color[] = [];
  function rec(start: number) {
    if (current.length === k) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < COLOR_WHEEL.length; i++) {
      current.push(COLOR_WHEEL[i]!);
      rec(i + 1);
      current.pop();
    }
  }
  rec(0);
  return out;
}

/** The 10 two-color combinations (dual lands), e.g. ['W','U'] for Azorius. */
const DUAL_COMBOS = combosOf(2);
/** The 10 three-color combinations (tri-lands), e.g. ['W','U','B'] for Esper. */
const TRI_COMBOS = combosOf(3);

function comboKey(colors: readonly Color[]): string {
  return colors.join('');
}

const MANA_COLOR_VAR: Record<Color | 'C', string> = {
  W: 'var(--mana-w)',
  U: 'var(--mana-u)',
  B: 'var(--mana-b)',
  R: 'var(--mana-r)',
  G: 'var(--mana-g)',
  C: 'var(--mana-c)',
};

/** CSS background for a swatch representing 2+ colors: an even horizontal split. */
function comboSwatchBackground(colors: readonly Color[]): string {
  const n = colors.length;
  const stops = colors
    .map((c, i) => `${MANA_COLOR_VAR[c]} ${(i / n) * 100}% ${((i + 1) / n) * 100}%`)
    .join(', ');
  return `linear-gradient(90deg, ${stops})`;
}

interface Counts {
  colors: Record<Color, number>;
  c: number;
  any: number;
  /** Dual/tri-land counts, keyed by comboKey (e.g. "WU", "WUB"). */
  combos: Record<string, number>;
}

const MIN = 0;
const MAX = 12;

function clamp(n: number): number {
  return Math.min(MAX, Math.max(MIN, n));
}

function initialCounts(): Counts {
  return {
    colors: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    c: 0,
    any: 0,
    combos: Object.fromEntries([...DUAL_COMBOS, ...TRI_COMBOS].map((combo) => [comboKey(combo), 0])),
  };
}

/** Each unit of a stepper is one ManaSource: W/U/B/R/G units produce that
 * single color, C units produce ['C'], "Any" units produce all five colors,
 * and dual/tri-land units produce exactly their combo's colors (the source
 * can pay any ONE of them per spell — see canCast's bipartite matching). */
function buildOpenMana(counts: Counts): OpenMana {
  const sources: ManaSource[] = [];
  for (const color of COLOR_WHEEL) {
    for (let i = 0; i < counts.colors[color]; i++) sources.push({ produces: [color] });
  }
  for (let i = 0; i < counts.c; i++) sources.push({ produces: ['C'] });
  for (let i = 0; i < counts.any; i++) sources.push({ produces: [...COLOR_WHEEL] });
  for (const combo of [...DUAL_COMBOS, ...TRI_COMBOS]) {
    const key = comboKey(combo);
    const n = counts.combos[key] ?? 0;
    for (let i = 0; i < n; i++) sources.push({ produces: combo });
  }
  return { sources };
}

function totalOf(counts: Counts): number {
  return (
    Object.values(counts.colors).reduce((sum, n) => sum + n, 0) +
    counts.c +
    counts.any +
    Object.values(counts.combos).reduce((sum, n) => sum + n, 0)
  );
}

interface ManaInputProps {
  manaProvider: ManualManaProvider;
  /** WP9: when true, the steppers are hidden (auto/bridge mode is active)
   * without unmounting — counts and the ManualManaProvider subscription are
   * preserved so switching back to manual mode doesn't reset anything.
   * Omitted (or false) renders byte-identical to Phase 1. */
  hidden?: boolean;
}

/** Steppers (0–12) for each basic color, colorless, and "any color" (for
 * flexible/unknown sources), plus an expandable section of dual and
 * tri-land sources. Feeds ManualManaProvider.set() on every change. */
export function ManaInput({ manaProvider, hidden }: ManaInputProps) {
  const [counts, setCounts] = useState<Counts>(initialCounts);
  const [expanded, setExpanded] = useState(false);

  // Push to the provider from an effect — calling it inside the setCounts
  // updater runs during render and triggers React's setState-in-render warning.
  useEffect(() => {
    manaProvider.set(buildOpenMana(counts));
  }, [counts, manaProvider]);

  function updateColor(color: Color, delta: number) {
    setCounts((prev) => ({
      ...prev,
      colors: { ...prev.colors, [color]: clamp(prev.colors[color] + delta) },
    }));
  }
  function updateC(delta: number) {
    setCounts((prev) => ({ ...prev, c: clamp(prev.c + delta) }));
  }
  function updateAny(delta: number) {
    setCounts((prev) => ({ ...prev, any: clamp(prev.any + delta) }));
  }
  function updateCombo(key: string, delta: number) {
    setCounts((prev) => ({
      ...prev,
      combos: { ...prev.combos, [key]: clamp((prev.combos[key] ?? 0) + delta) },
    }));
  }
  function clearAll() {
    setCounts(initialCounts());
  }

  const total = totalOf(counts);

  return (
    <section className="mana-input" hidden={hidden}>
      <div className="mana-input-header">
        <h2>Open mana</h2>
        <div className="mana-input-header-actions">
          <span className="mana-total">
            {total} untapped source{total === 1 ? '' : 's'}
          </span>
          <button type="button" className="clear-all-btn" onClick={clearAll} disabled={total === 0}>
            Clear all
          </button>
        </div>
      </div>

      <div className="mana-steppers">
        {COLORS.map(({ key, label, className }) => (
          <Stepper
            key={key}
            label={label}
            className={className}
            value={counts.colors[key]}
            onChange={(delta) => updateColor(key, delta)}
          />
        ))}
        <Stepper label="C" className="mana-c" value={counts.c} onChange={updateC} />
        <Stepper label="Any" className="mana-any" value={counts.any} onChange={updateAny} />
      </div>

      <button
        type="button"
        className="dual-toggle"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className={`dual-toggle-caret ${expanded ? 'expanded' : ''}`} aria-hidden="true">
          ▸
        </span>
        Dual &amp; tri-lands
      </button>

      {expanded && (
        <div className="dual-section">
          <ComboGroup title="Dual lands" combos={DUAL_COMBOS} counts={counts.combos} onChange={updateCombo} />
          <ComboGroup title="Tri-lands" combos={TRI_COMBOS} counts={counts.combos} onChange={updateCombo} />
        </div>
      )}
    </section>
  );
}

interface ComboGroupProps {
  title: string;
  combos: readonly Color[][];
  counts: Record<string, number>;
  onChange: (key: string, delta: number) => void;
}

function ComboGroup({ title, combos, counts, onChange }: ComboGroupProps) {
  return (
    <div className="combo-group">
      <h3>{title}</h3>
      <div className="mana-steppers mana-steppers-compact">
        {combos.map((combo) => {
          const key = comboKey(combo);
          return (
            <Stepper
              key={key}
              label={key}
              compact
              swatchStyle={{ background: comboSwatchBackground(combo) }}
              value={counts[key] ?? 0}
              onChange={(delta) => onChange(key, delta)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface StepperProps {
  label: string;
  value: number;
  onChange: (delta: number) => void;
  className?: string;
  swatchStyle?: { background: string };
  compact?: boolean;
}

function Stepper({ label, value, onChange, className, swatchStyle, compact }: StepperProps) {
  return (
    <div className={['stepper', className, compact ? 'stepper-compact' : ''].filter(Boolean).join(' ')}>
      <div className="stepper-top">
        <span className="stepper-swatch" style={swatchStyle} aria-hidden="true" />
        <span className="stepper-label">{label}</span>
      </div>
      <button
        type="button"
        className="stepper-btn stepper-btn-up"
        onClick={() => onChange(1)}
        disabled={value >= MAX}
        aria-label={`increase ${label}`}
      >
        +
      </button>
      <span className="stepper-value">{value}</span>
      <button
        type="button"
        className="stepper-btn stepper-btn-down"
        onClick={() => onChange(-1)}
        disabled={value <= MIN}
        aria-label={`decrease ${label}`}
      >
        −
      </button>
    </div>
  );
}
