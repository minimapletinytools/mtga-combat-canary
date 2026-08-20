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
const DEFAULT_KEY = 'combat-canary';

/**
 * A small companion perched in the corner: pick a card and it's shown at
 * full size/opacity, top-right, "watching over" the app. On by default
 * (Combat Canary); choice persists across reloads.
 */
export function Mascot() {
  const [key, setKey] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? DEFAULT_KEY);
  const selected = MASCOT_OPTIONS.find((o) => o.key === key) ?? null;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, key);
  }, [key]);

  return (
    <div className="mascot-panel">
      <div className="mascot-controls">
        <span className="mascot-label">Mascot</span>
        <select
          className="mascot-select"
          value={key}
          onChange={(event) => setKey(event.target.value)}
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
      {selected && <img className="mascot-image" src={selected.url} alt={selected.label} />}
    </div>
  );
}
