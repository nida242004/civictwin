import React from 'react';
import {
  Lightbulb,
  Bus,
  Bath,
  Shield,
  AlertTriangle,
  Armchair,
  CheckCircle2,
  DollarSign,
  Play,
  Sparkles,
} from 'lucide-react';
import type { PolicyIntervention, PolicyId } from '../../types/policy';

interface Props {
  policies: PolicyIntervention[];
  activePolicyIds: PolicyId[];
  onTogglePolicy: (id: PolicyId) => void;
  onApplyRecommended: () => void;
  onSimulate: () => void;
  totalCapEx: number;
  monthlyOpEx: number;
}

export function PolicyToolbar({
  policies,
  activePolicyIds,
  onTogglePolicy,
  onApplyRecommended,
  onSimulate,
  totalCapEx,
  monthlyOpEx,
}: Props) {
  const getIcon = (id: PolicyId) => {
    switch (id) {
      case 'STREETLIGHT_NETWORK':
        return <Lightbulb size={18} />;
      case 'NIGHT_BUS_ROUTE':
        return <Bus size={18} />;
      case 'ACCESSIBLE_PUBLIC_TOILETS':
        return <Bath size={18} />;
      case 'COMMUNITY_SAFETY_KIOSK':
        return <Shield size={18} />;
      case 'TRAFFIC_CALMING_ZONE':
        return <AlertTriangle size={18} />;
      case 'SENIOR_BENCH_NETWORK':
        return <Armchair size={18} />;
    }
  };

  return (
    <div className="policy-toolbar-card">
      <div className="policy-toolbar-header">
        <div>
          <h2 className="policy-title">Choose policy changes</h2>
          <p className="policy-subtitle">
            Select changes to test, then compare the estimated impact.
          </p>
        </div>
        <div className="budget-tags">
          <div className="budget-tag capex">
            <DollarSign size={13} />
            <span>CapEx: ${totalCapEx.toLocaleString()}</span>
          </div>
          <div className="budget-tag opex">
            <span>OpEx: ${monthlyOpEx.toLocaleString()}/mo</span>
          </div>
        </div>
      </div>

      {/* Policy Cards Grid */}
      <div className="policy-cards-grid">
        {policies.map((p) => {
          const isActive = activePolicyIds.includes(p.id);
          return (
            <button
              type="button"
              key={p.id}
              className={`policy-item-card ${isActive ? 'active' : ''}`}
              onClick={() => onTogglePolicy(p.id)}
              aria-pressed={isActive}
            >
              <div className="policy-card-top">
                <div className={`policy-icon-badge ${isActive ? 'active' : ''}`}>
                  {getIcon(p.id)}
                </div>
                <div className="policy-checkbox">
                  {isActive ? (
                    <CheckCircle2 size={18} className="text-emerald-400" />
                  ) : (
                    <div className="checkbox-empty" />
                  )}
                </div>
              </div>
              <div className="policy-card-title">{p.name}</div>
              <div className="policy-card-desc">{p.description}</div>
              <div className="policy-cost-row">
                <span>+${p.capex.toLocaleString()} Upfront</span>
                <span>${p.monthlyOpex}/mo</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Action Bar */}
      <div className="policy-action-bar">
        <button className="btn-secondary" onClick={onApplyRecommended}>
          <Sparkles size={16} />
          <span>Use recommended setup</span>
        </button>

        <button className="btn-primary" onClick={onSimulate}>
          <Play size={16} fill="currentColor" />
          <span>View impact</span>
        </button>
      </div>
    </div>
  );
}
