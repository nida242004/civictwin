import React from 'react';
import { Shield, Sparkles, Building2, Clock, Split, Layers, Home } from 'lucide-react';
import type { AggregateMetrics } from '../types/policy';

interface Props {
  currentScenarioTitle: string;
  onGoHome: () => void;
  mode: 'BASELINE' | 'POLICY' | 'COMPARISON';
  onSetMode: (mode: 'BASELINE' | 'POLICY' | 'COMPARISON') => void;
  metrics: AggregateMetrics;
  baselineMetrics?: AggregateMetrics;
  onOpenGeminiModal?: () => void;
}

export function Header({
  currentScenarioTitle,
  onGoHome,
  mode,
  onSetMode,
  metrics,
  baselineMetrics,
  onOpenGeminiModal,
}: Props) {
  const safetyDelta = baselineMetrics
    ? metrics.perceivedSafetyIndex - baselineMetrics.perceivedSafetyIndex
    : 0;

  const commuteDelta = baselineMetrics
    ? Math.round((metrics.avgCommuteMinutes - baselineMetrics.avgCommuteMinutes) * 10) / 10
    : 0;

  return (
    <header className="header-container">
      <div className="header-left">
        <div className="brand-badge">
          <Building2 className="brand-icon" size={22} />
          <div>
            <div className="brand-title-row">
              <h1 className="brand-title">CivicTwin</h1>
              <span className="hackathon-tag">Neighborhood simulator</span>
            </div>
            <p className="brand-subtitle">{currentScenarioTitle}</p>
          </div>
        </div>
      </div>

      {/* Mode Switcher & Gemini Advisor Trigger */}
      <div className="header-center-group">
        <button className="locality-nav-button" onClick={onGoHome}>
          <Home size={15} />
          <span>All localities</span>
        </button>
        <div className="mode-switcher">
          <button
            className={`mode-btn ${mode === 'BASELINE' ? 'active' : ''}`}
            onClick={() => onSetMode('BASELINE')}
            aria-pressed={mode === 'BASELINE'}
            title="View the neighborhood without added policies"
          >
            <Layers size={15} />
            <span>Baseline</span>
          </button>
          <button
            className={`mode-btn ${mode === 'POLICY' ? 'active' : ''}`}
            onClick={() => onSetMode('POLICY')}
            aria-pressed={mode === 'POLICY'}
            title="Choose and test policy changes"
          >
            <Sparkles size={15} />
            <span>With policies</span>
          </button>
          <button
            className={`mode-btn ${mode === 'COMPARISON' ? 'active' : ''}`}
            onClick={() => onSetMode('COMPARISON')}
            aria-pressed={mode === 'COMPARISON'}
            title="Compare baseline and policy estimates"
          >
            <Split size={15} />
            <span>Compare</span>
          </button>
        </div>

        {onOpenGeminiModal && (
          <button className="btn-gemini-trigger" onClick={onOpenGeminiModal}>
            <Sparkles size={14} className="text-amber-300" />
            <span>AI policy advisor</span>
          </button>
        )}
      </div>

      {/* Live Key Metrics Pill */}
      <div className="header-right">
        <div className="kpi-card">
          <div className="kpi-label">Perceived Safety</div>
          <div className="kpi-value-row">
            <Shield size={16} className="text-emerald-400" />
            <span className="kpi-number">{metrics.perceivedSafetyIndex}/100</span>
            {mode !== 'BASELINE' && safetyDelta !== 0 && (
              <span className={`kpi-delta ${safetyDelta > 0 ? 'positive' : 'negative'}`}>
                {safetyDelta > 0 ? `+${safetyDelta}%` : `${safetyDelta}%`}
              </span>
            )}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Avg Night Travel</div>
          <div className="kpi-value-row">
            <Clock size={16} className="text-sky-400" />
            <span className="kpi-number">{metrics.avgCommuteMinutes}m</span>
            {mode !== 'BASELINE' && commuteDelta !== 0 && (
              <span className={`kpi-delta ${commuteDelta < 0 ? 'positive' : 'negative'}`}>
                {commuteDelta < 0 ? `${commuteDelta}m` : `+${commuteDelta}m`}
              </span>
            )}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Equity Score</div>
          <div className="kpi-value-row">
            <span className="kpi-number text-amber-300">{metrics.vulnerableEquityScore}%</span>
          </div>
        </div>
      </div>
    </header>
  );
}
