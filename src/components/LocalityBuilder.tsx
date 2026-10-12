import React, { useMemo, useState } from 'react';
import { ArrowLeft, Building2, Bus, Check, Hospital, House, MapPin, School, Trees } from 'lucide-react';
import type { Scenario } from '../types/policy';
import type { DistrictGrid, TileType } from '../types/urban';
import { createEmptyLocalityGrid, createLocalityScenario } from '../simulation/localities';

interface Props {
  onSave: (scenario: Scenario) => void;
  onCancel: () => void;
}

const tileOptions: Array<{ type: TileType; label: string; icon: React.ReactNode }> = [
  { type: 'RESIDENTIAL', label: 'Homes', icon: <House size={16} /> },
  { type: 'COMMERCIAL', label: 'Shops', icon: <Building2 size={16} /> },
  { type: 'SCHOOL', label: 'School', icon: <School size={16} /> },
  { type: 'CLINIC', label: 'Clinic', icon: <Hospital size={16} /> },
  { type: 'TRANSIT_HUB', label: 'Transit', icon: <Bus size={16} /> },
  { type: 'PARK', label: 'Park', icon: <Trees size={16} /> },
  { type: 'ROAD', label: 'Road', icon: <MapPin size={16} /> },
  { type: 'SIDEWALK', label: 'Sidewalk', icon: <Check size={16} /> },
  { type: 'DARK_ALLEY', label: 'Dark area', icon: <MapPin size={16} /> },
  { type: 'GRASS', label: 'Open space', icon: <Trees size={16} /> },
];

function tileProperties(type: TileType) {
  switch (type) {
    case 'RESIDENTIAL':
      return { name: 'Homes', height: 2.4, isWalkable: false, fearFactor: 0.1 };
    case 'COMMERCIAL':
      return { name: 'Shops', height: 1.8, isWalkable: false, fearFactor: 0.1 };
    case 'SCHOOL':
      return { name: 'School', height: 2.2, isWalkable: false, fearFactor: 0.1 };
    case 'CLINIC':
      return { name: 'Clinic', height: 2.2, isWalkable: false, fearFactor: 0.1 };
    case 'TRANSIT_HUB':
      return { name: 'Transit hub', height: 0, isWalkable: true, fearFactor: 0.1 };
    case 'PARK':
      return { name: 'Park', height: 0, isWalkable: true, fearFactor: 0.3 };
    case 'DARK_ALLEY':
      return { name: 'Dark area', height: 0, isWalkable: true, fearFactor: 0.8 };
    case 'ROAD':
      return { name: 'Road', height: 0, isWalkable: true, fearFactor: 0.2 };
    case 'GRASS':
      return { name: 'Open space', height: 0, isWalkable: true, fearFactor: 0.1 };
    default:
      return { name: 'Sidewalk', height: 0, isWalkable: true, fearFactor: 0.1 };
  }
}

function paintTile(grid: DistrictGrid, x: number, y: number, type: TileType): DistrictGrid {
  const props = tileProperties(type);
  const tiles = grid.tiles.map((row, rowIndex) =>
    row.map((tile, columnIndex) =>
      rowIndex === y && columnIndex === x
        ? { ...tile, ...props, type }
        : tile
    )
  );
  return { ...grid, tiles };
}

export function LocalityBuilder({ onSave, onCancel }: Props) {
  const [name, setName] = useState('');
  const [selectedTile, setSelectedTile] = useState<TileType>('RESIDENTIAL');
  const [grid, setGrid] = useState(createEmptyLocalityGrid);

  const counts = useMemo(() => {
    const tiles = grid.tiles.flat();
    return {
      homes: tiles.filter((tile) => tile.type === 'RESIDENTIAL').length,
      destinations: tiles.filter((tile) =>
        ['COMMERCIAL', 'SCHOOL', 'CLINIC', 'TRANSIT_HUB', 'PARK'].includes(tile.type)
      ).length,
    };
  }, [grid]);

  const localityPreview = useMemo(
    () => createLocalityScenario(name.trim() || 'New locality', grid),
    [name, grid]
  );
  const routeableResidents = localityPreview.citizens.filter(
    (citizen) => citizen.origin.x !== citizen.destination.x || citizen.origin.y !== citizen.destination.y
  ).length;
  const canSave =
    name.trim().length > 0 &&
    counts.homes > 0 &&
    counts.destinations > 0 &&
    routeableResidents > 0;

  return (
    <main className="locality-builder-page">
      <button className="locality-back-button" onClick={onCancel}>
        <ArrowLeft size={16} /> Back to localities
      </button>

      <header className="locality-builder-heading">
        <div>
          <span className="locality-eyebrow">YOUR NEIGHBORHOOD</span>
          <h1>Design a locality</h1>
          <p>Give it a name, choose a map tool, then click tiles to place homes and places.</p>
        </div>
        <div className="builder-progress">
          <span className={name.trim() ? 'complete' : ''}>1. Name it</span>
          <span className={counts.homes && counts.destinations ? 'complete' : ''}>2. Place features</span>
          <span className={canSave ? 'complete' : ''}>3. Save</span>
        </div>
      </header>

      <section className="locality-builder-layout">
        <div className="locality-map-panel">
          <div className="locality-map-title">
            <div>
              <h2>{name.trim() || 'Your locality map'}</h2>
              <p>16 × 16 blocks · All tiles are editable</p>
            </div>
            <div className="builder-map-counts">
              <span>{counts.homes} home{counts.homes === 1 ? '' : 's'}</span>
              <span>{counts.destinations} destination{counts.destinations === 1 ? '' : 's'}</span>
                <span>{routeableResidents} simulated resident{routeableResidents === 1 ? '' : 's'}</span>
            </div>
          </div>

          <div className="locality-grid-wrap">
            <div className="locality-grid" aria-label="Editable locality map">
              {grid.tiles.flatMap((row, y) =>
                row.map((tile, x) => (
                  <button
                    key={`${x}-${y}`}
                    type="button"
                    className={`locality-grid-tile tile-${tile.type.toLowerCase()}${selectedTile === tile.type ? ' selected-tile' : ''}`}
                    title={`${tile.name}, block ${x + 1}, ${y + 1}. Click to place ${tileOptions.find((option) => option.type === selectedTile)?.label}.`}
                    aria-label={`${tile.name}, block ${x + 1}, ${y + 1}`}
                    onClick={() => setGrid((current) => paintTile(current, x, y, selectedTile))}
                  >
                    {tile.type === 'RESIDENTIAL' ? 'H' : ''}
                  </button>
                ))
              )}
            </div>
          </div>
          <p className="locality-map-help">
            Tip: place homes beside sidewalks, then add at least one destination such as shops, a park, or transit.
          </p>
        </div>

        <aside className="locality-builder-controls">
          <label className="locality-name-field">
            Locality name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={50}
              placeholder="e.g. Riverside Quarter"
              autoFocus
            />
          </label>

          <div className="locality-tool-picker">
            <h2>Choose what to place</h2>
            <p>Select a tool, then paint that feature onto the map.</p>
            <div className="locality-tool-grid">
              {tileOptions.map((option) => (
                <button
                  key={option.type}
                  className={`locality-tool-button${selectedTile === option.type ? ' active' : ''}`}
                  type="button"
                  aria-pressed={selectedTile === option.type}
                  onClick={() => setSelectedTile(option.type)}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="locality-builder-note">
            <strong>What happens next?</strong>
            <p>We create a small set of synthetic residents from your home locations and simulate trips to the places you add.</p>
          </div>

          <button
            className="locality-save-button"
            disabled={!canSave}
            onClick={() => onSave(localityPreview)}
          >
            Save locality and open simulator
          </button>
          {!canSave && (
            <p className="locality-validation">
              Enter a name, add a home and destination, and leave a walkable route between them.
            </p>
          )}
        </aside>
      </section>
    </main>
  );
}
