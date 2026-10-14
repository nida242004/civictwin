/**
 * Last-resort procedural society layout when neither OSM nor Gemini returns
 * geometry. Deterministic per bbox, aligned to the bbox-centered world so the
 * satellite ground still lines up. Everything is flagged inferred ("estimated").
 */

import type { Building, Road, World } from "../world/types";

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function proceduralSociety(bounds: { width: number; depth: number }, bbox: [number, number, number, number]): World {
  const r = rng(Math.round(Math.abs(bbox[0] * 1e5) + Math.abs(bbox[2] * 1e5)));
  const hw = bounds.width / 2 - 12;
  const hd = bounds.depth / 2 - 12;
  const roads: Road[] = [];
  const buildings: Building[] = [];
  // internal road spine + cross streets every ~70 m
  roads.push({ id: "rd_est_spine", points: [{ x: 0, z: hd }, { x: 0, z: -hd }], width: 6, category: "road", pedestrian: true, inferred: true });
  const step = 70;
  let k = 0;
  for (let z = -hd + step / 2; z < hd; z += step) {
    roads.push({ id: `rd_est_x${k++}`, points: [{ x: -hw + 6, z }, { x: hw - 6, z }], width: 5, category: "road", pedestrian: true, inferred: true });
    for (let x = -hw + 25; x < hw - 15; x += 38) {
      if (Math.abs(x) < 14) continue;
      for (const side of [-1, 1]) {
        const bz = z + side * 18;
        if (Math.abs(bz) > hd - 10) continue;
        const floors = 4 + Math.floor(r() * 10);
        buildings.push({
          id: `bd_est_${buildings.length}`,
          x,
          z: bz,
          width: 20 + r() * 8,
          depth: 14 + r() * 4,
          rotation: 0,
          height: floors * 3,
          floors,
          category: "residential",
          occupancy: floors * 8,
          inferred: true,
        });
      }
    }
  }
  return {
    bounds,
    roads,
    buildings: buildings.slice(0, 80),
    facilities: [{ id: "fc_est_park", name: "Central lawn (estimated)", type: "park", x: hw / 2, z: 0, radius: 18, inferred: true }],
    streetlights: [],
    cameras: [],
    guards: [],
    site: {
      walls: [{ id: "wl_est", closed: true, height: 2.4, inferred: true, points: [{ x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: hd }, { x: -hw, z: hd }] }],
      gates: [{ id: "gt_est_main", name: "Main gate (estimated)", kind: "main", x: 0, z: hd, inferred: true }],
      areas: [],
      booths: [{ id: "bt_est", x: 8, z: hd - 6, note: "Estimated guard booth beside the main gate", inferred: true }],
    },
  };
}
