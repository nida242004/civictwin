import type { Position, DistrictGrid, Amenity } from '../types/urban';
import type { CitizenPersona } from '../types/citizen';

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

export function isTileLit(
  x: number,
  y: number,
  amenities: Amenity[],
  currentHour: number
): boolean {
  // Streetlights active between 18:00 and 06:00
  const isNight = currentHour >= 18 || currentHour < 6;
  if (!isNight) return true; // Daylight provides natural illumination

  for (const amenity of amenities) {
    if (amenity.type === 'STREETLIGHT' || amenity.type === 'POLICE_KIOSK') {
      const dist = Math.hypot(amenity.position.x - x, amenity.position.y - y);
      if (dist <= amenity.radius) {
        return true;
      }
    }
  }
  return false;
}

export function calculateTileFear(
  x: number,
  y: number,
  grid: DistrictGrid,
  currentHour: number,
  safetySensitivity: number
): number {
  const tile = grid.tiles[y]?.[x];
  if (!tile) return 0;

  const isNight = currentHour >= 18 || currentHour < 6;
  const isLit = isTileLit(x, y, grid.amenities, currentHour);

  let baseFear = 10; // baseline daytime ambient nervousness

  if (tile.type === 'DARK_ALLEY') {
    baseFear = isNight && !isLit ? 85 : isNight && isLit ? 25 : 20;
  } else if (tile.type === 'PARK') {
    baseFear = isNight && !isLit ? 60 : isNight && isLit ? 20 : 5;
  } else if (tile.type === 'COMMERCIAL' || tile.type === 'TRANSIT_HUB') {
    baseFear = 15; // presence of storefronts/people reduces fear
  } else if (tile.type === 'SIDEWALK' || tile.type === 'CROSSWALK') {
    baseFear = isNight && !isLit ? 45 : 10;
  }

  // Police kiosk / community safety kiosk provides a 3-tile safety halo
  for (const a of grid.amenities) {
    if (a.type === 'POLICE_KIOSK') {
      const d = Math.hypot(a.position.x - x, a.position.y - y);
      if (d <= a.radius) {
        baseFear = Math.max(5, baseFear - 40);
      }
    }
  }

  // Scale by persona safety sensitivity
  return Math.min(100, Math.round(baseFear * (0.5 + safetySensitivity * 0.8)));
}

export function findAStarPath(
  grid: DistrictGrid,
  start: Position,
  end: Position,
  persona: CitizenPersona,
  currentHour: number,
  allowDetourAvoidance: boolean = true
): Position[] {
  const { width, height, tiles, amenities } = grid;

  if (start.x === end.x && start.y === end.y) {
    return [start];
  }

  const openList: Node[] = [];
  const closedSet = new Set<string>();

  const startNode: Node = {
    x: start.x,
    y: start.y,
    g: 0,
    h: Math.abs(end.x - start.x) + Math.abs(end.y - start.y),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.g + startNode.h;
  openList.push(startNode);

  const key = (x: number, y: number) => `${x},${y}`;

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ];

  while (openList.length > 0) {
    // Find node with lowest f
    let lowestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].f < openList[lowestIdx].f) {
        lowestIdx = i;
      }
    }

    const current = openList[lowestIdx];

    // Reached destination
    if (current.x === end.x && current.y === end.y) {
      const path: Position[] = [];
      let curr: Node | null = current;
      while (curr) {
        path.unshift({ x: curr.x, y: curr.y });
        curr = curr.parent;
      }
      return path;
    }

    openList.splice(lowestIdx, 1);
    closedSet.add(key(current.x, current.y));

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;

      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (closedSet.has(key(nx, ny))) continue;

      const neighborTile = tiles[ny]?.[nx];
      if (!neighborTile || !neighborTile.isWalkable) continue;

      // Calculate traversal cost
      let costMultiplier = 1.0;
      const lit = isTileLit(nx, ny, amenities, currentHour);
      const isNight = currentHour >= 18 || currentHour < 6;

      if (allowDetourAvoidance && persona.safetySensitivity > 0.3) {
        if (neighborTile.type === 'DARK_ALLEY' && isNight && !lit) {
          // Massive psychological cost for unlit dark alleys -> triggers detour!
          costMultiplier = 12.0 * persona.safetySensitivity;
        } else if (neighborTile.type === 'PARK' && isNight && !lit) {
          costMultiplier = 6.0 * persona.safetySensitivity;
        }
      }

      // Wheelchair / cane mobility favors sidewalks and crosswalks over unpaved areas
      if (persona.mobility === 'WHEELCHAIR' || persona.mobility === 'CANE_SENIOR') {
        if (neighborTile.type === 'DARK_ALLEY' || neighborTile.type === 'ROAD') {
          costMultiplier *= 2.0;
        }
      }

      const gScore = current.g + costMultiplier;
      const hScore = Math.abs(end.x - nx) + Math.abs(end.y - ny);
      const fScore = gScore + hScore;

      const existingOpen = openList.find((n) => n.x === nx && n.y === ny);
      if (existingOpen) {
        if (gScore < existingOpen.g) {
          existingOpen.g = gScore;
          existingOpen.f = fScore;
          existingOpen.parent = current;
        }
      } else {
        openList.push({
          x: nx,
          y: ny,
          g: gScore,
          h: hScore,
          f: fScore,
          parent: current,
        });
      }
    }
  }

  // Fallback direct path if no path found
  return [start, end];
}
