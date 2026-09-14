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
  // In sets with cycling abilities, provide a default-on option to hide them
  const hasCycling = results.some((result) => result.isCycling || result.reason === 'cycling');
  const [hideCycling, setHideCycling] = useState(true);

  const displayedResults =
    hasCycling && hideCycling
      ? results.filter((result) => !result.isCycling && result.reason !== 'cycling')
      : results;

  const castable = displayedResults.filter((result) => result.castability.castable);
  const cyclingCount = results.filter((result) => result.isCycling || result.reason === 'cycling').length;

  return (
    <section className="trick-list">
      <div className="trick-list-toolbar">
        <p className="status-line">
          {castable.length} of {displayedResults.length} instant-speed cards castable
        </p>
        <div className="trick-list-actions">
          {hasCycling && (
            <label
              className="cycling-toggle"
              title="Cycling abilities draw or search for lands and do not affect combat directly"
            >
              <input
                type="checkbox"
                id="trick-hide-cycling"
                checked={hideCycling}
                onChange={(event) => setHideCycling(event.target.checked)}
              />
              <span>Hide cycling ({cyclingCount})</span>
            </label>
          )}
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
  const tag =
    result.abilityName ??
    (result.reason === 'cycling' ? 'Cycling' : result.reason === 'ability' ? 'Ability' : null);
  const tooltipTitle = result.abilityText ? `${card.name}\n${result.abilityText}` : card.name;

  return (
    <a
      className="trick-card"
      href={card.scryfall_uri}
      target="_blank"
      rel="noreferrer"
      title={tooltipTitle}
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
      {tag && (
        <span className={`trick-card-badge ${result.isCycling ? 'badge-cycling' : 'badge-ability'}`}>
          {tag}
        </span>
      )}
      {hovered && image && (
        <img className="trick-card-preview" src={image} alt="" aria-hidden="true" />
      )}
    </a>
  );
}
