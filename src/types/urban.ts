export type TileType =
  | 'ROAD'
  | 'SIDEWALK'
  | 'CROSSWALK'
  | 'RESIDENTIAL'
  | 'COMMERCIAL'
  | 'SCHOOL'
  | 'CLINIC'
  | 'TRANSIT_HUB'
  | 'PARK'
  | 'DARK_ALLEY'
  | 'GRASS';

export type AmenityType =
  | 'STREETLIGHT'
  | 'BUS_STOP'
  | 'PUBLIC_TOILET'
  | 'POLICE_KIOSK'
  | 'BENCH'
  | 'TRAFFIC_CALMING';

export interface Position {
  x: number;
  y: number;
}

export interface Amenity {
  id: string;
  type: AmenityType;
  position: Position;
  radius: number; // effect radius in tiles
  activeHours: [number, number]; // [startHour, endHour] e.g. [20, 5] for night
  name: string;
  description: string;
  capex: number; // upfront cost in USD
  monthlyOpex: number; // ongoing monthly maintenance
  isPolicyAdded?: boolean; // true if added by policy intervention, false if baseline
}

export interface UrbanTile {
  x: number;
  y: number;
  type: TileType;
  height?: number; // 3D elevation for buildings
  name?: string;
  isLit?: boolean;
  isWalkable: boolean;
  fearFactor: number; // 0 (safe) to 1.0 (terrifying when unlit)
  noiseLevel?: number;
}

export interface DistrictGrid {
  width: number;
  height: number;
  tiles: UrbanTile[][];
  amenities: Amenity[];
  transitRoutes: TransitRoute[];
}

export interface TransitRoute {
  id: string;
  name: string;
  stops: Position[];
  activeHours: [number, number];
  headwayMinutes: number;
  monthlyOpex: number;
  color: string;
  isPolicyAdded?: boolean;
}
