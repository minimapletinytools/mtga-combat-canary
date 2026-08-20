import { useState, type ReactNode } from 'react';
import type { ArenaStatus, Color, OpenMana } from '@mtgatricks/core';
import { summarizeOpenMana, summarizeCombos, type ManaSummaryKey } from '../manaSummary';
import { manaFillBackground } from '../manaFill';
import { ALL_COMBO_KEYS, splitComboKey } from '../manaCombos';

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
  /** Untapped opponent lands whose colors couldn't be resolved from the log
   * (neither the Scryfall map nor the subtype fallback had an answer). Null
   * until the bridge's first report. Log-tailing only — there's no manual
   * equivalent, since manual entry never has an "unknown" source. */
  unresolvedCount: number | null;
  toggleButton?: ReactNode;
}

/** Auto-mode counterpart to ManaInput: a read-only per-color breakdown of
 * the open mana detected via the Arena bridge (plus an "Other" bucket for
 * unresolved lands), a read-only dual/tri-land section that auto-expands
 * the moment one is detected, and the tracking-status chip. Rendered only
 * when the bridge is present and auto mode is active. */
export function ManaAutoSummary({ mana, status, unresolvedCount, toggleButton }: ManaAutoSummaryProps) {
  const counts = summarizeOpenMana(mana);
  const comboCounts = summarizeCombos(mana);
  const total = mana.sources.length;
  const meta = status ? STATUS_META[status] : null;

  const activeCombos = ALL_COMBO_KEYS.filter((key) => (comboCounts[key] ?? 0) > 0);
  const hasCombo = activeCombos.length > 0;
  // null = follow detection automatically; once the user clicks the toggle,
  // their explicit choice wins until they click it again.
  const [manualExpand, setManualExpand] = useState<boolean | null>(null);
  const expanded = manualExpand ?? hasCombo;

  return (
    <section className="mana-input mana-auto-summary">
      <div className="mana-input-header">
        <div className="mana-input-title">
          <h2>Open mana</h2>
          <span className="mana-total">
            {total} untapped source{total === 1 ? '' : 's'}
          </span>
        </div>
        <div className="mana-auto-meta">
          {toggleButton}
          {meta && <span className={`status-chip ${meta.className}`}>{meta.label}</span>}
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
        {unresolvedCount !== null && (
          <div
            className="stepper stepper-readonly stepper-other"
            title="Untapped opponent lands whose colors couldn't be resolved from the log"
          >
            <span className="stepper-label">Other</span>
            <span className="stepper-value">{unresolvedCount}</span>
          </div>
        )}
      </div>

      <button
        type="button"
        className="dual-toggle"
        onClick={() => setManualExpand(!expanded)}
        aria-expanded={expanded}
      >
        <span className={`dual-toggle-caret ${expanded ? 'expanded' : ''}`} aria-hidden="true">
          ▸
        </span>
        Dual &amp; tri-lands
      </button>

      {expanded && (
        <div className="dual-section">
          {hasCombo ? (
            <div className="mana-steppers mana-steppers-compact">
              {activeCombos.map((key) => (
                <div
                  key={key}
                  className="stepper stepper-readonly stepper-compact"
                  style={{ background: manaFillBackground(splitComboKey(key)) }}
                >
                  <span className="stepper-label">{key}</span>
                  <span className="stepper-value">{comboCounts[key]}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="dual-section-empty">No dual/tri-lands detected yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
