import type { Position } from './urban';

export type PerpState = 'LURKING' | 'STALKING' | 'FLEEING_LIGHT' | 'FLEEING_POLICE';

export interface PerpPersona {
  id: string;
  name: string;
  position: Position;
  targetPosition?: Position;
  threatRadius: number; // tiles within which perp causes panic
  state: PerpState;
  speechText: string;
  isCustomPlaced?: boolean;
}

export const INITIAL_PERPS: PerpPersona[] = [
  {
    id: 'perp-alley-north',
    name: 'Suspicious Lurker #1',
    position: { x: 5, y: 3 },
    threatRadius: 2.5,
    state: 'LURKING',
    speechText: 'Dark alley... easy targets pass here 😈',
    isCustomPlaced: false,
  },
  {
    id: 'perp-res-blindspot',
    name: 'Suspicious Lurker #2',
    position: { x: 10, y: 4 },
    threatRadius: 2.2,
    state: 'LURKING',
    speechText: 'No streetlights here... waiting in shadows 🦹',
    isCustomPlaced: false,
  },
];
