import type { DistrictGrid } from '../types/urban';
import type { CitizenPersona, CitizenSimResult } from '../types/citizen';
import type { AggregateMetrics, UnintendedConsequence, PolicyId } from '../types/policy';

export function calculateAggregateMetrics(
  results: CitizenSimResult[],
  citizens: CitizenPersona[],
  grid: DistrictGrid,
  activePolicies: PolicyId[]
): AggregateMetrics {
  const citizenMap = new Map(citizens.map((c) => [c.id, c]));

  let totalTravelTime = 0;
  let totalFear = 0;
  let darkIncidents = 0;
  let detourCount = 0;
  let satisfiedCount = 0;

  // Demographic accumulators
  let nightWorkerFear = 0;
  let nightWorkerCount = 0;
  let nightWorkerTime = 0;

  let seniorFear = 0;
  let seniorCount = 0;
  let seniorMobilitySuccess = 0;

  let youthFear = 0;
  let youthCount = 0;

  let generalFear = 0;
  let generalCount = 0;
  let generalTime = 0;

  for (const r of results) {
    const persona = citizenMap.get(r.personaId);
    if (!persona) continue;

    totalTravelTime += r.totalTravelMinutes;
    totalFear += r.avgFearScore;
    if (r.tookDetour) detourCount++;
    if (r.peakFearScore >= 65) darkIncidents++;

    // Satisfaction heuristic
    if (r.avgFearScore <= 35 && (!persona.needsRestroom || r.usedRestroom)) {
      satisfiedCount++;
    }

    // Demographic categorization
    if (persona.role.toLowerCase().includes('nurse') || persona.role.toLowerCase().includes('shift') || persona.role.toLowerCase().includes('courier')) {
      nightWorkerFear += r.avgFearScore;
      nightWorkerTime += r.totalTravelMinutes;
      nightWorkerCount++;
    } else if (persona.mobility === 'CANE_SENIOR' || persona.mobility === 'WHEELCHAIR') {
      seniorFear += r.avgFearScore;
      seniorCount++;
      if (r.totalTravelMinutes <= 25 && (!persona.needsRestroom || r.usedRestroom)) {
        seniorMobilitySuccess++;
      }
    } else if (persona.role.toLowerCase().includes('student') || persona.age < 21) {
      youthFear += r.avgFearScore;
      youthCount++;
    } else {
      generalFear += r.avgFearScore;
      generalTime += r.totalTravelMinutes;
      generalCount++;
    }
  }

  const n = results.length || 1;
  const avgCommuteMinutes = Math.round((totalTravelTime / n) * 10) / 10;
  const avgFearScore = totalFear / n;
  const perceivedSafetyIndex = Math.max(0, Math.min(100, Math.round(100 - avgFearScore)));

  // Vulnerable Equity Score (prioritizes seniors and night workers)
  const nightWorkerSafety = nightWorkerCount > 0 ? Math.round(100 - nightWorkerFear / nightWorkerCount) : 70;
  const seniorSafety = seniorCount > 0 ? Math.round(100 - seniorFear / seniorCount) : 70;
  const vulnerableEquityScore = Math.round(nightWorkerSafety * 0.5 + seniorSafety * 0.5);

  const transitReachabilityRate = Math.round(
    (results.filter((r) => r.totalTravelMinutes <= 25).length / n) * 100
  );

  const citizenSatisfactionRate = Math.round((satisfiedCount / n) * 100);

  // Financial costs computation
  let totalCapEx = 0;
  let monthlyOpEx = 0;

  for (const amenity of grid.amenities) {
    if (amenity.isPolicyAdded) {
      totalCapEx += amenity.capex;
      monthlyOpEx += amenity.monthlyOpex;
    }
  }

  for (const route of grid.transitRoutes) {
    if (route.isPolicyAdded) {
      monthlyOpEx += route.monthlyOpex;
    }
  }

  // Detect Unintended Consequences based on policies and simulation findings
  const unintendedConsequences: UnintendedConsequence[] = [];

  if (activePolicies.includes('NIGHT_BUS_ROUTE')) {
    unintendedConsequences.push({
      id: 'uc-noise',
      title: 'Late-Night Bus Engine Noise on Residential Elm St',
      severity: 'low',
      category: 'Noise',
      description:
        'Frequent bus stops between 23:00 and 02:00 generate 68dB noise peaks near ground-floor bedroom apartments.',
      mitigationSuggestion:
        'Transition to electric quiet-powertrain buses or relocate Elm St bus stop 40 meters towards the commercial perimeter.',
    });
  }

  if (activePolicies.includes('STREETLIGHT_NETWORK')) {
    unintendedConsequences.push({
      id: 'uc-light',
      title: 'Residential Window Light Spillover & Power Upkeep',
      severity: 'low',
      category: 'Maintenance',
      description:
        '12 new high-intensity LED lamps increase local utility costs by $380/mo and cast glare on 2nd-story apartment facades.',
      mitigationSuggestion:
        'Equip LED fixtures with downward directional optical cut-off shields and automated 01:00-05:00 dimming sensors.',
    });
  }

  if (activePolicies.includes('ACCESSIBLE_PUBLIC_TOILETS')) {
    unintendedConsequences.push({
      id: 'uc-toilets',
      title: 'Peak Morning Restroom Maintenance Bottleneck',
      severity: 'medium',
      category: 'Maintenance',
      description:
        'Automated cleaning cycle locks the facility for 3 minutes every 5 uses, creating brief queues between 07:30 and 08:30.',
      mitigationSuggestion:
        'Schedule preventative deep-cleans at 04:00 and add visual occupancy LED indicators outside the pod.',
    });
  }

  if (activePolicies.includes('TRAFFIC_CALMING_ZONE')) {
    unintendedConsequences.push({
      id: 'uc-traffic',
      title: 'Perimeter Cut-Through Traffic Spillover',
      severity: 'medium',
      category: 'Congestion',
      description:
        'Restricting vehicular through-traffic near the school shifted delivery vans to 5th Avenue, causing a 6-minute rush hour delay.',
      mitigationSuggestion:
        'Coordinate signal timing on 5th Avenue and designate a dedicated 15-minute delivery drop zone.',
    });
  }

  return {
    perceivedSafetyIndex,
    avgCommuteMinutes,
    vulnerableEquityScore,
    transitReachabilityRate,
    darkCorridorFearIncidents: darkIncidents,
    detourCount,
    totalCapEx,
    monthlyOpEx,
    citizenSatisfactionRate,
    unintendedConsequences,
    demographicBreakdown: {
      nightShiftWorkers: {
        safety: nightWorkerSafety,
        commute: nightWorkerCount > 0 ? Math.round((nightWorkerTime / nightWorkerCount) * 10) / 10 : 20,
      },
      seniorsAndDisabled: {
        safety: seniorSafety,
        mobilityRate: seniorCount > 0 ? Math.round((seniorMobilitySuccess / seniorCount) * 100) : 60,
      },
      studentsAndYouth: {
        safety: youthCount > 0 ? Math.round(100 - youthFear / youthCount) : 75,
        transitAccess: 88,
      },
      generalCommuters: {
        safety: generalCount > 0 ? Math.round(100 - generalFear / generalCount) : 80,
        commute: generalCount > 0 ? Math.round((generalTime / generalCount) * 10) / 10 : 18,
      },
    },
  };
}
