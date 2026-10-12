import React, { useEffect } from 'react';
import { Play, Pause, Sun, Moon, Eye, Flame } from 'lucide-react';

interface Props {
  currentHour: number;
  onSetHour: React.Dispatch<React.SetStateAction<number>>;
  isPlaying: boolean;
  onTogglePlay: () => void;
  speed: number;
  onSetSpeed: (speed: number) => void;
  viewMode: 'REALISTIC' | 'FEAR_HEATMAP' | 'FOOT_TRAFFIC';
  onSetViewMode: (mode: 'REALISTIC' | 'FEAR_HEATMAP' | 'FOOT_TRAFFIC') => void;
}

export function TimeScrubber({
  currentHour,
  onSetHour,
  isPlaying,
  onTogglePlay,
  speed,
  onSetSpeed,
  viewMode,
  onSetViewMode,
}: Props) {
  // Automated playback ticker
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      onSetHour((prev: number) => {
        const next = prev + 0.05 * speed;
        return next >= 24 ? 0 : Math.round(next * 100) / 100;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, speed, onSetHour]);

  const formatDisplayTime = (hour: number) => {
    const norm = ((hour % 24) + 24) % 24;
    const h = Math.floor(norm);
    const m = Math.floor((norm - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const isNight = currentHour >= 18 || currentHour < 6;

  return (
    <div className="time-scrubber-card">
      <div className="scrubber-top-row">
        {/* Play/Pause & Clock */}
        <div className="playback-controls">
          <button className="play-btn" onClick={onTogglePlay}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
          </button>

          <div className="time-clock-badge">
            {isNight ? (
              <Moon size={16} className="text-amber-300" />
            ) : (
              <Sun size={16} className="text-yellow-400" />
            )}
            <span className="time-clock-text">{formatDisplayTime(currentHour)}</span>
            <span className="time-period-tag">{isNight ? 'Night' : 'Day'}</span>
          </div>

          {/* Speed Selectors */}
          <div className="speed-pills">
            {[1, 2, 5].map((s) => (
              <button
                key={s}
                className={`speed-pill ${speed === s ? 'active' : ''}`}
                onClick={() => onSetSpeed(s)}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Quick Jump Buttons */}
        <div className="preset-jump-buttons">
          <button
            className={`preset-btn ${Math.abs(currentHour - 23.5) < 0.2 ? 'active' : ''}`}
            onClick={() => onSetHour(23.5)}
          >
            🌙 23:30 Midnight Shift Peak
          </button>
          <button
            className={`preset-btn ${Math.abs(currentHour - 18.5) < 0.2 ? 'active' : ''}`}
            onClick={() => onSetHour(18.5)}
          >
            🌆 18:30 Evening Dusk
          </button>
          <button
            className={`preset-btn ${Math.abs(currentHour - 7.5) < 0.2 ? 'active' : ''}`}
            onClick={() => onSetHour(7.5)}
          >
            🌅 07:30 Morning Rush
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="view-mode-toggle">
          <button
            className={`view-btn ${viewMode === 'REALISTIC' ? 'active' : ''}`}
            onClick={() => onSetViewMode('REALISTIC')}
          >
            <Eye size={14} />
            <span>3D Town</span>
          </button>
          <button
            className={`view-btn ${viewMode === 'FEAR_HEATMAP' ? 'active' : ''}`}
            onClick={() => onSetViewMode('FEAR_HEATMAP')}
          >
            <Flame size={14} />
            <span>Fear Heatmap</span>
          </button>
        </div>
      </div>

      {/* Range Slider */}
      <div className="scrubber-slider-row">
        <input
          type="range"
          min="0"
          max="23.9"
          step="0.1"
          value={currentHour}
          onChange={(e) => onSetHour(parseFloat(e.target.value))}
          className="time-slider"
        />
      </div>
    </div>
  );
}
