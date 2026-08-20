import type { ArenaStatus, OpenMana } from '@mtgatricks/core';
import type { BridgeManaProvider } from '../bridgeManaProvider';
import type { ManualManaProvider } from '../manaProvider';
import { ManaInput } from './ManaInput';
import { ManaAutoSummary } from './ManaAutoSummary';

export type ManaMode = 'auto' | 'manual';

interface ManaSectionProps {
  manualManaProvider: ManualManaProvider;
  bridgeManaProvider: BridgeManaProvider | null;
  mana: OpenMana;
  bridgeStatus: ArenaStatus | null;
  mode: ManaMode;
  onModeChange: (mode: ManaMode) => void;
}

/**
 * WP9 seam. With no Electron bridge (`bridgeManaProvider` null) this renders
 * exactly `<ManaInput hidden={false} />` — no toggle, no chip, no extra DOM
 * around it — identical to Phase 1's web behavior.
 *
 * With a bridge: a mode toggle appears; in auto mode the steppers are
 * hidden (not unmounted, so manual counts survive switching back) and a
 * read-only per-color summary + status chip is shown instead; in manual
 * mode it's today's steppers, exactly.
 */
export function ManaSection({
  manualManaProvider,
  bridgeManaProvider,
  mana,
  bridgeStatus,
  mode,
  onModeChange,
}: ManaSectionProps) {
  const autoActive = bridgeManaProvider !== null && mode === 'auto';

  return (
    <>
      {bridgeManaProvider && (
        <div className="mana-mode-toggle-row">
          <button
            type="button"
            className="mode-toggle-btn"
            onClick={() => onModeChange(mode === 'auto' ? 'manual' : 'auto')}
          >
            {mode === 'auto' ? 'Manual override' : 'Auto (MTGA)'}
          </button>
        </div>
      )}
      <ManaInput manaProvider={manualManaProvider} hidden={autoActive} />
      {autoActive && <ManaAutoSummary mana={mana} status={bridgeStatus} />}
    </>
  );
}
