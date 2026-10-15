"use client";

/**
 * Guard patrol-route editor: renders every guard's route along the real A*
 * walking path, numbered draggable waypoint handles for the selected guard,
 * segment click-to-insert, and the live drawing preview. Also exports the
 * on-canvas HUD (hint + Finish route) shown while the Guard tool is active.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { useEditor, isLocked } from "@/lib/store/editor";
import type { Guard, Vec2 } from "@/lib/world/types";
import { graphFor, legBetween, polylineLength, routeLegs, snapToWalkable } from "@/lib/world/patrol";

export const ROUTE_COLORS = ["#facc15", "#38bdf8", "#f472b6", "#4ade80", "#fb923c", "#a78bfa", "#2dd4bf", "#f87171"];
export const routeColor = (i: number) => ROUTE_COLORS[i % ROUTE_COLORS.length];

const Y = 0.45;
const v3 = (p: Vec2, y = Y) => [p.x, y, p.z] as [number, number, number];

/** Points along legs with heading, for arrowheads. */
function arrowsFor(legs: Vec2[][], spacing = 24) {
  const out: { x: number; z: number; rot: number }[] = [];
  for (const leg of legs) {
    const total = polylineLength(leg);
    if (total < 4) continue;
    const n = Math.max(1, Math.round(total / spacing));
    for (let k = 0; k < n; k++) {
      let want = ((k + 0.5) / n) * total;
      for (let i = 0; i + 1 < leg.length; i++) {
        const sl = Math.hypot(leg[i + 1].x - leg[i].x, leg[i + 1].z - leg[i].z);
        if (want <= sl || i + 2 === leg.length) {
          const t = sl < 1e-6 ? 0 : Math.min(1, want / sl);
          const dx = leg[i + 1].x - leg[i].x;
          const dz = leg[i + 1].z - leg[i].z;
          out.push({ x: leg[i].x + dx * t, z: leg[i].z + dz * t, rot: -Math.atan2(dz, dx) });
          break;
        }
        want -= sl;
      }
    }
  }
  return out;
}

const arrowGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(1.6, 0);
  s.lineTo(-1.1, 1.2);
  s.lineTo(-0.5, 0);
  s.lineTo(-1.1, -1.2);
  s.closePath();
  return new THREE.ShapeGeometry(s);
})();

function Arrows({ legs, color, opacity }: { legs: Vec2[][]; color: string; opacity: number }) {
  const arrows = useMemo(() => arrowsFor(legs), [legs]);
  return (
    <group raycast={() => null}>
      {arrows.map((a, i) => (
        <group key={i} position={[a.x, Y + 0.05, a.z]} rotation={[0, a.rot, 0]}>
          <mesh geometry={arrowGeo} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Route({ legs, color, bright }: { legs: Vec2[][]; color: string; bright: boolean }) {
  const main = useMemo(() => {
    const pts: [number, number, number][] = [];
    legs.slice(0, Math.max(0, legs.length - 1)).forEach((l) => l.forEach((p) => pts.push(v3(p))));
    return pts;
  }, [legs]);
  const closing = useMemo(() => (legs.length ? legs[legs.length - 1].map((p) => v3(p)) : []), [legs]);
  // a 2-point loop is out-and-back: show it as one full-strength line
  const single = legs.length === 1;
  return (
    <group raycast={() => null}>
      {main.length > 1 && (
        <Line points={main} color={color} lineWidth={bright ? 4.5 : 2.2} dashed dashSize={2.4} gapSize={1.2} transparent opacity={bright ? 1 : 0.4} raycast={() => null} />
      )}
      {closing.length > 1 && (
        <Line
          points={closing}
          color={color}
          lineWidth={bright ? 3 : 1.6}
          dashed
          dashSize={single ? 2.4 : 1.2}
          gapSize={single ? 1.2 : 2}
          transparent
          opacity={single ? (bright ? 1 : 0.4) : bright ? 0.45 : 0.18}
          raycast={() => null}
        />
      )}
      <Arrows legs={legs} color={color} opacity={bright ? 0.95 : 0.4} />
    </group>
  );
}

/** Ground (y=0) point under the pointer. */
function useGroundPoint() {
  const { camera, gl } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const hit = useMemo(() => new THREE.Vector3(), []);
  return useMemo(
    () => (clientX: number, clientY: number): Vec2 | null => {
      const r = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
    },
    [camera, gl, ray, plane, hit]
  );
}

export function PatrolRoutes() {
  const project = useEditor((s) => s.project);
  const selection = useEditor((s) => s.selection);
  const mode = useEditor((s) => s.mode);
  const locked = useEditor((s) => isLocked(s));
  const routeDraw = useEditor((s) => s.routeDraw);
  const waypointSel = useEditor((s) => s.waypointSel);
  const showAll = useEditor((s) => s.layers.labels);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const groundPoint = useGroundPoint();

  const world = project?.world;
  const guards = world?.guards ?? [];
  const selId = selection?.kind === "guard" ? selection.id : null;
  const drawingId = routeDraw?.guardId ?? null;

  const [drag, setDrag] = useState<{ guardId: string; index: number; pos: Vec2 } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  const [cursor, setCursor] = useState<Vec2 | null>(null);

  // base legs per guard (recomputed only when the world changes)
  const legsAll = useMemo(() => {
    const m = new Map<string, Vec2[][]>();
    if (world) for (const g of world.guards) m.set(g.id, routeLegs(world, g.waypoints));
    return m;
  }, [world]);

  const selGuard = guards.find((g) => g.id === selId) ?? null;
  const selWps = useMemo(() => {
    if (!selGuard) return [];
    return selGuard.waypoints.map((w, i) => (drag && drag.guardId === selGuard.id && drag.index === i ? drag.pos : w));
  }, [selGuard, drag]);
  const selLegs = useMemo(() => {
    if (!selGuard || !world) return [];
    if (!drag) return legsAll.get(selGuard.id) ?? [];
    return routeLegs(world, selWps);
  }, [selGuard, world, drag, legsAll, selWps]);

  const canEdit = mode === "edit" && !locked;
  const drawing = canEdit && !!drawingId;

  // handle dragging: window-level move/up so the drag survives leaving the handle
  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const p = groundPoint(e.clientX, e.clientY);
      const cur = dragRef.current;
      if (!p || !cur || !world) return;
      const snapped = snapToWalkable(world, p);
      dragRef.current = { ...cur, pos: snapped };
      setDrag(dragRef.current);
    };
    const up = () => {
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (controls) controls.enabled = true;
      if (cur) {
        const g = useEditor.getState().project?.world.guards.find((x) => x.id === cur.guardId);
        const orig = g?.waypoints[cur.index];
        if (orig && Math.hypot(orig.x - cur.pos.x, orig.z - cur.pos.z) > 0.3) {
          useEditor.getState().moveWaypoint(cur.guardId, cur.index, cur.pos);
        }
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [!!drag, world, controls, groundPoint]); // eslint-disable-line react-hooks/exhaustive-deps

  // live cursor while drawing
  const lastClient = useRef<{ x: number; y: number } | null>(null);
  const lastKey = useRef("");
  useFrame(() => {
    if (!drawing || !world) {
      if (lastKey.current) {
        lastKey.current = "";
        setCursor(null);
      }
      return;
    }
    const cli = lastClient.current;
    if (!cli) return;
    const p = groundPoint(cli.x, cli.y);
    if (!p) return;
    const sp = snapToWalkable(world, { x: Math.round(p.x), z: Math.round(p.z) });
    const key = `${sp.x},${sp.z}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      setCursor(sp);
    }
  });
  useEffect(() => {
    const mv = (e: PointerEvent) => (lastClient.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", mv);
    return () => window.removeEventListener("pointermove", mv);
  }, []);

  const previewLeg = useMemo(() => {
    if (!drawing || !cursor || !world || !selGuard || !selGuard.waypoints.length) return null;
    const last = selGuard.waypoints[selGuard.waypoints.length - 1];
    if (Math.hypot(cursor.x - last.x, cursor.z - last.z) < 0.5) return null;
    return legBetween(graphFor(world), last, cursor);
  }, [drawing, cursor, world, selGuard]);

  if (!project || !world) return null;

  const idxOf = (g: Guard) => guards.indexOf(g);

  return (
    <group>
      {guards.map((g) => {
        if (g.id === selId) return null;
        if (!showAll) return null;
        const legs = legsAll.get(g.id) ?? [];
        return <Route key={g.id} legs={legs} color={routeColor(idxOf(g))} bright={false} />;
      })}

      {selGuard && (
        <>
          <Route legs={selLegs} color={routeColor(idxOf(selGuard))} bright />

          {/* click a segment to insert a waypoint there */}
          {canEdit && !drawing && !drag &&
            selLegs.map((leg, li) =>
              leg.slice(0, -1).map((a, si) => {
                const b = leg[si + 1];
                const len = Math.hypot(b.x - a.x, b.z - a.z);
                if (len < 0.5) return null;
                return (
                  <mesh
                    key={`${li}-${si}`}
                    position={[(a.x + b.x) / 2, Y - 0.1, (a.z + b.z) / 2]}
                    rotation={[-Math.PI / 2, 0, -Math.atan2(b.z - a.z, b.x - a.x)]}
                    onClick={(e) => {
                      if (e.nativeEvent.button !== 0 || e.delta > 4) return;
                      e.stopPropagation();
                      useEditor.getState().insertWaypoint(selGuard.id, li + 1, snapToWalkable(world, { x: e.point.x, z: e.point.z }));
                    }}
                  >
                    <planeGeometry args={[len, 3.6]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>
                );
              })
            )}

          {/* numbered handles */}
          {!locked &&
            selWps.map((w, i) => {
              const sel = waypointSel === i;
              const col = routeColor(idxOf(selGuard));
              return (
                <group key={i} position={[w.x, Y + 0.2, w.z]}>
                  <mesh
                    rotation={[-Math.PI / 2, 0, 0]}
                    raycast={drawing ? () => null : undefined}
                    onPointerDown={(e) => {
                      if (!canEdit || e.nativeEvent.button !== 0) return;
                      e.stopPropagation();
                      useEditor.getState().setWaypointSel(i);
                      if (controls) controls.enabled = false;
                      dragRef.current = { guardId: selGuard.id, index: i, pos: { x: w.x, z: w.z } };
                      setDrag(dragRef.current);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => {
                      e.nativeEvent.preventDefault();
                      e.stopPropagation();
                      if (canEdit) useEditor.getState().removeWaypoint(selGuard.id, i);
                    }}
                  >
                    <circleGeometry args={[sel ? 4 : 3.4, 24]} />
                    <meshBasicMaterial color={sel ? "#ffffff" : col} depthWrite={false} />
                  </mesh>
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} raycast={() => null}>
                    <ringGeometry args={[sel ? 4 : 3.4, sel ? 4.6 : 4, 24]} />
                    <meshBasicMaterial color="#0b121e" depthWrite={false} />
                  </mesh>
                  <Html center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
                    <div
                      style={{
                        font: "700 11px system-ui, sans-serif",
                        color: sel ? "#0b121e" : "#0b121e",
                        textShadow: "0 0 2px rgba(255,255,255,.5)",
                        userSelect: "none",
                      }}
                    >
                      {i + 1}
                    </div>
                  </Html>
                </group>
              );
            })}

          {/* live drawing preview along the real walking path */}
          {previewLeg && (
            <group raycast={() => null}>
              <Line points={previewLeg.map((p) => v3(p, Y + 0.1))} color="#ffffff" lineWidth={2.4} dashed dashSize={1.6} gapSize={1.2} transparent opacity={0.9} raycast={() => null} />
              {cursor && (
                <mesh position={[cursor.x, Y + 0.15, cursor.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                  <ringGeometry args={[2, 2.6, 24]} />
                  <meshBasicMaterial color="#ffffff" depthWrite={false} />
                </mesh>
              )}
            </group>
          )}
        </>
      )}
    </group>
  );
}

/** On-canvas HUD: route drawing hint + Finish route; passive hint when the Guard tool is armed. */
export function PatrolHUD() {
  const tool = useEditor((s) => s.tool);
  const routeDraw = useEditor((s) => s.routeDraw);
  const locked = useEditor((s) => isLocked(s));
  const count = useEditor((s) => {
    const id = s.routeDraw?.guardId;
    return id ? (s.project?.world.guards.find((g) => g.id === id)?.waypoints.length ?? 0) : 0;
  });
  const finish = useEditor((s) => s.finishRouteDraw);
  const removeLast = useEditor((s) => s.removeLastWaypoint);
  const hint = useEditor((s) => s.canvasHint);
  if (locked || (tool !== "guard" && !routeDraw)) return null;
  return (
    <>
    {hint && (
      <div className="pointer-events-none absolute left-1/2 top-14 z-30 -translate-x-1/2 rounded-md border border-[#facc15]/60 bg-[#0f172a]/95 px-3 py-1 text-xs font-medium text-[#facc15] shadow-xl">
        {hint}
      </div>
    )}
    <div className="pointer-events-auto absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full border border-[#facc15]/60 bg-[#0f172a]/95 px-4 py-1.5 text-xs text-white shadow-2xl backdrop-blur-md">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#facc15] opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#facc15]" />
      </span>
      <span className="font-semibold text-[#facc15]">Guard patrol</span>
      <span className="text-[#cbd5e1]">
        {routeDraw
          ? `${count} stop${count === 1 ? "" : "s"} · Left-click adds stops · Right-click drops a new guard`
          : "Right-click to drop a guard · left-click adds stops"}
      </span>
      {routeDraw && (
        <>
          <button
            onClick={removeLast}
            disabled={count <= 1}
            className="rounded-md bg-[#334155]/80 px-2 py-1 text-xs text-[#cbd5e1] hover:bg-[#475569] disabled:opacity-40"
          >
            Undo stop <kbd className="rounded bg-black/20 px-1 text-[10px]">⌫</kbd>
          </button>
          <button
            onClick={finish}
            className="flex items-center gap-1 rounded-md bg-[#2e7d5b] px-2.5 py-1 text-xs font-semibold text-white shadow hover:bg-[#276c4f]"
          >
            Finish route <kbd className="rounded bg-black/20 px-1 text-[10px]">Enter</kbd>
          </button>
          <span className="text-[10px] text-[#94a3b8]">
            <kbd className="rounded bg-black/20 px-1">Esc</kbd> deselect · <kbd className="rounded bg-black/20 px-1">⌫</kbd> last stop
          </span>
        </>
      )}
    </div>
    </>
  );
}
