import type { CitizenPersona } from '../types/citizen';
import type { DistrictGrid, UrbanTile } from '../types/urban';
import type { Scenario } from '../types/policy';

export const LOCALITY_GRID_SIZE = 16;

export function createEmptyLocalityGrid(): DistrictGrid {
  const tiles: UrbanTile[][] = Array.from({ length: LOCALITY_GRID_SIZE }, (_, y) =>
    Array.from({ length: LOCALITY_GRID_SIZE }, (_, x) => ({
      x,
      y,
      type: 'SIDEWALK',
      name: 'Sidewalk',
      isWalkable: true,
      fearFactor: 0.1,
    }))
  );

  return { width: LOCALITY_GRID_SIZE, height: LOCALITY_GRID_SIZE, tiles, amenities: [], transitRoutes: [] };
}

function adjacentWalkable(grid: DistrictGrid, x: number, y: number) {
  const candidates = [
    { x, y: y - 1 },
    { x: x + 1, y },
    { x, y: y + 1 },
    { x: x - 1, y },
  ];
  return candidates.find(({ x: nx, y: ny }) => {
    const tile = grid.tiles[ny]?.[nx];
    return tile?.isWalkable;
  });
}

function hasWalkableRoute(
  grid: DistrictGrid,
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const queue = [start];
  const visited = new Set([`${start.x},${start.y}`]);
  const directions = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (current.x === end.x && current.y === end.y) return true;

    for (const direction of directions) {
      const x = current.x + direction.x;
      const y = current.y + direction.y;
      const key = `${x},${y}`;
      if (visited.has(key) || !grid.tiles[y]?.[x]?.isWalkable) continue;
      visited.add(key);
      queue.push({ x, y });
    }
  }
  return false;
}

export function createLocalityScenario(title: string, district: DistrictGrid): Scenario {
  const homes = district.tiles.flat().filter((tile) => tile.type === 'RESIDENTIAL');
  const destinations = district.tiles.flat().filter((tile) =>
    ['COMMERCIAL', 'SCHOOL', 'CLINIC', 'TRANSIT_HUB', 'PARK'].includes(tile.type)
  );
  const walkableHomes = homes
    .map((tile) => adjacentWalkable(district, tile.x, tile.y))
    .filter((position): position is { x: number; y: number } => !!position);
  const walkableDestinations = destinations
    .map((tile) =>
      tile.isWalkable ? { x: tile.x, y: tile.y } : adjacentWalkable(district, tile.x, tile.y)
    )
    .filter((position): position is { x: number; y: number } => !!position);

  const citizens: CitizenPersona[] = walkableHomes.slice(0, 8).flatMap((home, index) => {
    const destination = walkableDestinations
      .map((_, offset) => walkableDestinations[(index + offset) % walkableDestinations.length])
      .find(
        (position) =>
          (position.x !== home.x || position.y !== home.y) &&
          hasWalkableRoute(district, home, position)
      );
    if (!destination) return [];
    const personas = [
      {
        name: `Resident ${index + 1}`,
        role: 'Night-Shift Healthcare Worker',
        avatar: '👩‍⚕️',
        mobility: 'STANDARD' as const,
        safetySensitivity: 0.8,
        transitDependency: 0.85,
        gender: 'Female' as const,
        age: 32,
      },
      {
        name: `Resident ${index + 1}`,
        role: 'Retired Local Resident',
        avatar: '🧓',
        mobility: 'CANE_SENIOR' as const,
        safetySensitivity: 0.75,
        transitDependency: 0.65,
        gender: 'Non-Binary' as const,
        age: 68,
      },
      {
        name: `Resident ${index + 1}`,
        role: 'Community College Student',
        avatar: '🎓',
        mobility: 'STUDENT' as const,
        safetySensitivity: 0.55,
        transitDependency: 0.8,
        gender: 'Male' as const,
        age: 21,
      },
    ];
    const persona = personas[index % personas.length];

    return [{
      id: `resident-${index + 1}`,
      ...persona,
      incomeTier: 'Medium',
      speed: persona.mobility === 'CANE_SENIOR' ? 2.2 : 3.5,
      needsRestroom: false,
      origin: home,
      destination,
      originName: `${title} Home ${index + 1}`,
      destinationName: `${title} Local Destination`,
      departureTime: [7.5, 18.5, 23.5][index % 3],
      purpose: `Traveling from home to a local destination in ${title}`,
      voiceQuote: `I want to get around ${title} safely and comfortably.`,
    }];
  });

  return {
    id: `locality-${Date.now()}`,
    title,
    subtitle: 'A neighborhood designed by you',
    description: `A custom locality with ${homes.length} home areas and ${destinations.length} nearby destinations.`,
    defaultHour: 18.5,
    district,
    citizens,
    baselinePolicies: [],
    recommendedPolicies: [],
  };
}
