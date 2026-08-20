import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CachedCardRepository, IndexedDbStore } from '@mtgatricks/data';
import { App } from './App';
import { FixtureCardSource, type CardSource } from './cardSource';
import './styles.css';

// Flip to true to develop the UI against synthetic fixtures instead of the
// live Scryfall-backed repository.
const USE_FIXTURES = false;

const cardSource: CardSource = USE_FIXTURES
  ? new FixtureCardSource()
  : new CachedCardRepository(new IndexedDbStore());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App cardSource={cardSource} />
  </StrictMode>,
);
