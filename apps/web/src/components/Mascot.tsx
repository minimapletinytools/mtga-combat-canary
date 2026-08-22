import { useEffect, useState } from 'react';
import combatCanaryUrl from '../assets/combat-canary.png';

interface MascotOption {
  key: string;
  label: string;
  url: string;
}

// The three real cards are fetched from Scryfall's CDN, same as every other
// card image in the app — no need to bundle them. Combat Canary is a fan
// card with no Scryfall entry, so it's the one bundled local asset, and the
// default mascot (its flavor text is literally this app's whole premise).
const MASCOT_OPTIONS: MascotOption[] = [
  { key: 'combat-canary', label: 'Combat Canary', url: combatCanaryUrl },
  {
    key: 'judges-familiar',
    label: "Judge's Familiar",
    url: 'https://cards.scryfall.io/normal/front/e/d/ed363208-cf66-4205-8512-b999b67227d3.jpg',
  },
  {
    key: 'gilded-goose',
    label: 'Gilded Goose',
    url: 'https://cards.scryfall.io/normal/front/5/e/5ea59511-24b1-4925-9948-9d4c0d27d1c5.jpg',
  },
  {
    key: 'birds-of-paradise',
    label: 'Birds of Paradise',
    url: 'https://cards.scryfall.io/normal/front/4/9/492c2f9a-51e7-4e0f-9899-23bf43ea988b.jpg',
  },
];

const STORAGE_KEY = 'mtgatricks:mascot';
const DEFAULT_KEY = 'none';

/**
 * Owns the chosen-mascot state (persisted to localStorage) so it can be
 * shared between MascotControl (the corner dropdown) and MascotImage (the
 * card itself, shown in the Open mana panel) without two independent copies
 * drifting out of sync.
 */
export function useMascotSelection() {
  const [key, setKey] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? DEFAULT_KEY);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, key);
  }, [key]);

  return { key, setKey, selected: MASCOT_OPTIONS.find((o) => o.key === key) ?? null };
}

interface MascotControlProps {
  value: string;
  onChange: (key: string) => void;
}

/** The mascot picker: a small dropdown pinned to the page's upper-right
 * corner. Off by default. The chosen card renders elsewhere — see
 * MascotImage — so this control never grows with the selection. */
export function MascotControl({ value, onChange }: MascotControlProps) {
  return (
    <div className="mascot-control-panel">
      <div className="mascot-controls">
        <span className="mascot-label">Mascot</span>
        <select
          className="mascot-select"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Mascot"
        >
          <option value="none">Off</option>
          {MASCOT_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

interface MascotImageProps {
  selected: MascotOption;
}

/** The chosen mascot's card, shown at full size — rendered into the Open
 * mana panel's dedicated right-hand column (see .mana-input-mascot-col) so
 * it never pushes that panel's own content down. */
export function MascotImage({ selected }: MascotImageProps) {
  return <img className="mascot-image" src={selected.url} alt={selected.label} />;
}
