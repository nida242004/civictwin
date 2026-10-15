import { describe, expect, it } from "vitest";
import { parseOsmXml, validateBbox } from "@/lib/geo/osm";

describe("validateBbox", () => {
  it("accepts a small bbox", () => {
    expect(validateBbox(12.9, 12.905, 77.6, 77.605)).toBeNull();
  });
  it("rejects inverted, NaN, out-of-range and huge boxes", () => {
    expect(validateBbox(12.9, 12.8, 77.6, 77.605)).toMatch(/inverted/);
    expect(validateBbox(NaN, 1, 1, 2)).toMatch(/invalid/);
    expect(validateBbox(-95, 1, 1, 2)).toMatch(/range/);
    expect(validateBbox(12.9, 13.1, 77.6, 77.8)).toMatch(/too large/);
  });
});

describe("parseOsmXml", () => {
  const xml = `<osm>
<node id="1" lat="12.9" lon="77.6"/>
<node id="2" lat="12.901" lon="77.601"/>
<node id="3" lat="12.902" lon="77.602"><tag k="highway" v="bus_stop"/><tag k="name" v="A &amp; B"/></node>
<way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="residential"/></way>
<way id="11"><nd ref="1"/><nd ref="2"/><tag k="waterway" v="drain"/></way>
</osm>`;
  it("builds way geometry and keeps relevant nodes only", () => {
    const els = parseOsmXml(xml);
    expect(els).toHaveLength(2);
    const way = els.find((e) => e.type === "way")!;
    expect(way.geometry).toHaveLength(2);
    const node = els.find((e) => e.type === "node")!;
    expect(node.tags?.name).toBe("A & B");
  });
});
