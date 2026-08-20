import type { ReactNode } from 'react';
import type { ArenaStatus, Color, OpenMana } from '@mtgatricks/core';
import { summarizeOpenMana, type ManaSummaryKey } from '../manaSummary';
import { manaFillBackground } from '../manaFill';

const SLOTS: { key: ManaSummaryKey; label: string; colors: ReadonlyArray<Color | 'C'> }[] = [
  { key: 'W', label: 'W', colors: ['W'] },
  { key: 'U', label: 'U', colors: ['U'] },
  { key: 'B', label: 'B', colors: ['B'] },
  { key: 'R', label: 'R', colors: ['R'] },
  { key: 'G', label: 'G', colors: ['G'] },
  { key: 'C', label: 'C', colors: ['C'] },
  { key: 'any', label: 'Any', colors: ['W', 'U', 'B', 'R', 'G'] },
];

const STATUS_META: Record<ArenaStatus, { label: string; className: string }> = {
  tracking: { label: 'Tracking MTGA', className: 'status-chip-tracking' },
  'no-log': { label: 'MTGA log not found', className: 'status-chip-no-log' },
  'log-stale': { label: 'Waiting for a game…', className: 'status-chip-stale' },
  'parse-error': { label: 'Log parse error', className: 'status-chip-error' },
};

interface ManaAutoSummaryProps {
  mana: OpenMana;
  status: ArenaStatus | null;
  /** The auto/manual mode toggle, rendered right next to the status chip
   * so it sits in the flow instead of a separate row above. */
  toggleButton?: ReactNode;
}

/** Auto-mode counterpart to ManaInput: a read-only per-color breakdown of
 * the open mana detected via the Arena bridge, plus a tracking-status chip.
 * Rendered only when the bridge is present and auto mode is active. */
export function ManaAutoSummary({ mana, status, toggleButton }: ManaAutoSummaryProps) {
  const counts = summarizeOpenMana(mana);
  const total = mana.sources.length;
  const meta = status ? STATUS_META[status] : null;

  return (
    <section className="mana-input mana-auto-summary">
      <div className="mana-input-header">
        <h2>Open mana</h2>
        <div className="mana-auto-meta">
          {meta && <span className={`status-chip ${meta.className}`}>{meta.label}</span>}
          {toggleButton}
          <span className="mana-total">
            {total} untapped source{total === 1 ? '' : 's'}
          </span>
        </div>
      </div>
      <div className="mana-steppers">
        {SLOTS.map(({ key, label, colors }) => (
          <div
            key={key}
            className="stepper stepper-readonly"
            style={{ background: manaFillBackground(colors) }}
          >
            <span className="stepper-label">{label}</span>
            <span className="stepper-value">{counts[key]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
