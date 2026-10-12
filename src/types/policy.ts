import type { DistrictGrid } from './urban';
import type { CitizenPersona, CitizenSimResult } from './citizen';

export type PolicyId =
  | 'STREETLIGHT_NETWORK'
  | 'NIGHT_BUS_ROUTE'
  | 'ACCESSIBLE_PUBLIC_TOILETS'
  | 'COMMUNITY_SAFETY_KIOSK'
  | 'TRAFFIC_CALMING_ZONE'
  | 'SENIOR_BENCH_NETWORK';

export interface PolicyIntervention {
  id: PolicyId;
  name: string;
  category: 'Safety & Lighting' | 'Public Transit' | 'Sanitation & Health' | 'Urban Mobility';
  description: string;
  capex: number; // in USD
  monthlyOpex: number; // in USD
  icon: string;
  enabled: boolean;
  affectedAspects: string[];
  keyTradeoff: string;
}

export interface UnintendedConsequence {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  category: 'Noise' | 'Economic Shift' | 'Congestion' | 'Maintenance';
  description: string;
  mitigationSuggestion: string;
}

export interface AggregateMetrics {
  perceivedSafetyIndex: number; // 0 to 100
  avgCommuteMinutes: number;
  vulnerableEquityScore: number; // 0 to 100
  transitReachabilityRate: number; // 0 to 100%
  darkCorridorFearIncidents: number;
  detourCount: number;
  totalCapEx: number;
  monthlyOpEx: number;
  citizenSatisfactionRate: number; // 0 to 100%
  unintendedConsequences: UnintendedConsequence[];
  demographicBreakdown: {
    nightShiftWorkers: { safety: number; commute: number };
    seniorsAndDisabled: { safety: number; mobilityRate: number };
    studentsAndYouth: { safety: number; transitAccess: number };
    generalCommuters: { safety: number; commute: number };
  };
}

export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  defaultHour: number;
  district: DistrictGrid;
  citizens: CitizenPersona[];
  baselinePolicies: PolicyId[];
  recommendedPolicies: PolicyId[];
}

export interface SimulationComparison {
  baselineMetrics: AggregateMetrics;
  policyMetrics: AggregateMetrics;
  baselineResults: CitizenSimResult[];
  policyResults: CitizenSimResult[];
}
