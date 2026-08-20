import type { ArenaStatus, OpenMana } from '@mtgatricks/core';
import { summarizeOpenMana, type ManaSummaryKey } from '../manaSummary';

const SLOTS: { key: ManaSummaryKey; label: string; className: string }[] = [
  { key: 'W', label: 'W', className: 'mana-w' },
  { key: 'U', label: 'U', className: 'mana-u' },
  { key: 'B', label: 'B', className: 'mana-b' },
  { key: 'R', label: 'R', className: 'mana-r' },
  { key: 'G', label: 'G', className: 'mana-g' },
  { key: 'C', label: 'C', className: 'mana-c' },
  { key: 'any', label: 'Any', className: 'mana-any' },
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
}

/** Auto-mode counterpart to ManaInput: a read-only per-color breakdown of
 * the open mana detected via the Arena bridge, plus a tracking-status chip.
 * Rendered only when the bridge is present and auto mode is active. */
export function ManaAutoSummary({ mana, status }: ManaAutoSummaryProps) {
  const counts = summarizeOpenMana(mana);
  const total = mana.sources.length;
  const meta = status ? STATUS_META[status] : null;

  return (
    <section className="mana-input mana-auto-summary">
      <div className="mana-input-header">
        <h2>Open mana</h2>
        <div className="mana-auto-meta">
          {meta && <span className={`status-chip ${meta.className}`}>{meta.label}</span>}
          <span className="mana-total">
            {total} untapped source{total === 1 ? '' : 's'}
          </span>
        </div>
      </div>
      <div className="mana-steppers">
        {SLOTS.map(({ key, label, className }) => (
          <div key={key} className={`stepper stepper-readonly ${className}`}>
            <span className="stepper-swatch" aria-hidden="true" />
            <span className="stepper-label">{label}</span>
            <span className="stepper-value">{counts[key]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
