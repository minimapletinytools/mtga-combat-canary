import type { Rarity, TrickResult } from '@mtgatricks/core';

export type SortDirection = 'common-first' | 'mythic-first';

interface TrickListProps {
  results: TrickResult[];
  direction: SortDirection;
  onDirectionChange: (direction: SortDirection) => void;
}

/** Groups an already rarity-sorted list into consecutive [rarity, items] runs. */
function groupByRarity(results: TrickResult[]): [Rarity, TrickResult[]][] {
  const groups: [Rarity, TrickResult[]][] = [];
  for (const result of results) {
    const rarity = result.card.rarity;
    const last = groups[groups.length - 1];
    if (last && last[0] === rarity) {
      last[1].push(result);
    } else {
      groups.push([rarity, [result]]);
    }
  }
  return groups;
}

/**
 * Cards castable at instant speed with the current mana, grouped under
 * rarity headers (in the order produced by sortTricks — no re-sorting here).
 * `results` is the *full* trick-search output; only castable ones render.
 */
export function TrickList({ results, direction, onDirectionChange }: TrickListProps) {
  const castable = results.filter((result) => result.castability.castable);
  const groups = groupByRarity(castable);

  return (
    <section className="trick-list">
      <div className="trick-list-toolbar">
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

      {castable.length === 0 ? (
        <div className="empty-state">
          <p>No tricks possible with this mana.</p>
        </div>
      ) : (
        <div className="trick-groups">
          {groups.map(([rarity, group]) => (
            <div key={rarity} className="rarity-group">
              <h2 className={`rarity-header rarity-${rarity}`}>
                {rarity}
                <span className="rarity-count">{group.length}</span>
              </h2>
              <div className="card-grid">
                {group.map((result) => (
                  <TrickCard key={result.card.id} result={result} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TrickCard({ result }: { result: TrickResult }) {
  const { card, castability } = result;
  const image = card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal;

  return (
    <a className="trick-card" href={card.scryfall_uri} target="_blank" rel="noreferrer">
      <div className="trick-card-image">
        {image ? (
          <img src={image} alt={card.name} loading="lazy" />
        ) : (
          <div className="trick-card-image-placeholder">{card.name}</div>
        )}
      </div>
      <div className="trick-card-info">
        <span className="trick-card-name">{card.name}</span>
        {(castability.usesXZero || castability.mayUseLife) && (
          <div className="trick-card-badges">
            {castability.usesXZero && <span className="badge badge-x">X=0</span>}
            {castability.mayUseLife && <span className="badge badge-life">via life</span>}
          </div>
        )}
      </div>
    </a>
  );
}
