/** Shared types for the Local Safety Intel feature (safe for client + server). */

export type IncidentMix = {
  mugger: number;
  harasser: number;
  burglar: number;
  vandal: number;
  chain_snatcher: number;
};

export interface LocalIntel {
  summary: string;
  riskFactors: { factor: string; evidence: string; sourceIdx: number | null }[];
  incidentMix: IncidentMix;
  peakHours: string;
  suggestedScenario: {
    eventsPerHour: number;
    perpCount: number;
    guardFatigue: number;
    lightingOutageFraction: number;
    ambientVisibility: number;
  };
  helplines: { name: string; number: string }[];
  sources: { title: string; uri: string }[];
  placeName: string;
  generatedAt: string;
  model: string;
  grounded: boolean;
  cached?: boolean;
}

export const VOICES = ["victim", "perp", "guard", "narrator"] as const;
export type VoiceRole = (typeof VOICES)[number];
