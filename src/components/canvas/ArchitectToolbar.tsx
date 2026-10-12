import React from 'react';
import {
  MousePointer,
  Lightbulb,
  ShieldAlert,
  Skull,
  Bus,
  Bath,
  Trash2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

export type ArchitectTool =
  | 'INSPECT'
  | 'STREETLIGHT'
  | 'POLICE_KIOSK'
  | 'PERP'
  | 'BUS_STOP'
  | 'RESTROOM'
  | 'DEMOLISH';

interface Props {
  selectedTool: ArchitectTool;
  onSelectTool: (tool: ArchitectTool) => void;
  onResetCustom: () => void;
  customCounts: {
    streetlights: number;
    policeKiosks: number;
    perps: number;
    busStops: number;
    restrooms: number;
  };
  threatCount: number;
  threatsDeterred: number;
}

export function ArchitectToolbar({
  selectedTool,
  onSelectTool,
  onResetCustom,
  customCounts,
  threatCount,
  threatsDeterred,
}: Props) {
  const tools: Array<{
    id: ArchitectTool;
    label: string;
    sublabel: string;
    icon: React.ReactNode;
    color: string;
    badgeCount?: number;
  }> = [
    {
      id: 'INSPECT',
      label: 'Inspect',
      sublabel: 'Select a person or map tile',
      icon: <MousePointer size={15} />,
      color: '#9eacbb',
    },
    {
      id: 'STREETLIGHT',
      label: 'Streetlight',
      sublabel: 'Illuminates dark alleys',
      icon: <Lightbulb size={15} />,
      color: '#d8bd7d',
      badgeCount: customCounts.streetlights,
    },
    {
      id: 'POLICE_KIOSK',
      label: 'Safety booth',
      sublabel: 'Adds a nearby safety point',
      icon: <ShieldAlert size={15} />,
      color: '#83afd7',
      badgeCount: customCounts.policeKiosks,
    },
    {
      id: 'PERP',
      label: 'Add risk',
      sublabel: 'Add a simulated safety risk',
      icon: <Skull size={15} />,
      color: '#df8990',
      badgeCount: customCounts.perps,
    },
    {
      id: 'BUS_STOP',
      label: 'Bus Stop',
      sublabel: 'Add a transit stop',
      icon: <Bus size={15} />,
      color: '#72b9a5',
      badgeCount: customCounts.busStops,
    },
    {
      id: 'RESTROOM',
      label: 'Restroom',
      sublabel: 'Add an accessible restroom',
      icon: <Bath size={15} />,
      color: '#a99acb',
      badgeCount: customCounts.restrooms,
    },
    {
      id: 'DEMOLISH',
      label: 'Remove item',
      sublabel: 'Remove an item you placed',
      icon: <Trash2 size={15} />,
      color: '#d9909a',
    },
  ];

  return (
    <div className="architect-toolbar-container">
      <div className="architect-header">
        <div className="architect-title-group">
          <Sparkles size={14} className="text-amber-400" />
          <span className="architect-title">Map tools</span>
          <span className="architect-instruction">Choose a tool, then click the map.</span>
        </div>
        <div className="threat-stats-pill">
          <span className="threat-active-badge">
          <Skull size={12} /> {threatCount} simulated risks
          </span>
          {threatsDeterred > 0 && (
            <span className="threat-deterred-badge">
              🛡️ {threatsDeterred} Deterred
            </span>
          )}
        </div>
      </div>

      <div className="architect-tools-row">
        {tools.map((t) => {
          const isActive = selectedTool === t.id;
          return (
            <button
              key={t.id}
              className={`architect-tool-btn ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTool(t.id)}
              aria-pressed={isActive}
              style={
                isActive
                  ? { borderColor: t.color, boxShadow: `0 0 14px ${t.color}40` }
                  : undefined
              }
              title={`${t.label}: ${t.sublabel}`}
            >
              <span className="tool-icon" style={{ color: t.color }}>
                {t.icon}
              </span>
              <span className="tool-label">{t.label}</span>
              {t.badgeCount !== undefined && t.badgeCount > 0 && (
                <span className="tool-counter" style={{ backgroundColor: t.color }}>
                  {t.badgeCount}
                </span>
              )}
            </button>
          );
        })}

        <button
          className="architect-reset-btn"
          onClick={onResetCustom}
          title="Remove all items and risks you placed on the map"
          aria-label="Reset placed map items"
        >
          <RotateCcw size={14} />
          <span>Reset</span>
        </button>
      </div>

      {selectedTool !== 'INSPECT' && (
        <div className="architect-hint-banner">
          <span>
            {selectedTool === 'STREETLIGHT' && 'Click an open map tile to place a streetlight.'}
            {selectedTool === 'POLICE_KIOSK' && 'Click an open map tile to add a safety booth.'}
            {selectedTool === 'PERP' && 'Click an open map tile to add a simulated risk.'}
            {selectedTool === 'BUS_STOP' && 'Click an open map tile to add a bus stop.'}
            {selectedTool === 'RESTROOM' && 'Click an open map tile to add an accessible restroom.'}
            {selectedTool === 'DEMOLISH' && 'Click one of your added items or risks to remove it.'}
          </span>
        </div>
      )}
    </div>
  );
}
