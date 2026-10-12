import React from 'react';
import { X, MapPin, Clock, ShieldAlert, HeartHandshake, CheckCircle2 } from 'lucide-react';
import type { CitizenPersona, CitizenSimResult } from '../../types/citizen';

interface Props {
  citizen: CitizenPersona | null;
  baselineResult: CitizenSimResult | null;
  policyResult: CitizenSimResult | null;
  onClose: () => void;
}

export function CitizenInspectorModal({
  citizen,
  baselineResult,
  policyResult,
  onClose,
}: Props) {
  if (!citizen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="inspector-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="inspector-header">
          <div className="citizen-identity-row">
            <span className="inspector-avatar">{citizen.avatar}</span>
            <div>
              <h2 className="inspector-name">{citizen.name}</h2>
              <div className="inspector-tags">
                <span className="tag-pill role">{citizen.role}</span>
                <span className="tag-pill age">Age {citizen.age}</span>
                <span className="tag-pill mobility">Mobility: {citizen.mobility}</span>
                <span className="tag-pill income">{citizen.incomeTier} Income</span>
              </div>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Journey Route & Purpose */}
        <div className="inspector-journey-banner">
          <div className="journey-node">
            <MapPin size={15} className="text-sky-400" />
            <div>
              <div className="node-label">Origin</div>
              <div className="node-val">{citizen.originName}</div>
            </div>
          </div>
          <div className="journey-arrow">➔</div>
          <div className="journey-node">
            <MapPin size={15} className="text-emerald-400" />
            <div>
              <div className="node-label">Destination</div>
              <div className="node-val">{citizen.destinationName}</div>
            </div>
          </div>
        </div>

        <div className="inspector-quote-box">
          <p className="quote-label">Voice of the Citizen:</p>
          <p className="quote-text">"{citizen.voiceQuote}"</p>
        </div>

        {/* Journey Comparison Columns */}
        <div className="journey-compare-grid">
          {/* Baseline Column */}
          <div className="compare-col baseline">
            <div className="col-header">
              <span className="col-title">Status Quo (No Policy)</span>
              {baselineResult && (
                <span className="col-stat text-rose-400">
                  Fear Peak: {baselineResult.peakFearScore}% • Travel: {baselineResult.totalTravelMinutes}m
                </span>
              )}
            </div>
            <div className="journal-list">
              {baselineResult?.qualitativeJournal.map((log, idx) => (
                <div key={idx} className="journal-entry">
                  <span className="journal-bullet text-rose-400">•</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>

          {/* With Policy Column */}
          <div className="compare-col policy">
            <div className="col-header">
              <span className="col-title">With Policy Interventions</span>
              {policyResult && (
                <span className="col-stat text-emerald-400">
                  Fear Peak: {policyResult.peakFearScore}% • Travel: {policyResult.totalTravelMinutes}m
                </span>
              )}
            </div>
            <div className="journal-list">
              {policyResult?.qualitativeJournal.map((log, idx) => (
                <div key={idx} className="journal-entry">
                  <span className="journal-bullet text-emerald-400">✓</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
