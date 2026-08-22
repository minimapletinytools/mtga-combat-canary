import { useState } from 'react';
import type { TrickResult } from '@mtgatricks/core';

export type SortDirection = 'common-first' | 'mythic-first';

interface TrickListProps {
  results: TrickResult[];
  direction: SortDirection;
  onDirectionChange: (direction: SortDirection) => void;
}

/**
 * Cards castable at instant speed with the current mana, in a single grid
 * ordered left-to-right/top-to-bottom by rarity (the order produced by
 * sortTricks — no re-sorting or re-grouping here). `results` is the *full*
 * trick-search output; only castable ones render.
 */
export function TrickList({ results, direction, onDirectionChange }: TrickListProps) {
  const castable = results.filter((result) => result.castability.castable);

  return (
    <section className="trick-list">
      <div className="trick-list-toolbar">
        <p className="status-line">
          {castable.length} of {results.length} instant-speed cards castable
        </p>
        <div className="sort-control">
          <label htmlFor="trick-sort-direction">Sort</label>
          <select
            id="trick-sort-direction"
            value={direction}
            onChange={(event) => onDirectionChange(event.target.value as SortDirection)}
          >
            <option value="common-first">Common first</option>
            <option value="mythic-first">Mythic first</option>
          </select>
        </div>
      </div>

      {castable.length === 0 ? (
        <div className="empty-state">
          <p>No tricks possible with this mana.</p>
        </div>
      ) : (
        <div className="card-grid">
          {castable.map((result) => (
            <TrickCard key={result.card.id} result={result} />
          ))}
        </div>
      )}
    </section>
  );
}

function TrickCard({ result }: { result: TrickResult }) {
  const [hovered, setHovered] = useState(false);
  const { card } = result;
  const image = card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal;

  return (
    <a
      className="trick-card"
      href={card.scryfall_uri}
      target="_blank"
      rel="noreferrer"
      title={card.name}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="trick-card-image">
        {image ? (
          <img src={image} alt={card.name} loading="lazy" />
        ) : (
          <div className="trick-card-image-placeholder">{card.name}</div>
        )}
      </div>
      {hovered && image && (
        <img className="trick-card-preview" src={image} alt="" aria-hidden="true" />
      )}
    </a>
  );
}
