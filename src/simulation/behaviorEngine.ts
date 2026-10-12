import type { DistrictGrid, Position } from '../types/urban';
import type {
  CitizenPersona,
  CitizenSimResult,
  JourneyStep,
  EmotionalState,
} from '../types/citizen';
import type { PerpPersona } from '../types/perp';
import { findAStarPath, calculateTileFear, isTileLit } from './pathfinding';

export function simulateCitizen(
  persona: CitizenPersona,
  grid: DistrictGrid,
  simHour: number,
  perps: PerpPersona[] = []
): CitizenSimResult {
  const qualitativeJournal: string[] = [];
  const steps: JourneyStep[] = [];

  // Stage 1: Routine & Objective
  const isNight = simHour >= 18 || simHour < 6;
  qualitativeJournal.push(
    `[${formatTime(simHour)}] ${persona.name} (${persona.role}, Age ${persona.age}) starts journey from ${persona.originName} to ${persona.destinationName}. Purpose: "${persona.purpose}".`
  );

  // Check if Night Bus route is available and beneficial
  let usedNightBus = false;
  let finalPath: Position[] = [];

  const activeNightBus = grid.transitRoutes.find((route) => {
    const [startH, endH] = route.activeHours;
    const isRouteActive =
      startH > endH
        ? simHour >= startH || simHour < endH // wraps around midnight (e.g. 21:00 to 03:00)
        : simHour >= startH && simHour < endH;
    return isRouteActive;
  });

  if (activeNightBus && persona.transitDependency > 0.3) {
    // Find closest stops to origin and destination
    let bestOriginStop: Position | null = null;
    let bestDestStop: Position | null = null;
    let minOriginDist = 999;
    let minDestDist = 999;

    for (const stop of activeNightBus.stops) {
      const dOrigin = Math.hypot(stop.x - persona.origin.x, stop.y - persona.origin.y);
      const dDest = Math.hypot(stop.x - persona.destination.x, stop.y - persona.destination.y);
      if (dOrigin < minOriginDist) {
        minOriginDist = dOrigin;
        bestOriginStop = stop;
      }
      if (dDest < minDestDist) {
        minDestDist = dDest;
        bestDestStop = stop;
      }
    }

    // Direct distance
    const directDist = Math.hypot(
      persona.destination.x - persona.origin.x,
      persona.destination.y - persona.origin.y
    );

    // If walking to stop + riding + walking from stop is shorter than direct walk or safer
    if (
      bestOriginStop &&
      bestDestStop &&
      (bestOriginStop.x !== bestDestStop.x || bestOriginStop.y !== bestDestStop.y) &&
      minOriginDist <= 6 &&
      minDestDist <= 6 &&
      directDist > 6
    ) {
      usedNightBus = true;
      qualitativeJournal.push(
        `[${formatTime(simHour + 0.1)}] Chose to use ${activeNightBus.name} at stop (${bestOriginStop.x}, ${bestOriginStop.y}) instead of long dark walk.`
      );

      const pathToStop = findAStarPath(
        grid,
        persona.origin,
        bestOriginStop,
        persona,
        simHour,
        true
      );
      const pathFromStop = findAStarPath(
        grid,
        bestDestStop,
        persona.destination,
        persona,
        simHour,
        true
      );

      finalPath = [...pathToStop, bestDestStop, ...pathFromStop];
    }
  }

  // Baseline direct path (or path without transit)
  const theoreticalShortestPath = findAStarPath(
    grid,
    persona.origin,
    persona.destination,
    persona,
    simHour,
    false // don't avoid dark alleys (pure shortest path)
  );

  let tookDetour = false;
  let detourMinutesAdded = 0;

  if (!usedNightBus) {
    const actualWalkPath = findAStarPath(
      grid,
      persona.origin,
      persona.destination,
      persona,
      simHour,
      true // allows fear-based detour
    );

    finalPath = actualWalkPath;

    // Check if path differed significantly from the shortest path
    if (actualWalkPath.length > theoreticalShortestPath.length + 3) {
      tookDetour = true;
      const extraTiles = actualWalkPath.length - theoreticalShortestPath.length;
      detourMinutesAdded = Math.round((extraTiles / persona.speed) * 10) / 10;
      qualitativeJournal.push(
        `[${formatTime(simHour + 0.15)}] Sensed dangerous unlit corridor. Avoided shortest alley and took a ${detourMinutesAdded}-minute detour via lit main street.`
      );
    }
  }

  // Stage 3: Step-by-step traversal and environmental interactions
  let elapsedMinutes = 0;
  let usedRestroom = false;
  let peakFear = 0;
  let totalFear = 0;

  // Check for public restroom need
  const restroomAmenity = grid.amenities.find((a) => a.type === 'PUBLIC_TOILET');

  for (let i = 0; i < finalPath.length; i++) {
    const pos = finalPath[i];
    let fear = calculateTileFear(pos.x, pos.y, grid, simHour, persona.safetySensitivity);
    const lit = isTileLit(pos.x, pos.y, grid.amenities, simHour);

    // Check if any active perp is threatening this position in dark
    let threatenedByPerp = false;
    if (isNight && !lit) {
      for (const perp of perps) {
        // Is perp deterred by any amenity?
        const perpLit = isTileLit(perp.position.x, perp.position.y, grid.amenities, simHour);
        const nearPolice = grid.amenities.some(
          (a) => a.type === 'POLICE_KIOSK' && Math.hypot(a.position.x - perp.position.x, a.position.y - perp.position.y) <= 4.0
        );

        if (!perpLit && !nearPolice) {
          const distToPerp = Math.hypot(pos.x - perp.position.x, pos.y - perp.position.y);
          if (distToPerp <= perp.threatRadius) {
            threatenedByPerp = true;
            fear = Math.min(100, Math.max(fear, 92 + Math.floor(persona.safetySensitivity * 8)));
            break;
          }
        }
      }
    }

    totalFear += fear;
    if (fear > peakFear) peakFear = fear;

    let state: EmotionalState = 'SAFE';

    if (threatenedByPerp || fear >= 70) {
      state = 'FEARFUL';
    } else if (fear >= 40) {
      state = 'CAUTIOUS';
    } else if (lit && isNight) {
      state = 'RELIEVED';
    }

    if (tookDetour && i === Math.floor(finalPath.length / 2)) {
      state = 'DETOURING';
    }

    if (usedNightBus && i === Math.floor(finalPath.length / 2)) {
      state = 'BOARDING_BUS';
    }

    // Check if citizen encounters a public restroom when urgent
    if (
      persona.needsRestroom &&
      !usedRestroom &&
      restroomAmenity &&
      Math.hypot(pos.x - restroomAmenity.position.x, pos.y - restroomAmenity.position.y) <= 1.5
    ) {
      usedRestroom = true;
      state = 'USING_FACILITY';
      elapsedMinutes += 4; // 4 minute pit stop
      qualitativeJournal.push(
        `[${formatTime(simHour + elapsedMinutes / 60)}] Found clean accessible public restroom at (${pos.x}, ${pos.y}). Huge relief; eliminated urgent discomfort.`
      );
    }

    let actionDesc = `Walking on ${grid.tiles[pos.y]?.[pos.x]?.type.toLowerCase()}`;
    if (threatenedByPerp) {
      actionDesc = `🚨 High Panic: Spotted suspicious lurker in the unlit corridor!`;
      qualitativeJournal.push(
        `[${formatTime(simHour + elapsedMinutes / 60)}] Spotted a suspicious figure lurking in the dark alley at (${pos.x}, ${pos.y})! Heart racing, quickened pace to escape!`
      );
    } else if (state === 'FEARFUL') {
      actionDesc = `Anxious walking through dark unlit zone (Fear: ${fear}%)`;
    } else if (state === 'DETOURING') {
      actionDesc = `Taking longer detour around unlit northern alley`;
    } else if (state === 'BOARDING_BUS') {
      actionDesc = `Riding Night Bus safely past dark district sectors`;
    } else if (state === 'USING_FACILITY') {
      actionDesc = `Utilizing public sanitation amenity`;
    }

    steps.push({
      elapsedMinutes,
      position: pos,
      emotionalState: state,
      fearScore: fear,
      actionDescription: actionDesc,
    });

    // Advance time based on mobility speed
    elapsedMinutes += Math.round((1 / persona.speed) * 10) / 10;
  }

  // Arrival
  steps.push({
    elapsedMinutes,
    position: persona.destination,
    emotionalState: 'ARRIVED',
    fearScore: Math.min(20, peakFear / 3),
    actionDescription: `Arrived safely at ${persona.destinationName}`,
  });

  qualitativeJournal.push(
    `[${formatTime(simHour + elapsedMinutes / 60)}] Safely arrived at destination in ${Math.round(elapsedMinutes)} minutes. Peak fear score: ${peakFear}/100.`
  );

  const avgFearScore = steps.length > 0 ? Math.round(totalFear / steps.length) : 0;

  return {
    personaId: persona.id,
    departureTime: simHour,
    arrivalTime: simHour + elapsedMinutes / 60,
    totalTravelMinutes: Math.round(elapsedMinutes * 10) / 10,
    path: finalPath,
    steps,
    tookDetour,
    detourMinutesAdded,
    avgFearScore,
    peakFearScore: peakFear,
    usedNightBus,
    usedRestroom,
    successful: true,
    qualitativeJournal,
  };
}

function formatTime(decimalHour: number): string {
  const norm = ((decimalHour % 24) + 24) % 24;
  const hours = Math.floor(norm);
  const minutes = Math.floor((norm - hours) * 60);
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
