"use client";

/**
 * Site layers for geo/satellite imports: satellite ground texture, compound
 * walls, gates, guard booths, parking lots and likely dark zones. Everything
 * here is optional world data (world.site / source.geo) and renders nothing
 * for demo or blank projects.
 */

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { useEditor } from "@/lib/store/editor";
import type { SiteArea, SiteGate, SiteWall } from "@/lib/world/types";

const GATE_COLORS: Record<SiteGate["kind"], string> = { main: "#e8a33d", service: "#7aa6d8", pedestrian: "#8fd19e" };

function SatelliteGround({ url, width, depth, night }: { url: string; width: number; depth: number; night: boolean }) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    let t: THREE.Texture | null = null;
    new THREE.TextureLoader().load(url, (loaded) => {
      if (!alive) return loaded.dispose();
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.anisotropy = 4;
      t = loaded;
      setTex(loaded);
    });
    return () => {
      alive = false;
      t?.dispose();
    };
  }, [url]);
  if (!tex) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} raycast={() => null}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial map={tex} color={night ? "#6f7a8c" : "#ffffff"} toneMapped={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

function Wall({ wall }: { wall: SiteWall }) {
  const segs = useMemo(() => {
    const pts = wall.closed ? [...wall.points, wall.points[0]] : wall.points;
    const out: { x: number; z: number; len: number; ang: number }[] = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.5) continue;
      out.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, len, ang: -Math.atan2(b.z - a.z, b.x - a.x) });
    }
    return out;
  }, [wall]);
  return (
    <group raycast={() => null}>
      {segs.map((s, i) => (
        <mesh key={i} position={[s.x, wall.height / 2, s.z]} rotation={[0, s.ang, 0]} raycast={() => null}>
          <boxGeometry args={[s.len + 0.3, wall.height, 0.35]} />
          <meshStandardMaterial color="#b9ab92" roughness={0.9} transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Gate({ gate }: { gate: SiteGate }) {
  const c = GATE_COLORS[gate.kind];
  return (
    <group position={[gate.x, 0, gate.z]} raycast={() => null}>
      {[-3, 3].map((dx) => (
        <mesh key={dx} position={[dx, 1.6, 0]} raycast={() => null}>
          <boxGeometry args={[0.7, 3.2, 0.7]} />
          <meshStandardMaterial color="#d8d0c0" />
        </mesh>
      ))}
      <mesh position={[0, 3.4, 0]} raycast={() => null}>
        <boxGeometry args={[6.8, 0.35, 0.35]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 7, 0]} raycast={() => null}>
        <octahedronGeometry args={[1.1]} />
        <meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]} raycast={() => null}>
        <ringGeometry args={[4.2, 5, 32]} />
        <meshBasicMaterial color={c} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function Area({ area }: { area: SiteArea }) {
  if (area.kind === "open") return null;
  const dark = area.kind === "dark";
  return (
    <mesh position={[area.x, dark ? 0.07 : 0.05, area.z]} rotation={[-Math.PI / 2, 0, area.rotation]} raycast={() => null}>
      <planeGeometry args={[area.width, area.depth]} />
      <meshBasicMaterial color={dark ? "#3b1f5c" : "#8b93a1"} transparent opacity={dark ? 0.45 : 0.35} depthWrite={false} />
    </mesh>
  );
}

/**
 * Orthographic zoom that fits the current world bounds in the viewport.
 * Geo imports only (demo/blank keep the default 2.2) — clamped to [0.6, 2.2].
 */
/** Default ortho zoom for non-geo (demo/blank) worlds — framed close so people are legible. */
export const DEFAULT_ZOOM = 4.5;

export function fitZoom(cam: THREE.Camera): number {
  const p = useEditor.getState().project;
  const o = cam as THREE.OrthographicCamera;
  if (!p?.source.geo || !o.isOrthographicCamera) return DEFAULT_ZOOM;
  const { width, depth } = p.world.bounds;
  const span = (width + depth) * 0.72; // footprint diagonal as seen from the iso/top views
  const z = Math.min((o.right - o.left) / span, (o.top - o.bottom) / (span * 0.62)) * 0.92;
  return Math.max(0.6, Math.min(2.2, z));
}

function FitGeoCamera() {
  const projectId = useEditor((s) => s.project?.projectId);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    if (!useEditor.getState().project?.source.geo) return;
    const o = camera as THREE.OrthographicCamera;
    o.zoom = fitZoom(o);
    o.updateProjectionMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, camera, size.width > 0]);
  return null;
}

export function SiteLayers() {
  const site = useEditor((s) => s.project?.world.site);
  const geo = useEditor((s) => s.project?.source.geo);
  const bounds = useEditor((s) => s.project?.world.bounds);
  const layers = useEditor((s) => s.layers);
  const night = (useEditor((s) => s.sceneTheme) ?? "night") === "night";
  if (!bounds) return null;
  return (
    <group>
      <FitGeoCamera />
      {geo?.satelliteImage && layers.satellite !== false && (
        <SatelliteGround url={geo.satelliteImage} width={bounds.width} depth={bounds.depth} night={night} />
      )}
      {site && layers.site !== false && (
        <>
          {site.walls.map((w) => (
            <Wall key={w.id} wall={w} />
          ))}
          {site.gates.map((g) => (
            <Gate key={g.id} gate={g} />
          ))}
          {site.areas.map((a) => (
            <Area key={a.id} area={a} />
          ))}
          {site.booths.map((b) => (
            <group key={b.id} position={[b.x, 0, b.z]} raycast={() => null}>
              <mesh position={[0, 1.3, 0]} raycast={() => null}>
                <boxGeometry args={[2.2, 2.6, 2.2]} />
                <meshStandardMaterial color="#e9e2d2" />
              </mesh>
              <mesh position={[0, 2.75, 0]} raycast={() => null}>
                <boxGeometry args={[2.8, 0.3, 2.8]} />
                <meshStandardMaterial color="#e8a33d" emissive="#e8a33d" emissiveIntensity={0.4} />
              </mesh>
            </group>
          ))}
        </>
      )}
    </group>
  );
}

