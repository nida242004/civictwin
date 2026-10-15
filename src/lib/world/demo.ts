/**
 * Bundled deterministic demonstration society — "Shanti Vihar RWA".
 *
 * A gated Indian residential welfare association laid out as a 3×3 grid:
 * the centre cell is a park with a Shiv Mandir, a clubhouse and a kids'
 * play area; the eight outer cells each hold an apartment tower (Block A–H).
 * One guarded main gate on the south wall, a padlocked service gate on the
 * north wall, a walking track along the compound wall, and a few deliberate
 * — realistic — security gaps (dark back corners, faulty lamps, CCTV only at
 * the gate and clubhouse, a patrol that skips the back of the society).
 *
 * Fully procedural local geometry (no remote map provider). Deterministic:
 * the same layout is generated every time. Fictional place names.
 */

import type {
  Building,
  CctvCamera,
  Facility,
  Guard,
  Road,
  SiteLayers,
  Streetlight,
  Vec2,
  World,
} from "./types";
import { defaultScenario } from "./types";
import { seededId } from "./ids";

export const DEMO_PROJECT_ID = "demo_shanti_vihar_rwa";
export const DEMO_NAME = "Shanti Vihar RWA";
/** Names of earlier bundled demos (used to migrate saved projects on load / reset). */
export const LEGACY_DEMO_NAMES = ["Vasanth Nagar East"];
export const LEGACY_DEMO_IDS = ["demo_vasanth_nagar_east"];
export const DEMO_DESCRIPTION =
  "A fictional gated residential society (RWA) used for demonstrations: eight apartment blocks around a central park with a Shiv Mandir, clubhouse and kids' play area, one guarded main gate, a padlocked service gate, a compound wall with a walking track — and a few realistic gaps: dark back corners, faulty lamps, CCTV only at the gate and clubhouse. Fully editable.";

/**
 * Seed of the bundled demo night. Chosen so the default Typical Night tells the
 * full story: a wall-climb at the dark corner behind Block F → chain snatching in
 * a blind spot → a patrol responding from across the society → escape over the
 * wall; later a burglary via the padlocked service gate and the gate guard dozing.
 */
export const DEMO_SEED = 62;

/** Wall half-extent (compound wall is a square ±WALL). */
const WALL = 104;
/** Walking-track half-extent (inside the wall). */
const TRACK = 92;
/** Grid drives (the "#" of the 3×3 layout). */
const GRID = 35;

const W = 264;
const D = 264;

export function buildDemoWorld(): World {
  const roads: Road[] = [];
  const buildings: Building[] = [];
  const facilities: Facility[] = [];
  const streetlights: Streetlight[] = [];
  const cameras: CctvCamera[] = [];
  const guards: Guard[] = [];

  let rn = 0;
  const road = (name: string, points: Vec2[], width: number, category: "road" | "path" = "road") => {
    roads.push({ id: seededId("rd", rn++), name, points, width, category, pedestrian: true });
  };

  /* ------------------------- roads ------------------------- */
  // outside the wall
  road("100 Ft Main Road", [{ x: -W / 2, z: 121 }, { x: W / 2, z: 121 }], 9);
  road("Back Service Lane", [{ x: 0, z: -119 }, { x: W / 2, z: -119 }], 4);
  // internal 3×3 grid drives (the centre square is the park ring)
  road("West Drive", [{ x: -GRID, z: -TRACK }, { x: -GRID, z: TRACK }], 6);
  road("East Drive", [{ x: GRID, z: -TRACK }, { x: GRID, z: TRACK }], 6);
  road("North Drive", [{ x: -TRACK, z: -GRID }, { x: TRACK, z: -GRID }], 6);
  road("South Drive", [{ x: -TRACK, z: GRID }, { x: TRACK, z: GRID }], 6);
  // main gate drive (outer road → gate → park ring)
  road("Main Gate Drive", [{ x: 0, z: 121 }, { x: 0, z: WALL }, { x: 0, z: GRID }], 7);
  // service lane through the padlocked north gate
  road("Service Lane", [{ x: 52, z: -TRACK }, { x: 52, z: -WALL }, { x: 52, z: -119 }], 4);
  // walking track along the compound wall
  road(
    "Walking Track",
    [
      { x: -TRACK, z: -TRACK },
      { x: TRACK, z: -TRACK },
      { x: TRACK, z: TRACK },
      { x: -TRACK, z: TRACK },
      { x: -TRACK, z: -TRACK },
    ],
    2.6,
    "path"
  );
  // park paths
  const parkC = { x: -8, z: 6 };
  const loop: Vec2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    loop.push({ x: parkC.x + Math.cos(a) * 15, z: parkC.z + Math.sin(a) * 13 });
  }
  road("Park Loop", [...loop, loop[0]], 2.2, "path");
  road("Park Cross Path", [{ x: -GRID, z: parkC.z }, { x: GRID, z: parkC.z }], 2.4, "path");
  road("Mandir Path", [{ x: 14, z: -GRID }, { x: 14, z: GRID }], 2.4, "path");

  /* ------------------------- blocks ------------------------- */
  interface BlockSpec {
    letter: string;
    x: number;
    z: number;
    w: number;
    d: number;
    floors: number;
    /** entrance point + where its footpath meets the drive */
    door: Vec2;
    spoke: Vec2;
    occ: number;
  }
  const blocks: BlockSpec[] = [
    { letter: "A", x: 21, z: 64, w: 22, d: 24, floors: 6, door: { x: 10, z: 64 }, spoke: { x: 0, z: 64 }, occ: 46 },
    { letter: "B", x: 64, z: 63, w: 26, d: 18, floors: 7, door: { x: 64, z: 54 }, spoke: { x: 64, z: GRID }, occ: 52 },
    { letter: "C", x: 64, z: 0, w: 18, d: 30, floors: 8, door: { x: 55, z: 0 }, spoke: { x: GRID, z: 0 }, occ: 60 },
    { letter: "D", x: 64, z: -63, w: 26, d: 18, floors: 6, door: { x: 64, z: -54 }, spoke: { x: 64, z: -GRID }, occ: 44 },
    { letter: "E", x: 0, z: -64, w: 30, d: 18, floors: 7, door: { x: 0, z: -55 }, spoke: { x: 0, z: -GRID }, occ: 54 },
    { letter: "F", x: -64, z: -63, w: 26, d: 18, floors: 5, door: { x: -64, z: -54 }, spoke: { x: -64, z: -GRID }, occ: 38 },
    { letter: "G", x: -64, z: 0, w: 18, d: 30, floors: 8, door: { x: -55, z: 0 }, spoke: { x: -GRID, z: 0 }, occ: 58 },
    { letter: "H", x: -64, z: 63, w: 26, d: 18, floors: 6, door: { x: -64, z: 54 }, spoke: { x: -64, z: GRID }, occ: 46 },
  ];
  blocks.forEach((b, i) => {
    buildings.push({
      id: seededId("bd_blk", i),
      name: `Block ${b.letter}`,
      x: b.x,
      z: b.z,
      width: b.w,
      depth: b.d,
      rotation: 0,
      height: b.floors * 3,
      floors: b.floors,
      category: "residential",
      occupancy: b.occ,
      entrance: b.door,
    });
    // start the footpath just outside the door so the entrance connector links to it
    const len = Math.hypot(b.spoke.x - b.door.x, b.spoke.z - b.door.z);
    const start = { x: b.door.x + ((b.spoke.x - b.door.x) / len) * 0.8, z: b.door.z + ((b.spoke.z - b.door.z) / len) * 0.8 };
    road(`Block ${b.letter} Footpath`, [start, b.spoke], 2.2, "path");
  });

  // centre: Shiv Mandir + clubhouse; near the gate: a small kirana store
  buildings.push({
    id: seededId("bd_mandir", 0),
    name: "Shiv Mandir",
    x: 18,
    z: -17,
    width: 11,
    depth: 14,
    rotation: 0,
    height: 13,
    floors: 1,
    category: "community",
    occupancy: 2,
    entrance: { x: 18, z: -9.5 },
  });
  buildings.push({
    id: seededId("bd_club", 0),
    name: "Clubhouse",
    x: 17,
    z: 20,
    width: 15,
    depth: 10,
    rotation: 0,
    height: 6,
    floors: 2,
    category: "community",
    occupancy: 4,
    entrance: { x: 17, z: 25.5 },
  });
  buildings.push({
    id: seededId("bd_shop", 0),
    name: "Daily Needs Kirana Store",
    x: -21,
    z: 46,
    width: 11,
    depth: 7,
    rotation: 0,
    height: 4,
    floors: 1,
    category: "commercial",
    occupancy: 2,
    entrance: { x: -21, z: 42 },
  });

  /* ------------------------- facilities ------------------------- */
  let fn = 0;
  const fac = (f: Omit<Facility, "id">) => facilities.push({ id: seededId("fc", fn++), ...f });
  fac({ name: "Central Park", type: "park", x: parkC.x, z: parkC.z + 2, radius: 19 });
  fac({ name: "Shiv Mandir", type: "place_of_worship", x: 18, z: -17 });
  fac({ name: "Clubhouse", type: "community_centre", x: 17, z: 20 });
  fac({ name: "Kids' Play Area", type: "other", x: -22, z: -18 });
  fac({ name: "Bus Stop · 100 Ft Main Road", type: "bus_stop", x: 22, z: 125 });

  /* ------------------------- streetlights ------------------------- */
  let ln = 0;
  const lamp = (x: number, z: number, opts?: Partial<Streetlight>) => {
    streetlights.push({
      id: seededId("sl", ln++),
      x,
      z,
      height: 7,
      brightness: 0.85,
      radius: 18,
      on: true,
      maintenance: "ok",
      ...opts,
    });
  };
  // outer main road
  for (let x = -120; x <= 120; x += 30) lamp(x, 126);
  // gate drive
  for (const z of [110, 96, 80, 62, 46]) lamp(z > WALL ? -5.5 : 5, z);
  // grid drives — dense near the park ring, sparse out toward the wall
  const gridStops = [-80, -58, -20, 0, 20, 58, 80];
  for (const s of gridStops) {
    // the north-west arms (toward Block F) were never properly lit: one lamp missing, one faulty
    const nwArm = s < -GRID;
    if (!(nwArm && s === -58)) lamp(-GRID - 4, s, nwArm ? { maintenance: "faulty" } : undefined);
    lamp(GRID + 4, s);
    if (!(nwArm && s === -58)) lamp(s, -GRID - 4, nwArm ? { maintenance: "faulty" } : undefined);
    lamp(s, GRID + 4);
  }
  for (const [x, z] of [[-GRID, -GRID], [GRID, -GRID], [GRID, GRID], [-GRID, GRID]] as const) lamp(x + Math.sign(x) * 4, z + Math.sign(z) * 4);
  // walking track: lit on the gate (south) and east sides, sparse on the back
  for (let x = -70; x <= 70; x += 35) lamp(x, TRACK + 4, { height: 5, brightness: 0.7, radius: 15 });
  for (let z = -70; z <= 70; z += 35) lamp(TRACK + 4, z, { height: 5, brightness: 0.7, radius: 15 });
  lamp(-TRACK - 4, 50, { height: 5, brightness: 0.7, radius: 15 });
  lamp(-TRACK - 4, -10, { height: 5, brightness: 0.7, radius: 15 });
  lamp(-TRACK - 4, -64, { height: 5, brightness: 0.7, radius: 15, maintenance: "faulty" }); // behind Block F
  lamp(-64, -TRACK - 4, { height: 5, brightness: 0.7, radius: 15, maintenance: "faulty" }); // behind Block F
  lamp(0, -TRACK - 4, { height: 5, brightness: 0.7, radius: 15 });
  lamp(64, -TRACK - 4, { height: 5, brightness: 0.7, radius: 15, maintenance: "faulty" }); // service gate corner
  // park — low bollard-style lamps
  for (let i = 0; i < 10; i += 3) lamp(loop[i].x, loop[i].z, { height: 4, brightness: 0.55, radius: 12 });
  lamp(18, -6, { height: 4, brightness: 0.75, radius: 12 }); // mandir forecourt
  lamp(26, 28, { height: 4.5, brightness: 0.75, radius: 13 }); // clubhouse
  // outside the service gate: nothing.

  /* ------------------------- CCTV ------------------------- */
  // only at the main gate and the clubhouse — the rest of the society is a blind spot
  cameras.push({ id: seededId("cam", 0), x: -6, z: 101, height: 5, range: 30, fovDeg: 90, orientationDeg: 270, active: true }); // gate → inside
  cameras.push({ id: seededId("cam", 1), x: 6, z: 106, height: 5, range: 22, fovDeg: 100, orientationDeg: 90, active: true }); // gate → road
  cameras.push({ id: seededId("cam", 2), x: 26, z: 14, height: 5, range: 26, fovDeg: 100, orientationDeg: 200, active: true }); // clubhouse / park

  /* ------------------------- guards ------------------------- */
  guards.push({
    id: seededId("gd", 0),
    name: "Gate Guard Ramesh",
    speed: 1.1,
    waypoints: [
      { x: 6, z: 98 },
      { x: 4, z: 92 },
      { x: -4, z: 96 },
    ],
    active: true,
  });
  guards.push({
    id: seededId("gd", 1),
    name: "Patrol Suresh",
    speed: 1.15,
    waypoints: [
      { x: -GRID, z: GRID },
      { x: -GRID, z: -GRID },
      { x: GRID, z: -GRID },
      { x: GRID, z: GRID },
    ],
    active: true,
  });
  guards.push({
    id: seededId("gd", 2),
    name: "Patrol Mohan",
    speed: 1.1,
    waypoints: [
      { x: 0, z: TRACK },
      { x: TRACK, z: TRACK },
      { x: TRACK, z: -GRID },
      { x: GRID, z: -GRID },
      { x: GRID, z: GRID },
      { x: 0, z: GRID },
    ],
    active: true,
  });

  /* ------------------------- site layers ------------------------- */
  const site: SiteLayers = {
    walls: [
      {
        id: "wl_compound",
        points: [
          { x: -WALL, z: -WALL },
          { x: WALL, z: -WALL },
          { x: WALL, z: WALL },
          { x: -WALL, z: WALL },
        ],
        closed: true,
        height: 2.4,
      },
    ],
    gates: [
      { id: "gt_main", name: "the main gate", kind: "main", x: 0, z: WALL },
      { id: "gt_service", name: "the service gate", kind: "service", x: 52, z: -WALL },
    ],
    booths: [{ id: "bt_main", x: 9, z: 98, note: "Main gate security cabin — guard on duty 24×7, visitor register" }],
    areas: [
      { id: "ar_park_visitor", kind: "parking", name: "Visitor Parking", x: -19, z: 70, width: 22, depth: 26, rotation: 0 },
      { id: "ar_park_b", kind: "parking", name: "Block B Parking", x: 64, z: 81, width: 30, depth: 10, rotation: 0 },
      { id: "ar_park_h", kind: "parking", name: "Block H Parking", x: -64, z: 81, width: 30, depth: 10, rotation: 0 },
      { id: "ar_park_e", kind: "parking", name: "Block E Parking", x: 0, z: -80, width: 34, depth: 9, rotation: 0 },
      {
        id: "ar_dark_f",
        kind: "dark",
        name: "Back corner behind Block F",
        x: -72,
        z: -72,
        width: 64,
        depth: 64,
        rotation: 0,
        note: "Unlit corner along the compound wall — lamps faulty, no CCTV, not on any patrol route",
      },
      {
        id: "ar_dark_service",
        kind: "dark",
        name: "Service gate corner",
        x: 70,
        z: -94,
        width: 34,
        depth: 16,
        rotation: 0,
        note: "Padlocked service gate — unguarded and dark at night",
      },
    ],
  };

  return {
    bounds: { width: W, depth: D },
    roads,
    buildings,
    facilities,
    streetlights,
    cameras,
    guards,
    site,
  };
}

/* ------------------------------------------------------------------ */

/** True when a saved project is an older bundled demo that should be replaced by the current one. */
export function isLegacyDemo(p: { projectId?: string; name?: string; source?: { kind?: string } }): boolean {
  if (p.source?.kind !== "demo") return false;
  return LEGACY_DEMO_IDS.includes(p.projectId ?? "") || LEGACY_DEMO_NAMES.includes(p.name ?? "");
}

export function makeDemoProject() {
  const world = buildDemoWorld();
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    projectId: DEMO_PROJECT_ID,
    name: DEMO_NAME,
    description: DEMO_DESCRIPTION,
    createdAt: now,
    modifiedAt: now,
    source: { kind: "demo" as const },
    world,
    scenario: { ...defaultScenario("typical_night"), seed: DEMO_SEED },
    baselineRun: null,
    interventionRun: null,
  };
}
