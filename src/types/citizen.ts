import type { Position } from './urban';

export type MobilityType =
  | 'STANDARD'
  | 'WHEELCHAIR'
  | 'CANE_SENIOR'
  | 'STROLLER_PARENT'
  | 'STUDENT';

export type EmotionalState =
  | 'SAFE'
  | 'CAUTIOUS'
  | 'FEARFUL'
  | 'DETOURING'
  | 'BOARDING_BUS'
  | 'RELIEVED'
  | 'USING_FACILITY'
  | 'ARRIVED';

export interface CitizenPersona {
  id: string;
  name: string;
  age: number;
  gender: 'Female' | 'Male' | 'Non-Binary';
  role: string; // e.g. "Night-Shift ER Nurse", "Retired Teacher", "Community College Student", "Food Courier"
  avatar: string;
  incomeTier: 'Low' | 'Medium' | 'High';
  mobility: MobilityType;
  speed: number; // tiles per minute (e.g. standard = 4, wheelchair = 2.5, cane = 2.0)
  safetySensitivity: number; // 0.0 (fearless) to 1.0 (highly sensitive to dark/isolated areas)
  transitDependency: number; // 0.0 (owns car/uber) to 1.0 (exclusively public transit)
  needsRestroom: boolean;
  restroomUrgencyHour?: number;

  // Daily Schedule & Routine
  origin: Position;
  destination: Position;
  originName: string;
  destinationName: string;
  departureTime: number; // decimal hour e.g. 23.5 = 23:30
  purpose: string;
  voiceQuote: string; // Citizen's subjective perspective
}

export interface JourneyStep {
  elapsedMinutes: number;
  position: Position;
  emotionalState: EmotionalState;
  fearScore: number; // 0 to 100
  actionDescription: string;
}

export interface CitizenSimResult {
  personaId: string;
  departureTime: number;
  arrivalTime: number;
  totalTravelMinutes: number;
  path: Position[];
  steps: JourneyStep[];
  tookDetour: boolean;
  detourMinutesAdded: number;
  avgFearScore: number;
  peakFearScore: number;
  usedNightBus: boolean;
  usedRestroom: boolean;
  successful: boolean;
  qualitativeJournal: string[];
}
