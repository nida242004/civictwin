import React, { useState } from 'react';
import { Sparkles, FileText, UserPlus, Send, X, Loader2, CheckCircle2, Bot } from 'lucide-react';
import {
  generatePolicyMemo,
  generateCustomCitizenWithGemini,
  askPolicyConsultant,
} from '../../services/geminiService';
import type { Scenario, AggregateMetrics, PolicyIntervention } from '../../types/policy';
import type { CitizenPersona } from '../../types/citizen';

interface Props {
  scenario: Scenario;
  activePolicies: PolicyIntervention[];
  baselineMetrics: AggregateMetrics;
  policyMetrics: AggregateMetrics;
  onAddCitizen: (citizen: CitizenPersona) => void;
  onClose: () => void;
}

export function GeminiPolicyAdvisorModal({
  scenario,
  activePolicies,
  baselineMetrics,
  policyMetrics,
  onAddCitizen,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<'MEMO' | 'CITIZEN' | 'QA'>('MEMO');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Policy Memo State
  const [policyMemo, setPolicyMemo] = useState<string | null>(null);

  // Custom Citizen State
  const [citizenPrompt, setCitizenPrompt] = useState<string>(
    'Night-shift hospital custodian with knee arthritis commuting home at midnight'
  );
  const [generatedCitizen, setGeneratedCitizen] = useState<CitizenPersona | null>(null);

  // Q&A State
  const [question, setQuestion] = useState<string>('');
  const [qaHistory, setQaHistory] = useState<{ q: string; a: string }[]>([
    {
      q: 'Why does adding streetlights eliminate detours for the night nurse?',
      a: 'Lighting transforms high-anxiety dark alleys from psychological barriers into viable pedestrian paths. In the simulation, Elena Rostova has a safety sensitivity of 0.88; unlit darkness multiplies traversal cost by 12x, forcing a 14-minute detour. Illuminating the corridor drops that fear multiplier to 1.0, restoring direct walkability.',
    },
  ]);

  // Handle Memo Generation
  const handleGenerateMemo = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const memo = await generatePolicyMemo(
        scenario,
        activePolicies,
        baselineMetrics,
        policyMetrics
      );
      setPolicyMemo(memo);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate policy memo');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Custom Citizen Generation
  const handleGenerateCitizen = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const citizen = await generateCustomCitizenWithGemini(citizenPrompt);
      setGeneratedCitizen(citizen);
      onAddCitizen(citizen);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate citizen persona');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Q&A
  const handleAskQuestion = async () => {
    if (!question.trim()) return;
    const currentQ = question;
    setQuestion('');
    setIsLoading(true);
    setError(null);
    try {
      const answer = await askPolicyConsultant(currentQ, scenario, policyMetrics);
      setQaHistory((prev) => [...prev, { q: currentQ, a: answer }]);
    } catch (err: any) {
      setError(err?.message || 'Failed to consult Gemini');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="gemini-advisor-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="gemini-modal-header">
          <div className="gemini-title-row">
            <div className="gemini-sparkle-badge">
              <Sparkles size={20} className="text-amber-300" />
            </div>
            <div>
              <h2 className="gemini-title">Gemini AI Policy Suite</h2>
              <p className="gemini-subtitle">
                Powered by Google Gemini 2.5 Flash • Live Urban Policy Reasoning
              </p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Tab Switcher */}
        <div className="gemini-tab-switcher">
          <button
            className={`gemini-tab-btn ${activeTab === 'MEMO' ? 'active' : ''}`}
            onClick={() => setActiveTab('MEMO')}
          >
            <FileText size={15} />
            <span>Council Policy Memo</span>
          </button>
          <button
            className={`gemini-tab-btn ${activeTab === 'CITIZEN' ? 'active' : ''}`}
            onClick={() => setActiveTab('CITIZEN')}
          >
            <UserPlus size={15} />
            <span>Generate Citizen Persona</span>
          </button>
          <button
            className={`gemini-tab-btn ${activeTab === 'QA' ? 'active' : ''}`}
            onClick={() => setActiveTab('QA')}
          >
            <Bot size={15} />
            <span>Ask Urban Consultant</span>
          </button>
        </div>

        {error && <div className="gemini-error-banner">⚠️ {error}</div>}

        {/* Tab 1: Council Policy Memo */}
        {activeTab === 'MEMO' && (
          <div className="gemini-tab-body">
            {!policyMemo ? (
              <div className="gemini-intro-card">
                <FileText size={32} className="text-sky-400" />
                <h3>Generate Official Municipal Policy Debrief</h3>
                <p>
                  Gemini will analyze your live simulation deltas (+{policyMetrics.perceivedSafetyIndex - baselineMetrics.perceivedSafetyIndex}% safety, -{Math.round((baselineMetrics.avgCommuteMinutes - policyMetrics.avgCommuteMinutes) * 10) / 10}m travel time) and write an executive briefing with ROI justification.
                </p>
                <button
                  className="btn-gemini-action"
                  onClick={handleGenerateMemo}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Reasoning with Gemini...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Generate Executive Memo Now</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="gemini-memo-result">
                <div className="memo-header-row">
                  <span className="memo-badge">✓ Executive Briefing Generated</span>
                  <button className="btn-secondary" onClick={handleGenerateMemo} disabled={isLoading}>
                    Regenerate
                  </button>
                </div>
                <div className="memo-text-area">{policyMemo}</div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Generate Synthetic Citizen Persona */}
        {activeTab === 'CITIZEN' && (
          <div className="gemini-tab-body">
            <div className="citizen-prompt-box">
              <label className="input-label">Describe a citizen profile to simulate:</label>
              <textarea
                className="gemini-textarea"
                rows={2}
                value={citizenPrompt}
                onChange={(e) => setCitizenPrompt(e.target.value)}
                placeholder="e.g. A 75-year-old retired veteran with a cane seeking late medicine..."
              />
              <button
                className="btn-gemini-action"
                onClick={handleGenerateCitizen}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Synthesizing Persona with Gemini...</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={16} />
                    <span>Synthesize & Inject into 3D Simulation</span>
                  </>
                )}
              </button>
            </div>

            {generatedCitizen && (
              <div className="generated-citizen-card">
                <div className="citizen-success-title">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  <span>Successfully injected into Maplewood District:</span>
                </div>
                <div className="citizen-summary-row">
                  <span className="citizen-avatar">{generatedCitizen.avatar}</span>
                  <div>
                    <div className="citizen-name">{generatedCitizen.name}</div>
                    <div className="citizen-role">
                      {generatedCitizen.role} • Age {generatedCitizen.age} • Mobility: {generatedCitizen.mobility}
                    </div>
                  </div>
                </div>
                <p className="citizen-quote">"{generatedCitizen.voiceQuote}"</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Interactive Q&A */}
        {activeTab === 'QA' && (
          <div className="gemini-tab-body qa-mode">
            <div className="qa-chat-list">
              {qaHistory.map((item, idx) => (
                <div key={idx} className="qa-message-pair">
                  <div className="user-q">
                    <strong>You:</strong> {item.q}
                  </div>
                  <div className="ai-a">
                    <strong>Gemini Advisor:</strong> {item.a}
                  </div>
                </div>
              ))}
            </div>

            <div className="qa-input-row">
              <input
                type="text"
                className="qa-input"
                placeholder="Ask Gemini about trade-offs, transit budgets, or safety psychology..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
              />
              <button
                className="qa-send-btn"
                onClick={handleAskQuestion}
                disabled={isLoading || !question.trim()}
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
