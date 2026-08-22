import type { ReactNode } from 'react';
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
  unresolvedCount: number | null;
  mode: ManaMode;
  onModeChange: (mode: ManaMode) => void;
  /** The chosen mascot's card (or null when off) — rendered into whichever
   * variant is visible, in its dedicated right-hand column. Selection lives
   * in App and is picked via the corner MascotControl, not here. */
  mascotImage: ReactNode;
}

/**
 * WP9 seam. With no Electron bridge (`bridgeManaProvider` null) this renders
 * exactly `<ManaInput hidden={false} />` — no toggle, no chip, no extra DOM
 * around it — identical to Phase 1's web behavior.
 *
 * With a bridge: a mode toggle appears, rendered inline in whichever variant
 * is currently visible (next to the status chip in auto mode, next to the
 * source count in manual mode) rather than as a separate row that pushes
 * everything else down. In auto mode the steppers are hidden (not
 * unmounted, so manual counts survive switching back) and a read-only
 * per-color summary + status chip is shown instead; in manual mode it's
 * today's steppers, exactly.
 */
export function ManaSection({
  manualManaProvider,
  bridgeManaProvider,
  mana,
  bridgeStatus,
  unresolvedCount,
  mode,
  onModeChange,
  mascotImage,
}: ManaSectionProps) {
  const autoActive = bridgeManaProvider !== null && mode === 'auto';

  const toggleButton = bridgeManaProvider && (
    <button
      type="button"
      className="mode-toggle-btn"
      onClick={() => onModeChange(mode === 'auto' ? 'manual' : 'auto')}
    >
      {mode === 'auto' ? 'Manual override' : 'Auto (MTGA)'}
    </button>
  );

  return (
    <>
      <ManaInput
        manaProvider={manualManaProvider}
        hidden={autoActive}
        toggleButton={autoActive ? null : toggleButton}
        mascotImage={mascotImage}
      />
      {autoActive && (
        <ManaAutoSummary
          mana={mana}
          status={bridgeStatus}
          unresolvedCount={unresolvedCount}
          toggleButton={toggleButton}
          mascotImage={mascotImage}
        />
      )}
    </>
  );
}
