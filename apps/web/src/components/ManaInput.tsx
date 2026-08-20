import { useEffect, useState } from 'react';
import type { Color, ManaSource, OpenMana } from '@mtgatricks/core';
import type { ManualManaProvider } from '../manaProvider';

const COLORS: { key: Color; label: string; className: string }[] = [
  { key: 'W', label: 'W', className: 'mana-w' },
  { key: 'U', label: 'U', className: 'mana-u' },
  { key: 'B', label: 'B', className: 'mana-b' },
  { key: 'R', label: 'R', className: 'mana-r' },
  { key: 'G', label: 'G', className: 'mana-g' },
];

type Counts = Record<Color, number> & { C: number; any: number };

const INITIAL_COUNTS: Counts = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, any: 0 };
const MIN = 0;
const MAX = 12;

function clamp(n: number): number {
  return Math.min(MAX, Math.max(MIN, n));
}

/** Each unit of a stepper is one ManaSource; W/U/B/R/G units produce that
 * single color, C units produce ['C'], "Any" units produce all five colors. */
function buildOpenMana(counts: Counts): OpenMana {
  const sources: ManaSource[] = [];
  for (const { key: color } of COLORS) {
    for (let i = 0; i < counts[color]; i++) sources.push({ produces: [color] });
  }
  for (let i = 0; i < counts.C; i++) sources.push({ produces: ['C'] });
  for (let i = 0; i < counts.any; i++) sources.push({ produces: ['W', 'U', 'B', 'R', 'G'] });
  return { sources };
}

interface ManaInputProps {
  manaProvider: ManualManaProvider;
}

/** Steppers (0–12) for each basic color, colorless, and "any color" (for
 * flexible/unknown sources). Feeds ManualManaProvider.set() on every change. */
export function ManaInput({ manaProvider }: ManaInputProps) {
  const [counts, setCounts] = useState<Counts>(INITIAL_COUNTS);

  // Push to the provider from an effect — calling it inside the setCounts
  // updater runs during render and triggers React's setState-in-render warning.
  useEffect(() => {
    manaProvider.set(buildOpenMana(counts));
  }, [counts, manaProvider]);

  function updateCount(key: keyof Counts, delta: number) {
    setCounts((prev) => ({ ...prev, [key]: clamp(prev[key] + delta) }));
  }

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <section className="mana-input">
      <div className="mana-input-header">
        <h2>Open mana</h2>
        <span className="mana-total">{total} untapped source{total === 1 ? '' : 's'}</span>
      </div>
      <div className="mana-steppers">
        {COLORS.map(({ key, label, className }) => (
          <Stepper
            key={key}
            label={label}
            className={className}
            value={counts[key]}
            onChange={(delta) => updateCount(key, delta)}
          />
        ))}
        <Stepper label="C" className="mana-c" value={counts.C} onChange={(delta) => updateCount('C', delta)} />
        <Stepper
          label="Any"
          className="mana-any"
          value={counts.any}
          onChange={(delta) => updateCount('any', delta)}
        />
      </div>
    </section>
  );
}

interface StepperProps {
  label: string;
  className: string;
  value: number;
  onChange: (delta: number) => void;
}

function Stepper({ label, className, value, onChange }: StepperProps) {
  return (
    <div className={`stepper ${className}`}>
      <span className="stepper-swatch" aria-hidden="true" />
      <span className="stepper-label">{label}</span>
      <div className="stepper-controls">
        <button
          type="button"
          className="stepper-btn"
          onClick={() => onChange(-1)}
          disabled={value <= MIN}
          aria-label={`decrease ${label}`}
        >
          −
        </button>
        <span className="stepper-value">{value}</span>
        <button
          type="button"
          className="stepper-btn"
          onClick={() => onChange(1)}
          disabled={value >= MAX}
          aria-label={`increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
