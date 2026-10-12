import type { Scenario, PolicyIntervention } from '../types/policy';
import type { DistrictGrid, UrbanTile, Amenity, TransitRoute } from '../types/urban';

export const AVAILABLE_POLICIES: PolicyIntervention[] = [
  {
    id: 'STREETLIGHT_NETWORK',
    name: 'Smart LED Corridor Lighting',
    category: 'Safety & Lighting',
    description: 'Install 10 high-efficiency directional LED streetlights along dark alleys and pedestrian paths.',
    capex: 12000,
    monthlyOpex: 240,
    icon: 'Lightbulb',
    enabled: false,
    affectedAspects: ['Nighttime Safety', 'Detour Elimination', 'Crime Prevention'],
    keyTradeoff: 'Slight light spillover on lower apartment windows; initial installation roadwork.',
  },
  {
    id: 'NIGHT_BUS_ROUTE',
    name: 'Owl Night Bus Service (Route #4)',
    category: 'Public Transit',
    description: 'Extend transit operations from 21:00 to 03:00 with 15-minute headway connecting Metro to residential blocks.',
    capex: 4500,
    monthlyOpex: 3800,
    icon: 'Bus',
    enabled: false,
    affectedAspects: ['Transit Accessibility', 'Late-Shift Commute', 'Female Worker Mobility'],
    keyTradeoff: 'Higher monthly municipal subsidy; occasional diesel noise near quiet stops.',
  },
  {
    id: 'ACCESSIBLE_PUBLIC_TOILETS',
    name: 'Automated Universal Restroom Pod',
    category: 'Sanitation & Health',
    description: 'Install a self-cleaning, ADA-compliant public restroom at the central transit plaza.',
    capex: 18000,
    monthlyOpex: 450,
    icon: 'Bath',
    enabled: false,
    affectedAspects: ['Senior Dignity', 'Gig Worker Support', 'Public Hygiene'],
    keyTradeoff: 'Maintenance upkeep requires weekly sanitation contract; queue during peak morning.',
  },
  {
    id: 'COMMUNITY_SAFETY_KIOSK',
    name: 'Neighborhood Patrol & Emergency Kiosk',
    category: 'Safety & Lighting',
    description: 'Establish a volunteer safety post and one-touch emergency call intercom box in central plaza.',
    capex: 6500,
    monthlyOpex: 350,
    icon: 'Shield',
    enabled: false,
    affectedAspects: ['Perceived Safety Halo', 'Emergency Response', 'Community Trust'],
    keyTradeoff: 'Requires community volunteer scheduling or auxiliary staffing.',
  },
  {
    id: 'TRAFFIC_CALMING_ZONE',
    name: 'School Zone Pedestrian Priority',
    category: 'Urban Mobility',
    description: 'Implement raised crosswalks and speed tables, reducing cut-through vehicular speeds to 15 mph.',
    capex: 8500,
    monthlyOpex: 80,
    icon: 'AlertTriangle',
    enabled: false,
    affectedAspects: ['Child Pedestrian Safety', 'Air Quality', 'Noise Reduction'],
    keyTradeoff: 'Shifts delivery traffic slightly to outer perimeter avenue.',
  },
  {
    id: 'SENIOR_BENCH_NETWORK',
    name: 'Accessible Resting Benches',
    category: 'Urban Mobility',
    description: 'Place ergonomic resting benches every 150 meters along pedestrian walking routes.',
    capex: 3200,
    monthlyOpex: 50,
    icon: 'Armchair',
    enabled: false,
    affectedAspects: ['Elderly Walkability', 'Social Interaction', 'Recreational Dwell'],
    keyTradeoff: 'Minimal; requires routine graffiti cleaning and seasonal weather sealing.',
  },
];

// Helper to build a 16x16 grid
function buildMaplewoodGrid(): DistrictGrid {
  const width = 16;
  const height = 16;
  const tiles: UrbanTile[][] = [];

  for (let y = 0; y < height; y++) {
    const row: UrbanTile[] = [];
    for (let x = 0; x < width; x++) {
      // Default to sidewalk
      let type: UrbanTile['type'] = 'SIDEWALK';
      let isWalkable = true;
      let fearFactor = 0.1;
      let heightVal = 0;
      let name = 'Sidewalk';

      // Roads (cross grid layout)
      if (y === 7 || y === 8 || x === 7 || x === 8) {
        type = 'ROAD';
        isWalkable = true;
        name = 'Main Avenue';
      } else if (
        (x >= 1 && x <= 4 && y >= 1 && y <= 4) ||
        (x >= 11 && x <= 14 && y >= 1 && y <= 4)
      ) {
        // Residential Quadrants
        type = 'RESIDENTIAL';
        isWalkable = false;
        heightVal = 2.4;
        name = 'Maplewood Apartments';
      } else if (x >= 1 && x <= 4 && y >= 11 && y <= 14) {
        // Transit Hub / Plaza
        if (x === 2 && y === 12) {
          type = 'TRANSIT_HUB';
          isWalkable = true;
          name = 'Maplewood Central Metro';
        } else {
          type = 'SIDEWALK';
          name = 'Metro Plaza';
        }
      } else if (x >= 11 && x <= 14 && y >= 11 && y <= 14) {
        // Commercial District / Bodegas
        type = 'COMMERCIAL';
        isWalkable = false;
        heightVal = 1.8;
        name = 'Local Shops & Pharmacy';
      } else if (x >= 5 && x <= 6 && y >= 1 && y <= 6) {
        // Dark Alleyway (problem area!)
        type = 'DARK_ALLEY';
        isWalkable = true;
        fearFactor = 0.85;
        name = 'North Unlit Alley';
      } else if (x >= 9 && x <= 10 && y >= 9 && y <= 10) {
        // Central Pocket Park
        type = 'PARK';
        isWalkable = true;
        fearFactor = 0.4;
        name = 'Community Pocket Park';
      }

      row.push({
        x,
        y,
        type,
        height: heightVal,
        name,
        isWalkable,
        fearFactor,
      });
    }
    tiles.push(row);
  }

  // Baseline amenities
  const amenities: Amenity[] = [
    {
      id: 'bl-light-1',
      type: 'STREETLIGHT',
      position: { x: 7, y: 7 },
      radius: 2,
      activeHours: [18, 6],
      name: 'Main Ave Lamp',
      description: 'Standard roadway streetlamp',
      capex: 0,
      monthlyOpex: 20,
      isPolicyAdded: false,
    },
    {
      id: 'bl-light-2',
      type: 'STREETLIGHT',
      position: { x: 8, y: 12 },
      radius: 2,
      activeHours: [18, 6],
      name: 'Metro Plaza Light',
      description: 'Plaza light',
      capex: 0,
      monthlyOpex: 20,
      isPolicyAdded: false,
    },
  ];

  const transitRoutes: TransitRoute[] = [
    {
      id: 'bus-daytime',
      name: 'Route #4 (Daytime Only: 06:00 - 21:00)',
      stops: [
        { x: 2, y: 12 },
        { x: 7, y: 8 },
        { x: 12, y: 8 },
        { x: 12, y: 2 },
      ],
      activeHours: [6, 21],
      headwayMinutes: 20,
      monthlyOpex: 2200,
      color: '#3b82f6',
      isPolicyAdded: false,
    },
  ];

  return { width, height, tiles, amenities, transitRoutes };
}

export const SCENARIO_1: Scenario = {
  id: 'maplewood-night-safety',
  title: 'Maplewood District: Late-Night Transit & Corridor Safety',
  subtitle: 'Dark Alleys, 21:00 Bus Cutoffs, and Night-Shift Workers',
  description:
    'Maplewood is a vibrant mixed neighborhood, but after 21:00, transit stops running and the northern pedestrian corridors go pitch dark. Female healthcare workers, late baristas, and students face severe anxiety and 15-minute detours walking home from the Metro.',
  defaultHour: 23.5, // 23:30 night
  district: buildMaplewoodGrid(),
  baselinePolicies: [],
  recommendedPolicies: ['STREETLIGHT_NETWORK', 'NIGHT_BUS_ROUTE', 'ACCESSIBLE_PUBLIC_TOILETS'],
  citizens: [
    {
      id: 'c1',
      name: 'Elena Rostova',
      age: 29,
      gender: 'Female',
      role: 'Night-Shift ER Nurse',
      avatar: '👩‍⚕️',
      incomeTier: 'Medium',
      mobility: 'STANDARD',
      speed: 4.2,
      safetySensitivity: 0.88,
      transitDependency: 0.9,
      needsRestroom: false,
      origin: { x: 2, y: 12 }, // Metro Hub
      destination: { x: 12, y: 2 }, // Residential Block A
      originName: 'Central Metro Hub',
      destinationName: 'Elm Apartments (Home)',
      departureTime: 23.5,
      purpose: 'Returning home exhausted after 12-hour trauma center shift',
      voiceQuote:
        'I dread the 4-block walk from the metro after 11 PM. That north alley is pitch black. I take the 15-minute detour around the outer boulevard every single night.',
    },
    {
      id: 'c2',
      name: 'Tyler Johnson',
      age: 22,
      gender: 'Male',
      role: 'Late Barista & Student',
      avatar: '🧑‍🎓',
      incomeTier: 'Low',
      mobility: 'STANDARD',
      speed: 4.5,
      safetySensitivity: 0.65,
      transitDependency: 0.85,
      needsRestroom: true,
      restroomUrgencyHour: 23.5,
      origin: { x: 13, y: 12 }, // Commercial cafe
      destination: { x: 3, y: 2 }, // Student shared housing
      originName: 'Main Street Cafe',
      destinationName: 'Student Shared Flat',
      departureTime: 23.3,
      purpose: 'Closing shift finished; commuting home on foot',
      voiceQuote:
        'The bus stops right at 9 PM. If you work closing shifts, you are completely on your own on foot in the dark.',
    },
    {
      id: 'c3',
      name: 'Arthur Pendelton',
      age: 72,
      gender: 'Male',
      role: 'Retired Postal Clerk',
      avatar: '👴',
      incomeTier: 'Low',
      mobility: 'CANE_SENIOR',
      speed: 2.1,
      safetySensitivity: 0.75,
      transitDependency: 0.95,
      needsRestroom: true,
      restroomUrgencyHour: 21.0,
      origin: { x: 3, y: 3 }, // Home
      destination: { x: 12, y: 12 }, // 24/7 Pharmacy
      originName: 'Residence',
      destinationName: 'Late-Night Pharmacy',
      departureTime: 21.2,
      purpose: 'Urgent prescription refill for heart medication',
      voiceQuote:
        'Walking with a cane at night is frightening when there is no lighting to see uneven sidewalk cracks or oncoming cyclists.',
    },
    {
      id: 'c4',
      name: 'Mei-Ling Zhou',
      age: 33,
      gender: 'Female',
      role: 'Gig Delivery Courier',
      avatar: '🛵',
      incomeTier: 'Medium',
      mobility: 'STANDARD',
      speed: 4.0,
      safetySensitivity: 0.7,
      transitDependency: 0.3,
      needsRestroom: true,
      restroomUrgencyHour: 23.0,
      origin: { x: 12, y: 13 },
      destination: { x: 2, y: 3 },
      originName: 'Commercial Kitchens',
      destinationName: 'Northwest Delivery Drop',
      departureTime: 23.1,
      purpose: 'Delivering late-night meal orders',
      voiceQuote:
        'Finding a clean restroom open after 10 PM in this district is virtually impossible. We are forced to hold it for entire shifts.',
    },
    {
      id: 'c5',
      name: 'Marcus Bell',
      age: 44,
      gender: 'Male',
      role: 'High School Chemistry Teacher',
      avatar: '👨‍🏫',
      incomeTier: 'Medium',
      mobility: 'STANDARD',
      speed: 4.3,
      safetySensitivity: 0.45,
      transitDependency: 0.5,
      needsRestroom: false,
      origin: { x: 7, y: 12 },
      destination: { x: 13, y: 3 },
      originName: 'Community Center',
      destinationName: 'Home',
      departureTime: 22.5,
      purpose: 'Volunteered at evening robotics league',
      voiceQuote:
        'If the city put streetlights and an owl bus line through here, this neighborhood would flourish at night.',
    },
    {
      id: 'c6',
      name: 'Sofia Al-Mansoor',
      age: 20,
      gender: 'Female',
      role: 'Undergraduate Biology Major',
      avatar: '👩‍🎓',
      incomeTier: 'Low',
      mobility: 'STANDARD',
      speed: 4.4,
      safetySensitivity: 0.92,
      transitDependency: 0.9,
      needsRestroom: false,
      origin: { x: 2, y: 12 },
      destination: { x: 4, y: 2 },
      originName: 'Metro Station (from Campus)',
      destinationName: 'Apartment',
      departureTime: 23.8,
      purpose: 'Returning from late study session at university library',
      voiceQuote:
        'My roommate and I share live location links every time we walk from the train. We call each other until we reach the front door lock.',
    },
    {
      id: 'c7',
      name: 'Darius Vance',
      age: 38,
      gender: 'Male',
      role: 'Subway Station Custodian',
      avatar: '👷',
      incomeTier: 'Low',
      mobility: 'STANDARD',
      speed: 4.1,
      safetySensitivity: 0.5,
      transitDependency: 0.8,
      needsRestroom: false,
      origin: { x: 2, y: 12 },
      destination: { x: 14, y: 4 },
      originName: 'Metro Station Staff Exit',
      destinationName: 'East Apartments',
      departureTime: 0.5, // 00:30
      purpose: 'End of night transit cleaning shift',
      voiceQuote:
        'I clean the trains for the city all night, but when I step out on the street, the city transit has already abandoned my commute.',
    },
    {
      id: 'c8',
      name: 'Patricia Gomez',
      age: 64,
      gender: 'Female',
      role: 'Hospital Laundry Attendant',
      avatar: '👵',
      incomeTier: 'Low',
      mobility: 'WHEELCHAIR',
      speed: 2.4,
      safetySensitivity: 0.82,
      transitDependency: 1.0,
      needsRestroom: true,
      restroomUrgencyHour: 22.0,
      origin: { x: 2, y: 12 },
      destination: { x: 3, y: 4 },
      originName: 'Metro Elevator',
      destinationName: 'Accessible Ground Unit',
      departureTime: 22.2,
      purpose: 'Returning home from evening hospital shift',
      voiceQuote:
        'Curbs without ramps and dark unlit crosswalks turn a 400-meter journey in my wheelchair into a terrifying obstacle course.',
    },
  ],
};

export const ALL_SCENARIOS = [SCENARIO_1];
