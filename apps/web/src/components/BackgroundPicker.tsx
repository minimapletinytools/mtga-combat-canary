import { useEffect, useState } from 'react';
import coalmineCanaryUrl from '../assets/coalmine-canary.png';

interface BackgroundOption {
  key: string;
  label: string;
  url: string;
}

// The three real cards are fetched from Scryfall's CDN, same as every other
// card image in the app — no need to bundle them. Coalmine Canary is a fan
// card with no Scryfall entry, so it's the one bundled local asset.
const BACKGROUND_OPTIONS: BackgroundOption[] = [
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
  {
    key: 'coalmine-canary',
    label: 'Coalmine Canary',
    url: coalmineCanaryUrl,
  },
];

const STORAGE_KEY = 'mtgatricks:bgEasterEgg';

/**
 * Easter egg: an almost-invisible control tucked in the corner that tiles a
 * chosen card as a faint (20% opacity) repeating background wash. Off by
 * default; choice persists across reloads.
 */
export function BackgroundPicker() {
  const [key, setKey] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? 'none');
  const selected = BACKGROUND_OPTIONS.find((o) => o.key === key) ?? null;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, key);
  }, [key]);

  return (
    <>
      {selected && (
        <div className="bg-layer" style={{ backgroundImage: `url(${selected.url})` }} aria-hidden="true" />
      )}
      <footer className="egg-footer">
        <select
          className="egg-select"
          value={key}
          onChange={(event) => setKey(event.target.value)}
          aria-label="Background"
        >
          <option value="none">·</option>
          {BACKGROUND_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </footer>
    </>
  );
}
