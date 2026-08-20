import type { SetInfo } from '@mtgatricks/core';

interface SetPickerProps {
  sets: SetInfo[] | null;
  selectedCode: string | null;
  onSelect: (code: string) => void;
  loadingSets: boolean;
  loadingCards: boolean;
}

/** Dropdown of sets (newest first), plus a "downloading set…" state while
 * the chosen set's cards are being fetched. */
export function SetPicker({ sets, selectedCode, onSelect, loadingSets, loadingCards }: SetPickerProps) {
  const sorted = sets ? [...sets].sort((a, b) => b.released_at.localeCompare(a.released_at)) : null;

  return (
    <section className="set-picker">
      <label htmlFor="set-picker-select">Set</label>
      {loadingSets || !sorted ? (
        <p className="loading-text">loading sets…</p>
      ) : sorted.length === 0 ? (
        <p className="loading-text">no sets available</p>
      ) : (
        <select
          id="set-picker-select"
          value={selectedCode ?? sorted[0]!.code}
          onChange={(event) => onSelect(event.target.value)}
        >
          {sorted.map((set) => (
            <option key={set.code} value={set.code}>
              {set.name} ({set.released_at.slice(0, 4)})
            </option>
          ))}
        </select>
      )}
      {loadingCards && <p className="loading-text">downloading set…</p>}
    </section>
  );
}
