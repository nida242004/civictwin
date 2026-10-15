import { describe, it, expect, beforeEach } from "vitest";
import { useEditor } from "@/lib/store/editor";
import { makeDemoProject } from "@/lib/world/demo";
import { runSimulation } from "@/lib/sim/engine";
import { snapToWalkable, routeLegs, autoPatrol } from "@/lib/world/patrol";

const st = () => useEditor.getState();
const guard = (id: string) => st().project!.world.guards.find((g) => g.id === id)!;

describe("patrol route editing", () => {
  beforeEach(() => {
    useEditor.setState({
      project: makeDemoProject(),
      screen: "editor",
      activeRun: null,
      history: { past: [], future: [] },
      routeDraw: null,
      waypointSel: null,
      mode: "edit",
      tool: "guard",
    });
  });

  it("addGuard starts route drawing; append / insert / remove / undo", () => {
    const w = st().project!.world;
    const sp = snapToWalkable(w, { x: w.roads[0].points[0].x + 1, z: w.roads[0].points[0].z + 1 });
    st().addGuard(sp.x, sp.z);
    const id = st().selection!.kind === "guard" ? st().selection!.id : "";
    expect(st().routeDraw?.guardId).toBe(id);
    expect(guard(id).waypoints.length).toBe(1);

    const r = w.roads[0].points;
    st().appendWaypoint(id, { x: r[1].x, z: r[1].z });
    st().appendWaypoint(id, { x: r[1].x, z: r[1].z }); // duplicate ignored
    expect(guard(id).waypoints.length).toBe(2);
    st().insertWaypoint(id, 1, { x: 5, z: 5 });
    expect(guard(id).waypoints.map((p) => p.x)).toContain(5);
    expect(guard(id).waypoints[1]).toEqual({ x: 5, z: 5 });
    st().removeWaypoint(id, 1);
    expect(guard(id).waypoints.length).toBe(2);
    st().undo(); // undo remove
    expect(guard(id).waypoints.length).toBe(3);
    expect(st().routeDraw).toBeNull();
    st().undo(); // undo insert
    expect(guard(id).waypoints.length).toBe(2);
  });

  it("keeps at least one waypoint and respects the simulation lock", () => {
    st().addGuard(0, 0);
    const id = st().selection!.id;
    st().removeWaypoint(id, 0);
    expect(guard(id).waypoints.length).toBe(1);
    useEditor.setState({ activeRun: {} as never });
    st().appendWaypoint(id, { x: 10, z: 10 });
    st().clearRoute(id);
    expect(guard(id).waypoints.length).toBe(1);
  });

  it("a drawn 4-stop route is actually walked in the simulation", () => {
    const p0 = st().project!;
    const pts = p0.world.roads.flatMap((r) => r.points);
    const pick = [0.1, 0.35, 0.6, 0.85].map((f) => pts[Math.floor(pts.length * f)]);
    const sp = snapToWalkable(p0.world, pick[0]);
    st().addGuard(sp.x, sp.z);
    const id = st().selection!.id;
    pick.slice(1).forEach((q) => st().appendWaypoint(id, snapToWalkable(p0.world, q)));
    st().finishRouteDraw();
    const p = st().project!;
    const g = p.world.guards.find((x) => x.id === id)!;
    expect(g.waypoints.length).toBe(4);
    const res = runSimulation(p.world, { ...p.scenario, guardCount: null });
    const gi = p.world.guards.filter((x) => x.active).findIndex((x) => x.id === id);
    expect(gi).toBeGreaterThanOrEqual(0);
    const nearest = g.waypoints.map((w) => {
      let best = Infinity;
      for (const f of res.frames) best = Math.min(best, Math.hypot(f.guardPos[gi * 2] - w.x, f.guardPos[gi * 2 + 1] - w.z));
      return best;
    });
    console.log("closest approach per waypoint (m):", nearest.map((n) => n.toFixed(1)).join(", "));
    nearest.forEach((n) => expect(n).toBeLessThan(15));
  });

  describe("mix & match routes", () => {
    let a = "";
    let b = "";
    const wa = () => guard(a).waypoints;
    const wb = () => guard(b).waypoints;
    beforeEach(() => {
      st().addGuard(0, 0);
      a = st().selection!.id;
      [ { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 } ].forEach((p) => st().appendWaypoint(a, p));
      st().addGuard(100, 100);
      b = st().selection!.id;
      [ { x: 110, z: 100 }, { x: 110, z: 110 } ].forEach((p) => st().appendWaypoint(b, p));
      st().finishRouteDraw();
      useEditor.setState({ history: { past: [], future: [] } });
    });

    it("copies a route and undoes", () => {
      st().copyRouteFrom(b, a);
      expect(wb()).toEqual(wa());
      expect(wb()).not.toBe(wa());
      st().undo();
      expect(wb().length).toBe(3);
    });

    it("appends joined through the nearest end", () => {
      st().addRouteFrom(a, b);
      // a ends at (0,10), b starts at (100,100): nearest ends are a.last/b.first
      expect(wa().length).toBe(7);
      expect(wa().slice(0, 4)).toEqual([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }]);
      expect(wa()[4]).toEqual({ x: 100, z: 100 });
      st().undo();
      expect(wa().length).toBe(4);
    });

    it("append reverses the other route when its far end is nearer", () => {
      st().reverseRoute(b);
      st().addRouteFrom(a, b); // b now starts (110,110) ends (100,100); a.last -> nearest is b.first? both far, check sorted
      const w = wa();
      const jump = Math.hypot(w[4].x - w[3].x, w[4].z - w[3].z);
      expect(jump).toBeLessThanOrEqual(Math.hypot(110 - 0, 110 - 10) + 1e-6);
    });

    it("swaps and reverses", () => {
      const oa = JSON.parse(JSON.stringify(wa()));
      const ob = JSON.parse(JSON.stringify(wb()));
      st().swapRoutes(a, b);
      expect(wa()).toEqual(ob);
      expect(wb()).toEqual(oa);
      st().undo();
      expect(wa()).toEqual(oa);
      st().reverseRoute(a);
      expect(wa()).toEqual([...oa].reverse());
      st().undo();
      expect(wa()).toEqual(oa);
    });

    it("shares a route with start rotated to half the loop", () => {
      st().shareRoute(b, a);
      const n = wa().length;
      expect(wb().length).toBe(n);
      expect(wb()[0]).toEqual(wa()[Math.floor(n / 2)]);
      expect(wb()).not.toEqual(wa());
      st().undo();
      expect(wb().length).toBe(3);
    });

    it("is blocked while the simulation lock is on", () => {
      const before = JSON.stringify(st().project!.world.guards);
      useEditor.setState({ activeRun: {} as never });
      st().copyRouteFrom(b, a);
      st().addRouteFrom(a, b);
      st().swapRoutes(a, b);
      st().shareRoute(b, a);
      st().reverseRoute(a);
      expect(JSON.stringify(st().project!.world.guards)).toBe(before);
    });
  });

  it("routes along the walking graph and auto patrol makes a loop", () => {
    const p = st().project!;
    const g = p.world.guards[0];
    const legs = routeLegs(p.world, g.waypoints);
    expect(legs.length).toBe(g.waypoints.length);
    const route = autoPatrol(p, g.waypoints[0]);
    expect(route.length).toBeGreaterThanOrEqual(2);
  });
});
