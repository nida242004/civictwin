/**
 * Bundled deterministic demonstration neighborhood — "Vasanth Nagar East".
 *
 * Fully procedural local geometry (no remote map provider). Deterministic:
 * the same layout is generated every time. Fictional place names.
 */

import type { Building, Facility, Guard, Road, Streetlight, CctvCamera, World, BuildingCategory } from "./types";
import { defaultScenario } from "./types";
import { seededId } from "./ids";
import { makeRng } from "../sim/rng";

export const DEMO_PROJECT_ID = "demo_vasanth_nagar_east";
export const DEMO_NAME = "Vasanth Nagar East";
export const DEMO_DESCRIPTION =
  "A fictional mid-size Indian neighborhood used for demonstrations: two main roads, three cross lanes, a small bazaar street, a lakeside park, a bus stop, and a community centre. Comes with street lighting, a few CCTV cameras, and two night patrol guards. Fully editable.";

const W = 420;
const D = 340;

export function buildDemoWorld(): World {
  const rng = makeRng(0xdea1);
  const roads: Road[] = [];
  const buildings: Building[] = [];
  const facilities: Facility[] = [];
  const streetlights: Streetlight[] = [];
  const cameras: CctvCamera[] = [];
  const guards: Guard[] = [];

  let n = 0;

  /* ------------------------- roads ------------------------- */
  // horizontal main roads + cross lanes
  const hRoads: { z: number; width: number; name: string; category: "road" | "path" }[] = [
    { z: -90, width: 8, name: "1st Main Road", category: "road" },
    { z: -10, width: 5.5, name: "1st Cross Lane", category: "road" },
    { z: 70, width: 5.5, name: "2nd Cross Lane", category: "road" },
    { z: 140, width: 7, name: "Lake View Road", category: "road" },
  ];
  const vRoads: { x: number; width: number; name: string }[] = [
    { x: -150, width: 6.5, name: "East Avenue" },
    { x: -30, width: 6.5, name: "Bazaar Street" },
    { x: 90, width: 6.5, name: "Temple Street" },
  ];

  for (const [i, r] of hRoads.entries()) {
    roads.push({
      id: seededId("rd_h", i),
      name: r.name,
      points: [
        { x: -W / 2, z: r.z },
        { x: W / 2, z: r.z },
      ],
      width: r.width,
      category: r.category,
      pedestrian: true,
    });
  }
  for (const [i, r] of vRoads.entries()) {
    roads.push({
      id: seededId("rd_v", i),
      name: r.name,
      points: [
        { x: r.x, z: -D / 2 },
        { x: r.x, z: D / 2 },
      ],
      width: r.width,
      category: "road",
      pedestrian: true,
    });
  }

  // pedestrian gully path between Bazaar St and Temple St
  roads.push({
    id: seededId("rd_p", 0),
    name: "Gully Path",
    points: [
      { x: -30, z: 30 },
      { x: 20, z: 30 },
      { x: 20, z: 70 },
    ],
    width: 2.2,
    category: "path",
    pedestrian: true,
  });
  // park entrance path connecting the loop to Temple Street
  roads.push({
    id: seededId("rd_p", 2),
    name: "Park Entrance Path",
    points: [
      { x: 90, z: 20 },
      { x: 124, z: 20 },
    ],
    width: 2.2,
    category: "path",
    pedestrian: true,
  });
  // park loop
  const parkC = { x: 150, z: 20 };
  const loop: { x: number; z: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    loop.push({ x: parkC.x + Math.cos(a) * 26, z: parkC.z + Math.sin(a) * 22 });
  }
  roads.push({
    id: seededId("rd_p", 1),
    name: "Park Loop Path",
    points: [...loop, loop[0]],
    width: 2,
    category: "path",
    pedestrian: true,
  });

  /* ------------------------- buildings ------------------------- */
  const vcx = vRoads.map((v) => v.x);
  const nearV = (x: number) => vcx.some((vx) => Math.abs(x - vx) < 10);

  interface RowSpec {
    z: number;
    side: 1 | -1; // 1 = building south of road (entrance faces north/-z side is road) → entrance at z - side*offset
    x0: number;
    x1: number;
    base: BuildingCategory;
    namePrefix: string;
  }

  const rows: RowSpec[] = [
    { z: -90, side: -1, x0: -W / 2 + 14, x1: W / 2 - 14, base: "residential", namePrefix: "1st Main" }, // north side
    { z: -90, side: 1, x0: -W / 2 + 14, x1: W / 2 - 14, base: "commercial", namePrefix: "1st Main" }, // south side shops
    { z: -10, side: -1, x0: -W / 2 + 20, x1: W / 2 - 40, base: "residential", namePrefix: "1st Cross" },
    { z: -10, side: 1, x0: -W / 2 + 20, x1: 110, base: "residential", namePrefix: "1st Cross" },
    { z: 70, side: -1, x0: -W / 2 + 20, x1: 100, base: "residential", namePrefix: "2nd Cross" },
    { z: 70, side: 1, x0: -W / 2 + 20, x1: W / 2 - 50, base: "residential", namePrefix: "2nd Cross" },
    { z: 140, side: -1, x0: -W / 2 + 14, x1: W / 2 - 14, base: "mixed", namePrefix: "Lake View" },
  ];

  let bn = 0;
  for (const [ri, row] of rows.entries()) {
    let x = row.x0;
    while (x < row.x1) {
      const w = rng.range(11, 19);
      const gap = rng.range(4, 9);
      if (x + w > row.x1) break;
      const cx = x + w / 2;
      x += w + gap;
      if (nearV(cx)) continue;
      // skip park area
      if (Math.abs(cx - parkC.x) < 52 && Math.abs(row.z - parkC.z) < 60) continue;

      const category: BuildingCategory =
        row.base === "residential" && rng.next() < 0.15 ? "commercial" : row.base;
      const isRes = category === "residential" || category === "mixed";
      const floors = isRes ? rng.int(3, 5) : rng.int(1, 2);
      const depth = rng.range(9, 13);
      const setback = 3 + (hRoads.find((h) => h.z === row.z)?.width ?? 5.5) / 2;
      const bz = row.z + row.side * (setback + depth / 2);
      buildings.push({
        id: seededId("bd", bn),
        name: `${row.namePrefix} · ${bn + 1}`,
        x: cx,
        z: bz,
        width: w,
        depth,
        rotation: 0,
        height: floors * 3,
        floors,
        category,
        occupancy: isRes ? rng.int(10, 42) : rng.int(2, 9),
        entrance: { x: cx, z: row.z + row.side * setback },
      });
      bn += 1;
    }
    void ri;
  }

  // bazaar street shops (both sides of Bazaar Street between 1st Main & 2nd Cross)
  for (let k = 0; k < 8; k++) {
    const side = k % 2 === 0 ? 1 : -1;
    const bz = -30 + Math.floor(k / 2) * 34 + side * 7.5;
    if (Math.abs(bz) > 60) continue;
    buildings.push({
      id: seededId("bd_bazaar", k),
      name: `Bazaar Shop ${k + 1}`,
      x: -30 + (side === 1 ? -6.5 : 6.5),
      z: bz,
      width: 8.5,
      depth: 7,
      rotation: 0,
      height: 6,
      floors: 2,
      category: "commercial",
      occupancy: rng.int(2, 6),
      entrance: { x: -30, z: bz + (side === 1 ? -3.5 : 3.5) },
    });
  }

  /* ------------------------- facilities ------------------------- */
  facilities.push({
    id: seededId("fc", n++),
    name: "Vasanth Park",
    type: "park",
    x: parkC.x,
    z: parkC.z,
    radius: 34,
  });
  facilities.push({
    id: seededId("fc", n++),
    name: "Bus Stop · 1st Main",
    type: "bus_stop",
    x: 30,
    z: -95,
  });
  facilities.push({
    id: seededId("fc", n++),
    name: "Community Centre",
    type: "community_centre",
    x: 60,
    z: 44,
  });
  facilities.push({
    id: seededId("fc", n++),
    name: "Night Clinic",
    type: "clinic",
    x: -160,
    z: 25,
  });
  facilities.push({
    id: seededId("fc", n++),
    name: "Sri Muniyappa Temple",
    type: "place_of_worship",
    x: 99,
    z: 115,
  });

  // community centre building
  buildings.push({
    id: seededId("bd_cc", 0),
    name: "Community Centre",
    x: 60,
    z: 40,
    width: 16,
    depth: 10,
    rotation: 0,
    height: 6,
    floors: 2,
    category: "community",
    occupancy: 6,
    entrance: { x: 60, z: 45 },
  });
  bn += 1;

  /* ------------------------- streetlights ------------------------- */
  let ln = 0;
  const addLamp = (x: number, z: number, opts?: Partial<Streetlight>) => {
    streetlights.push({
      id: seededId("sl", ln++),
      x,
      z,
      height: 8,
      brightness: 0.85,
      radius: 19,
      on: true,
      maintenance: "ok",
      ...opts,
    });
  };
  for (const h of hRoads) {
    const spacing = 30;
    for (let x = -W / 2 + 12; x <= W / 2 - 12; x += spacing) {
      addLamp(x, h.z - (Math.round(x / spacing) % 2 === 0 ? 5 : -5));
    }
  }
  for (const v of vRoads) {
    const spacing = 32;
    let k = 0;
    for (let z = -D / 2 + 14; z <= D / 2 - 14; z += spacing) {
      addLamp(v.x + (k % 2 === 0 ? 4.5 : -4.5), z);
      k += 1;
    }
  }
  // park path lighting — dimmer, sparser
  for (let i = 0; i < 8; i += 2) {
    addLamp(loop[i].x, loop[i].z, { height: 5, brightness: 0.55, radius: 13 });
  }
  // a couple of faulty lamps for realism
  if (streetlights[5]) streetlights[5].maintenance = "faulty";
  if (streetlights[17]) streetlights[17].maintenance = "faulty";

  /* ------------------------- CCTV ------------------------- */
  cameras.push({
    id: seededId("cam", 0),
    x: -34,
    z: -84,
    height: 7,
    range: 34,
    fovDeg: 90,
    orientationDeg: 205,
    active: true,
  });
  cameras.push({
    id: seededId("cam", 1),
    x: 118,
    z: 2,
    height: 6.5,
    range: 30,
    fovDeg: 70,
    orientationDeg: 250,
    active: true,
  });
  cameras.push({
    id: seededId("cam", 2),
    x: 26,
    z: -95,
    height: 6,
    range: 26,
    fovDeg: 60,
    orientationDeg: 20,
    active: true,
  });

  /* ------------------------- guards ------------------------- */
  guards.push({
    id: seededId("gd", 0),
    name: "Patrol Alpha",
    speed: 1.15,
    waypoints: [
      { x: -150, z: -90 },
      { x: -30, z: -90 },
      { x: -30, z: -10 },
      { x: -150, z: -10 },
    ],
    active: true,
  });
  guards.push({
    id: seededId("gd", 1),
    name: "Patrol Beta",
    speed: 1.1,
    waypoints: [
      { x: 90, z: -90 },
      { x: 90, z: 70 },
      { x: 124, z: 20 },
      { x: 30, z: -94 },
    ],
    active: true,
  });

  return {
    bounds: { width: W, depth: D },
    roads,
    buildings,
    facilities,
    streetlights,
    cameras,
    guards,
  };
}

/* ------------------------------------------------------------------ */

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
    scenario: defaultScenario("typical_night"),
    baselineRun: null,
    interventionRun: null,
  };
}
