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
      sublabel: 'Click any person or spot',
      icon: <MousePointer size={15} />,
      color: '#94a3b8',
    },
    {
      id: 'STREETLIGHT',
      label: 'Streetlight',
      sublabel: 'Illuminates dark alleys',
      icon: <Lightbulb size={15} />,
      color: '#f59e0b',
      badgeCount: customCounts.streetlights,
    },
    {
      id: 'POLICE_KIOSK',
      label: 'Police Booth',
      sublabel: 'Chases perps in 4 tiles',
      icon: <ShieldAlert size={15} />,
      color: '#38bdf8',
      badgeCount: customCounts.policeKiosks,
    },
    {
      id: 'PERP',
      label: 'Spawn Perp',
      sublabel: 'Place lurker in dark zone',
      icon: <Skull size={15} />,
      color: '#ef4444',
      badgeCount: customCounts.perps,
    },
    {
      id: 'BUS_STOP',
      label: 'Bus Stop',
      sublabel: 'Transit safe hop node',
      icon: <Bus size={15} />,
      color: '#10b981',
      badgeCount: customCounts.busStops,
    },
    {
      id: 'RESTROOM',
      label: 'Restroom',
      sublabel: 'Universal hygiene pod',
      icon: <Bath size={15} />,
      color: '#a855f7',
      badgeCount: customCounts.restrooms,
    },
    {
      id: 'DEMOLISH',
      label: 'Bulldoze',
      sublabel: 'Remove placed item',
      icon: <Trash2 size={15} />,
      color: '#f43f5e',
    },
  ];

  return (
    <div className="architect-toolbar-container">
      <div className="architect-header">
        <div className="architect-title-group">
          <Sparkles size={14} className="text-amber-400" />
          <span className="architect-title">Urban Architect & Crime Sandbox</span>
        </div>
        <div className="threat-stats-pill">
          <span className="threat-active-badge">
            <Skull size={12} /> {threatCount} Active Threats
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
          title="Reset all custom placed amenities & perps"
        >
          <RotateCcw size={14} />
          <span>Reset</span>
        </button>
      </div>

      {selectedTool !== 'INSPECT' && (
        <div className="architect-hint-banner">
          <span>
            {selectedTool === 'STREETLIGHT' && '💡 Click any ground tile to install a streetlight with golden volumetric lighting.'}
            {selectedTool === 'POLICE_KIOSK' && '👮 Click any tile to build a Police SOS Booth. Automatically repels criminals.'}
            {selectedTool === 'PERP' && '🦹 Click any unlit alley to place a suspicious lurker waiting in shadows.'}
            {selectedTool === 'BUS_STOP' && '🚌 Click any road or sidewalk to place a safe transit boarding hub.'}
            {selectedTool === 'RESTROOM' && '🚻 Click any sidewalk to place an accessible public restroom pod.'}
            {selectedTool === 'DEMOLISH' && '❌ Click any placed streetlight, booth, or perp on the map to remove it.'}
          </span>
        </div>
      )}
    </div>
  );
}
