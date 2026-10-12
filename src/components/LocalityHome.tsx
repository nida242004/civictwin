import React from 'react';
import { ArrowRight, Building2, Plus, Trash2 } from 'lucide-react';
import type { Scenario } from '../types/policy';

interface Props {
  sample: Scenario;
  localities: Scenario[];
  onOpen: (scenario: Scenario) => void;
  onCreate: () => void;
  onRemove: (id: string) => void;
  storageWarning: string | null;
}

function LocalityPreview({ scenario }: { scenario: Scenario }) {
  return (
    <div className="locality-preview" aria-hidden="true">
      {scenario.district.tiles.flatMap((row, y) =>
        row.map((tile, x) => (
          <span
            key={`${x}-${y}`}
            className={`preview-tile preview-${tile.type.toLowerCase()}`}
          />
        ))
      )}
    </div>
  );
}

function LocalityCard({
  scenario,
  isSample = false,
  onOpen,
  onRemove,
}: {
  scenario: Scenario;
  isSample?: boolean;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  const homeCount = scenario.district.tiles.flat().filter((tile) => tile.type === 'RESIDENTIAL').length;

  return (
    <article className="locality-card">
      <LocalityPreview scenario={scenario} />
      <div className="locality-card-body">
        <div className="locality-card-label">
          {isSample ? 'SAMPLE LOCALITY' : 'YOUR LOCALITY'}
        </div>
        <h2>{scenario.title}</h2>
        <p>{scenario.subtitle}</p>
        <div className="locality-card-stats">
          <span>{scenario.district.width} × {scenario.district.height} blocks</span>
          <span>{homeCount} home blocks</span>
          <span>{scenario.citizens.length} simulated residents</span>
        </div>
        <div className="locality-card-actions">
          <button className="locality-open-button" onClick={onOpen}>
            Open simulator <ArrowRight size={15} />
          </button>
          {onRemove && (
            <button
              className="locality-delete-button"
              onClick={onRemove}
              aria-label={`Delete ${scenario.title}`}
              title="Delete locality"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function LocalityHome({ sample, localities, onOpen, onCreate, onRemove, storageWarning }: Props) {
  return (
    <main className="locality-home-page">
      <header className="locality-home-header">
        <div className="locality-home-brand">
          <span className="locality-home-brand-icon"><Building2 size={22} /></span>
          <div>
            <p className="locality-eyebrow">CIVICTWIN · URBAN POLICY SIMULATOR</p>
            <h1>Your localities</h1>
          </div>
        </div>
        <button className="locality-create-button" onClick={onCreate}>
          <Plus size={17} /> Create a locality
        </button>
      </header>

      <section className="locality-welcome">
        <span className="locality-eyebrow">PLAN A PLACE. TEST AN IDEA.</span>
        <h2>Explore a sample or design your own neighborhood.</h2>
        <p>
          Place homes, shops, parks and essential services on a simple map. Then explore how
          neighborhood changes could affect the people who live there.
        </p>
      </section>

      <section className="locality-list-section">
        <div className="locality-section-heading">
          <div>
            <h2>Start exploring</h2>
            <p>Open a locality to view its map and test policy ideas.</p>
          </div>
          <span>{localities.length + 1} {localities.length === 0 ? 'locality' : 'localities'}</span>
        </div>

        <div className="locality-card-grid">
          <LocalityCard
            scenario={sample}
            isSample
            onOpen={() => onOpen(sample)}
          />
          {localities.map((scenario) => (
            <LocalityCard
              key={scenario.id}
              scenario={scenario}
              onOpen={() => onOpen(scenario)}
              onRemove={() => {
                if (window.confirm(`Delete "${scenario.title}" from your saved localities?`)) {
                  onRemove(scenario.id);
                }
              }}
            />
          ))}
          <button className="locality-new-card" onClick={onCreate}>
            <span><Plus size={22} /></span>
            <strong>Design your own locality</strong>
            <small>Arrange the neighborhood, one map tile at a time.</small>
          </button>
        </div>
      </section>
      {storageWarning && <p className="locality-storage-warning" role="status">{storageWarning}</p>}
      <footer className="locality-home-footer">
        Simulations use synthetic residents and simplified assumptions. They are for exploration, not real-world forecasts.
      </footer>
    </main>
  );
}
