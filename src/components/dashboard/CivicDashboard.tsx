import React, { useState } from 'react';
import {
  BarChart3,
  Users,
  AlertTriangle,
  MessageSquare,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { AggregateMetrics } from '../../types/policy';
import type { CitizenPersona, CitizenSimResult } from '../../types/citizen';

interface Props {
  baselineMetrics: AggregateMetrics;
  policyMetrics: AggregateMetrics;
  citizens: CitizenPersona[];
  baselineResults: CitizenSimResult[];
  policyResults: CitizenSimResult[];
  onSelectCitizen: (id: string) => void;
}

export function CivicDashboard({
  baselineMetrics,
  policyMetrics,
  citizens,
  baselineResults,
  policyResults,
  onSelectCitizen,
}: Props) {
  const [activeTab, setActiveTab] = useState<'AB_COMPARE' | 'DEMOGRAPHICS' | 'CONSEQUENCES' | 'VOICES'>('AB_COMPARE');

  // Chart data comparing Baseline vs Policy
  const comparisonData = [
    {
      metric: 'Perceived Safety',
      'Status Quo': baselineMetrics.perceivedSafetyIndex,
      'With Policy': policyMetrics.perceivedSafetyIndex,
      unit: '%',
    },
    {
      metric: 'Vulnerable Equity',
      'Status Quo': baselineMetrics.vulnerableEquityScore,
      'With Policy': policyMetrics.vulnerableEquityScore,
      unit: '%',
    },
    {
      metric: 'Transit Reachability',
      'Status Quo': baselineMetrics.transitReachabilityRate,
      'With Policy': policyMetrics.transitReachabilityRate,
      unit: '%',
    },
    {
      metric: 'Citizen Satisfaction',
      'Status Quo': baselineMetrics.citizenSatisfactionRate,
      'With Policy': policyMetrics.citizenSatisfactionRate,
      unit: '%',
    },
  ];

  return (
    <div className="dashboard-card">
      {/* Dashboard Nav Tabs */}
      <div className="dashboard-tabs">
        <button
          className={`dash-tab ${activeTab === 'AB_COMPARE' ? 'active' : ''}`}
          onClick={() => setActiveTab('AB_COMPARE')}
        >
          <BarChart3 size={15} />
          <span>A/B Impact</span>
        </button>
        <button
          className={`dash-tab ${activeTab === 'DEMOGRAPHICS' ? 'active' : ''}`}
          onClick={() => setActiveTab('DEMOGRAPHICS')}
        >
          <Users size={15} />
          <span>Demographics</span>
        </button>
        <button
          className={`dash-tab ${activeTab === 'CONSEQUENCES' ? 'active' : ''}`}
          onClick={() => setActiveTab('CONSEQUENCES')}
        >
          <AlertTriangle size={15} />
          <span>Side Effects ({policyMetrics.unintendedConsequences.length})</span>
        </button>
        <button
          className={`dash-tab ${activeTab === 'VOICES' ? 'active' : ''}`}
          onClick={() => setActiveTab('VOICES')}
        >
          <MessageSquare size={15} />
          <span>Voices</span>
        </button>
      </div>

      <div className="dashboard-content">
        {/* Tab 1: A/B Policy Comparison */}
        {activeTab === 'AB_COMPARE' && (
          <div className="ab-compare-container">
            {/* High Level Delta Stats Cards */}
            <div className="metric-deltas-grid">
              <div className="delta-card">
                <div className="delta-card-title">Perceived Safety Index</div>
                <div className="delta-flow">
                  <span className="from-val">{baselineMetrics.perceivedSafetyIndex}</span>
                  <ArrowRight size={14} className="text-slate-400" />
                  <span className="to-val highlight">
                    {policyMetrics.perceivedSafetyIndex}
                  </span>
                </div>
                <div className="delta-badge positive">
                  +{policyMetrics.perceivedSafetyIndex - baselineMetrics.perceivedSafetyIndex}% Improvement
                </div>
              </div>

              <div className="delta-card">
                <div className="delta-card-title">Average Night Travel Time</div>
                <div className="delta-flow">
                  <span className="from-val">{baselineMetrics.avgCommuteMinutes}m</span>
                  <ArrowRight size={14} className="text-slate-400" />
                  <span className="to-val text-sky-400">
                    {policyMetrics.avgCommuteMinutes}m
                  </span>
                </div>
                <div className="delta-badge positive">
                  {Math.round((baselineMetrics.avgCommuteMinutes - policyMetrics.avgCommuteMinutes) * 10) / 10}m Faster
                </div>
              </div>

              <div className="delta-card">
                <div className="delta-card-title">Dark Corridor Fear Incidents</div>
                <div className="delta-flow">
                  <span className="from-val">{baselineMetrics.darkCorridorFearIncidents}</span>
                  <ArrowRight size={14} className="text-slate-400" />
                  <span className="to-val text-emerald-400">
                    {policyMetrics.darkCorridorFearIncidents}
                  </span>
                </div>
                <div className="delta-badge positive">
                  -{baselineMetrics.darkCorridorFearIncidents - policyMetrics.darkCorridorFearIncidents} Incidents
                </div>
              </div>

              <div className="delta-card">
                <div className="delta-card-title">Vulnerable Equity Score</div>
                <div className="delta-flow">
                  <span className="from-val">{baselineMetrics.vulnerableEquityScore}%</span>
                  <ArrowRight size={14} className="text-slate-400" />
                  <span className="to-val text-amber-300">
                    {policyMetrics.vulnerableEquityScore}%
                  </span>
                </div>
                <div className="delta-badge positive">
                  +{policyMetrics.vulnerableEquityScore - baselineMetrics.vulnerableEquityScore}% Equity
                </div>
              </div>
            </div>

            {/* Recharts Bar Chart */}
            <div className="chart-wrapper">
              <h3 className="chart-heading">Policy Impact Comparison</h3>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                    <XAxis dataKey="metric" stroke="#9eacbb" fontSize={12} tickLine={false} />
                    <YAxis stroke="#9eacbb" fontSize={12} tickLine={false} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#2a3642',
                        borderColor: '#4a5968',
                        borderRadius: '8px',
                        color: '#eef2f6',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                    <Bar dataKey="Status Quo" fill="#778a9d" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="With Policy" fill="#72b9a5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Demographic Equity */}
        {activeTab === 'DEMOGRAPHICS' && (
          <div className="demographics-container">
            <div className="demo-cards-grid">
              <div className="demo-item-card">
                <div className="demo-card-header">
                  <div className="demo-icon">👩‍⚕️</div>
                  <div>
                    <h4 className="demo-title">Night-Shift & Healthcare Workers</h4>
                    <p className="demo-desc">ER nurses, doctors, custodians arriving after 22:00</p>
                  </div>
                </div>
                <div className="demo-metric-row">
                  <span>Perceived Safety:</span>
                  <span className="text-emerald-400 font-semibold">
                    {policyMetrics.demographicBreakdown.nightShiftWorkers.safety}%
                  </span>
                </div>
                <div className="demo-metric-row">
                  <span>Average Commute:</span>
                  <span className="text-sky-400 font-semibold">
                    {policyMetrics.demographicBreakdown.nightShiftWorkers.commute} min
                  </span>
                </div>
              </div>

              <div className="demo-item-card">
                <div className="demo-card-header">
                  <div className="demo-icon">👴</div>
                  <div>
                    <h4 className="demo-title">Seniors & Mobility-Impaired</h4>
                    <p className="demo-desc">Retirees, wheelchair users, cane mobility</p>
                  </div>
                </div>
                <div className="demo-metric-row">
                  <span>Safety Confidence:</span>
                  <span className="text-emerald-400 font-semibold">
                    {policyMetrics.demographicBreakdown.seniorsAndDisabled.safety}%
                  </span>
                </div>
                <div className="demo-metric-row">
                  <span>Mobility Success:</span>
                  <span className="text-amber-400 font-semibold">
                    {policyMetrics.demographicBreakdown.seniorsAndDisabled.mobilityRate}%
                  </span>
                </div>
              </div>

              <div className="demo-item-card">
                <div className="demo-card-header">
                  <div className="demo-icon">🧑‍🎓</div>
                  <div>
                    <h4 className="demo-title">Students & Youth</h4>
                    <p className="demo-desc">Night library commuters, late workers</p>
                  </div>
                </div>
                <div className="demo-metric-row">
                  <span>Perceived Safety:</span>
                  <span className="text-emerald-400 font-semibold">
                    {policyMetrics.demographicBreakdown.studentsAndYouth.safety}%
                  </span>
                </div>
                <div className="demo-metric-row">
                  <span>Transit Access:</span>
                  <span className="text-sky-400 font-semibold">
                    {policyMetrics.demographicBreakdown.studentsAndYouth.transitAccess}%
                  </span>
                </div>
              </div>

              <div className="demo-item-card">
                <div className="demo-card-header">
                  <div className="demo-icon">🚶</div>
                  <div>
                    <h4 className="demo-title">General District Residents</h4>
                    <p className="demo-desc">Standard daytime and evening commuters</p>
                  </div>
                </div>
                <div className="demo-metric-row">
                  <span>Safety Index:</span>
                  <span className="text-emerald-400 font-semibold">
                    {policyMetrics.demographicBreakdown.generalCommuters.safety}%
                  </span>
                </div>
                <div className="demo-metric-row">
                  <span>Average Commute:</span>
                  <span className="text-slate-300 font-semibold">
                    {policyMetrics.demographicBreakdown.generalCommuters.commute} min
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Unintended Consequences */}
        {activeTab === 'CONSEQUENCES' && (
          <div className="consequences-container">
            {policyMetrics.unintendedConsequences.length === 0 ? (
              <div className="empty-consequences">
                <ShieldCheck size={32} className="text-emerald-400" />
                <p>No critical unintended consequences detected for current policy configuration.</p>
              </div>
            ) : (
              policyMetrics.unintendedConsequences.map((uc) => (
                <div key={uc.id} className="consequence-card">
                  <div className="consequence-header">
                    <div className="consequence-title-row">
                      <AlertTriangle size={17} className="text-amber-400" />
                      <span className="consequence-title">{uc.title}</span>
                    </div>
                    <span className={`severity-tag ${uc.severity}`}>{uc.category}</span>
                  </div>
                  <p className="consequence-desc">{uc.description}</p>
                  <div className="consequence-mitigation">
                    <span className="font-semibold text-slate-300">Actionable Mitigation:</span>{' '}
                    <span>{uc.mitigationSuggestion}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 4: Voices of the Community */}
        {activeTab === 'VOICES' && (
          <div className="voices-container">
            <div className="citizen-quotes-list">
              {citizens.map((c) => {
                const bRes = baselineResults.find((r) => r.personaId === c.id);
                const pRes = policyResults.find((r) => r.personaId === c.id);

                return (
                  <div
                    key={c.id}
                    className="citizen-quote-card"
                    onClick={() => onSelectCitizen(c.id)}
                  >
                    <div className="quote-header">
                      <span className="citizen-avatar">{c.avatar}</span>
                      <div>
                        <div className="citizen-name">{c.name}</div>
                        <div className="citizen-role">{c.role} • Age {c.age}</div>
                      </div>
                      <div className="quote-delta-badge">
                        {pRes && bRes && (
                          <span className="text-emerald-400 font-mono text-xs">
                            Fear: {bRes.peakFearScore}% → {pRes.peakFearScore}%
                          </span>
                        )}
                      </div>
                    </div>
                    <blockquote className="citizen-quote-text">"{c.voiceQuote}"</blockquote>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
