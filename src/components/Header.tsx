import React from 'react';
import { Shield, Sparkles, Building2, Clock, Split, Layers, Play } from 'lucide-react';
import type { AggregateMetrics } from '../types/policy';

interface Props {
  currentScenarioTitle: string;
  currentHour: number;
  mode: 'BASELINE' | 'POLICY' | 'COMPARISON';
  onSetMode: (mode: 'BASELINE' | 'POLICY' | 'COMPARISON') => void;
  metrics: AggregateMetrics;
  baselineMetrics?: AggregateMetrics;
  onOpenGeminiModal?: () => void;
}

export function Header({
  currentScenarioTitle,
  currentHour,
  mode,
  onSetMode,
  metrics,
  baselineMetrics,
  onOpenGeminiModal,
}: Props) {
  const isNight = currentHour >= 18 || currentHour < 6;

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
              <span className="hackathon-tag">Agentic Urban Twin</span>
            </div>
            <p className="brand-subtitle">{currentScenarioTitle}</p>
          </div>
        </div>
      </div>

      {/* Mode Switcher & Gemini Advisor Trigger */}
      <div className="header-center-group">
        <div className="mode-switcher">
          <button
            className={`mode-btn ${mode === 'BASELINE' ? 'active' : ''}`}
            onClick={() => onSetMode('BASELINE')}
          >
            <Layers size={15} />
            <span>Status Quo</span>
          </button>
          <button
            className={`mode-btn ${mode === 'POLICY' ? 'active' : ''}`}
            onClick={() => onSetMode('POLICY')}
          >
            <Sparkles size={15} />
            <span>Policy Sandbox</span>
          </button>
          <button
            className={`mode-btn ${mode === 'COMPARISON' ? 'active' : ''}`}
            onClick={() => onSetMode('COMPARISON')}
          >
            <Split size={15} />
            <span>A/B Comparison</span>
          </button>
        </div>

        {onOpenGeminiModal && (
          <button className="btn-gemini-trigger" onClick={onOpenGeminiModal}>
            <Sparkles size={14} className="text-amber-300" />
            <span>Gemini Advisor</span>
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
