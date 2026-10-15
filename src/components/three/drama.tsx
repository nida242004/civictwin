"use client";

/**
 * Incident-drama visuals: beat driver, speech bubbles, beat FX (attack
 * shockwave, CCTV detect flash, blind-spot pulse…) and the "follow incident"
 * cinematic camera. Beats come from `result.beats` (may be absent).
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useEditor, playbackClock } from "@/lib/store/editor";
import { BEAT_WINDOW_SEC, beatsOf, useDrama, type ActiveBeat } from "@/lib/store/drama";
import type { ActorRef, IncidentBeat } from "@/lib/sim/incidents";
import type { Frame } from "@/lib/sim/engine";
import type { DramaFrame } from "@/lib/sim/incidents";
import { BeatBubbles, BubbleBody, DecisionBubbles } from "./bubbles";
import { Html } from "@react-three/drei";
import { CHAR_SCALE } from "./characters";
import { useIsMainScene, useSceneCameras, useSceneClock, useSceneDrama, useSceneRun } from "./sceneSource";

type F = Frame & Partial<DramaFrame>;

const SEV_COLOR = ["#38bdf8", "#fb923c", "#ef4444"] as const;
const FX_SEC = 3;

function deg2rad(d: number) {
  return (d * Math.PI) / 180;
}

/** Interpolated x/z of a beat actor at time t (falls back to the beat location). */
function actorXZ(frames: Frame[], ref: ActorRef, t: number, fallback: { x: number; z: number }): [number, number] {
  const last = frames.length - 1;
  if (last < 0) return [fallback.x, fallback.z];
  const i0 = Math.max(0, Math.min(Math.floor(t), last));
  const i1 = Math.min(i0 + 1, last);
  const fr = Math.min(1, Math.max(0, t - i0));
  const f0 = frames[i0] as F;
  const f1 = frames[i1] as F;
  let a: Float32Array | undefined;
  let b: Float32Array | undefined;
  if (ref.kind === "perp") { a = f0.perpPos; b = f1.perpPos; }
  else if (ref.kind === "agent") { a = f0.agentPos; b = f1.agentPos; }
  else if (ref.kind === "guard") { a = f0.guardPos; b = f1.guardPos; }
  if (!a || !b || ref.idx < 0 || a.length < ref.idx * 2 + 2 || b.length < ref.idx * 2 + 2) return [fallback.x, fallback.z];
  const k = ref.idx * 2;
  return [a[k] + (b[k] - a[k]) * fr, a[k + 1] + (b[k + 1] - a[k + 1]) * fr];
}

/* ------------------------------------------------------------------ */
/* Driver: mirrors playback clock -> active beats                      */
/* ------------------------------------------------------------------ */

function DramaDriver() {
  const activeRun = useSceneRun();
  const clock = useSceneClock();
  const store = useSceneDrama();
  const main = useIsMainScene();
  const beats = useMemo<ActiveBeat[]>(
    () => beatsOf(activeRun?.result as { beats?: IncidentBeat[] } | undefined).map((b, key) => ({ ...b, key })),
    [activeRun]
  );
  const prevKeys = useRef<number[]>([]);
  useEffect(() => {
    if (main) (window as unknown as { __praesidiumBeats?: unknown }).__praesidiumBeats = beats; // debug / screenshot hook
  }, [beats, main]);

  useEffect(() => {
    prevKeys.current = [];
    store.getState().setActiveBeats([], null);
  }, [beats, store]);

  useFrame(() => {
    if (!beats.length) return;
    const t = clock.t;
    const cur: ActiveBeat[] = [];
    let latest: ActiveBeat | null = null;
    for (const b of beats) {
      if (b.tSec <= t) {
        if (!latest || b.tSec >= latest.tSec) latest = b;
        if (t - b.tSec < BEAT_WINDOW_SEC) cur.push(b);
      }
    }
    const prev = prevKeys.current;
    let same = prev.length === cur.length;
    if (same) for (let i = 0; i < cur.length; i++) if (prev[i] !== cur[i].key) { same = false; break; }
    if (!same) {
      prevKeys.current = cur.map((b) => b.key);
      store.getState().setActiveBeats(cur, latest);
    }
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Beat FX                                                             */
/* ------------------------------------------------------------------ */

function Shockwave({ beat, color, maxR, beam }: { beat: ActiveBeat; color: string; maxR: number; beam?: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const clock = useSceneClock();
  useFrame(() => {
    const age = clock.t - beat.tSec;
    const k = Math.max(0, Math.min(1, age / FX_SEC));
    const fade = 1 - k;
    if (ring.current) {
      ring.current.scale.setScalar(1 + k * maxR);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = fade * 0.95;
    }
    if (ring2.current) {
      const k2 = Math.max(0, Math.min(1, (age - 0.35) / FX_SEC));
      ring2.current.scale.setScalar(1 + k2 * maxR * 0.7);
      (ring2.current.material as THREE.MeshBasicMaterial).opacity = (1 - k2) * 0.6;
    }
    if (beamRef.current) {
      (beamRef.current.material as THREE.MeshBasicMaterial).opacity = fade * 0.35 * (0.7 + 0.3 * Math.sin(age * 14));
    }
  });
  const mat = { color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false } as const;
  return (
    <group position={[beat.x, 0.15, beat.z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1, 48]} />
        <meshBasicMaterial {...mat} />
      </mesh>
      <mesh ref={ring2} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1, 48]} />
        <meshBasicMaterial {...mat} />
      </mesh>
      {beam && (
        <mesh ref={beamRef} position={[0, 20, 0]}>
          <cylinderGeometry args={[1.2, 2.6, 40, 16, 1, true]} />
          <meshBasicMaterial {...mat} />
        </mesh>
      )}
    </group>
  );
}

function BlindSpotPulse({ beat }: { beat: ActiveBeat }) {
  const disc = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const clock = useSceneClock();
  useFrame(() => {
    const age = clock.t - beat.tSec;
    const fade = Math.max(0, Math.min(1, age / 0.4, (BEAT_WINDOW_SEC - age) / 1.2));
    const p = 0.5 + 0.5 * Math.sin(age * 4.5);
    if (disc.current) (disc.current.material as THREE.MeshBasicMaterial).opacity = fade * (0.12 + 0.12 * p);
    if (ring.current) {
      ring.current.scale.setScalar(0.85 + 0.25 * p);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = fade * 0.55;
    }
  });
  const mat = { color: "#a855f7", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false } as const;
  return (
    <group position={[beat.x, 0.14, beat.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={disc}>
        <circleGeometry args={[11, 40]} />
        <meshBasicMaterial {...mat} />
      </mesh>
      <mesh ref={ring} scale={[11, 11, 1]}>
        <ringGeometry args={[0.93, 1, 48]} />
        <meshBasicMaterial {...mat} />
      </mesh>
    </group>
  );
}

function CctvFlash({ beat }: { beat: ActiveBeat }) {
  const cams = useSceneCameras();
  const clock = useSceneClock();
  const mesh = useRef<THREE.Mesh>(null);
  const cam =
    (beat.actor.id ? cams.find((c) => c.id === beat.actor.id) : undefined) ??
    cams[beat.actor.idx] ??
    cams.reduce<(typeof cams)[number] | undefined>(
      (best, c) => (!best || (c.x - beat.x) ** 2 + (c.z - beat.z) ** 2 < (best.x - beat.x) ** 2 + (best.z - beat.z) ** 2 ? c : best),
      undefined
    );
  useFrame(() => {
    const age = clock.t - beat.tSec;
    const k = Math.max(0, Math.min(1, age / 2.6));
    const flick = 0.55 + 0.45 * Math.sin(age * 22) * (1 - k);
    if (mesh.current) (mesh.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.55 * flick + (1 - k) * 0.1;
  });
  if (!cam) return null;
  return (
    <group position={[cam.x, 0.2, cam.z]}>
      <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[cam.range, 32, -(deg2rad(cam.orientationDeg) + deg2rad(cam.fovDeg) / 2), deg2rad(cam.fovDeg)]} />
        <meshBasicMaterial color="#ef4444" transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh position={[0, cam.height, 0]}>
        <sphereGeometry args={[0.8, 10, 8]} />
        <meshBasicMaterial color="#ff3b3b" toneMapped={false} />
      </mesh>
    </group>
  );
}

function BeatFx() {
  const store = useSceneDrama();
  const active = store((s) => s.activeBeats);
  return (
    <>
      {active.map((b) => {
        switch (b.kind) {
          case "attack_start":
            return <Shockwave key={b.key} beat={b} color="#ff2d3d" maxR={14} beam />;
          case "victim_scream":
            return <Shockwave key={b.key} beat={b} color="#fb923c" maxR={7} />;
          case "cctv_detect":
            return <CctvFlash key={b.key} beat={b} />;
          case "cctv_missed":
            return <BlindSpotPulse key={b.key} beat={b} />;
          case "perp_caught":
            return <Shockwave key={b.key} beat={b} color="#34d399" maxR={10} />;
          case "guard_arrived":
            return <Shockwave key={b.key} beat={b} color="#60a5fa" maxR={8} />;
          case "perp_spawn":
            return <Shockwave key={b.key} beat={b} color="#a855f7" maxR={5} />;
          default:
            return null;
        }
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Police arrival (visual only): jeep + officers after caught/escaped  */
/* ------------------------------------------------------------------ */

const POLICE_DELAY = 4;
const POLICE_STAY = 30;

function Officer({ x, z, yaw }: { x: number; z: number; yaw: number }) {
  const s = CHAR_SCALE;
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]} scale={s}>
      <mesh position={[-0.1, 0.45, 0]}><capsuleGeometry args={[0.085, 0.7, 3, 6]} /><meshStandardMaterial color="#6b5a3a" /></mesh>
      <mesh position={[0.1, 0.45, 0]}><capsuleGeometry args={[0.085, 0.7, 3, 6]} /><meshStandardMaterial color="#6b5a3a" /></mesh>
      <mesh position={[0, 1.2, 0]} scale={[1, 1, 0.62]}><capsuleGeometry args={[0.2, 0.32, 4, 8]} /><meshStandardMaterial color="#b59a62" /></mesh>
      <mesh position={[-0.27, 1.15, 0]}><capsuleGeometry args={[0.06, 0.46, 3, 6]} /><meshStandardMaterial color="#b59a62" /></mesh>
      <mesh position={[0.27, 1.15, 0]}><capsuleGeometry args={[0.06, 0.46, 3, 6]} /><meshStandardMaterial color="#b59a62" /></mesh>
      <mesh position={[0, 1.7, 0]}><sphereGeometry args={[0.14, 10, 8]} /></mesh>
      {/* beret + badge */}
      <mesh position={[0, 1.8, -0.01]} scale={[1.1, 0.55, 1.1]}><sphereGeometry args={[0.15, 10, 6]} /><meshStandardMaterial color="#3b2f1e" /></mesh>
      <mesh position={[0, 1.2, 0.13]}><boxGeometry args={[0.08, 0.1, 0.02]} /><meshBasicMaterial color="#facc15" /></mesh>
    </group>
  );
}

function PoliceArrival({ beat }: { beat: ActiveBeat }) {
  const root = useRef<THREE.Group>(null);
  const light1 = useRef<THREE.MeshBasicMaterial>(null);
  const light2 = useRef<THREE.MeshBasicMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const t0 = beat.tSec + POLICE_DELAY;
  const yaw = Math.atan2(-1, -1);
  const fx = beat.x + 6, fz = beat.z + 5;
  const sceneClock = useSceneClock();

  useFrame(({ clock }) => {
    const t = sceneClock.t;
    const g = root.current;
    if (!g) return;
    const vis = t >= t0 && t < t0 + POLICE_STAY;
    g.visible = vis;
    if (!vis) return;
    const k = Math.min(1, (t - t0) / 5);
    const e = 1 - Math.pow(1 - k, 3);
    const sx = fx + 90, sz = fz + 90;
    g.position.set(sx + (fx - sx) * e, 0, sz + (fz - sz) * e);
    const blink = Math.sin(clock.elapsedTime * 14) > 0;
    light1.current?.color.set(blink ? "#ff2a2a" : "#220000");
    light2.current?.color.set(blink ? "#001133" : "#2f6bff");
    if (halo.current) {
      halo.current.scale.setScalar(1 + 0.25 * Math.sin(clock.elapsedTime * 7));
      (halo.current.material as THREE.MeshBasicMaterial).color.set(blink ? "#ff2a2a" : "#2f6bff");
    }
    if (bubble.current) {
      const a = t - (t0 + 4.5);
      bubble.current.style.opacity = String(a < 0 || a > 5 ? 0 : Math.min(1, a / 0.2, (5 - a) / 0.6));
      bubble.current.style.transform = `translate(-50%, -100%) scale(${(0.7 + 0.3 * Math.min(1, a / 0.2)).toFixed(2)})`;
    }
  });

  const S = 2.2;
  return (
    <group ref={root} visible={false}>
      <group rotation={[0, yaw, 0]} scale={S}>
        <mesh position={[0, 0.75, 0]}><boxGeometry args={[1.7, 0.7, 4]} /><meshStandardMaterial color="#e8edf2" roughness={0.5} /></mesh>
        <mesh position={[0, 1.35, -0.2]}><boxGeometry args={[1.6, 0.55, 2.3]} /><meshStandardMaterial color="#cdd6df" roughness={0.4} /></mesh>
        <mesh position={[0, 1.38, 0.95]}><boxGeometry args={[1.5, 0.4, 0.05]} /><meshStandardMaterial color="#1b2a44" /></mesh>
        <mesh position={[0, 0.78, 0]}><boxGeometry args={[1.74, 0.16, 3.2]} /><meshStandardMaterial color="#1d4ed8" /></mesh>
        {[[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]].map(([wx, wz], i) => (
          <mesh key={i} position={[wx, 0.32, wz]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.34, 0.34, 0.22, 12]} /><meshStandardMaterial color="#111" /></mesh>
        ))}
        <mesh position={[-0.35, 1.72, -0.2]}><boxGeometry args={[0.6, 0.16, 0.3]} /><meshBasicMaterial ref={light1} color="#ff2a2a" toneMapped={false} /></mesh>
        <mesh position={[0.35, 1.72, -0.2]}><boxGeometry args={[0.6, 0.16, 0.3]} /><meshBasicMaterial ref={light2} color="#2f6bff" toneMapped={false} /></mesh>
      </group>
      <mesh ref={halo} position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[7, 8.2, 40]} />
        <meshBasicMaterial transparent opacity={0.55} depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <Officer x={-4.5} z={-1} yaw={Math.PI * 0.9} />
      <Officer x={-6.5} z={2.5} yaw={Math.PI * 0.75} />
      <group position={[-5, CHAR_SCALE * 2.3, 0.5]}>
        <Html zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div ref={bubble} style={{ position: "absolute", left: 0, top: 0, opacity: 0, transformOrigin: "50% 100%", pointerEvents: "none" }}>
            <BubbleBody variant="burst" text="Police! Nobody move!" accent="#2563eb" sev={2} />
          </div>
        </Html>
      </group>
    </group>
  );
}

function PoliceLayer() {
  const activeRun = useSceneRun();
  const arrivals = useMemo(
    () => beatsOf(activeRun?.result as { beats?: IncidentBeat[] } | undefined).map((b, key) => ({ ...b, key })).filter((b) => b.kind === "perp_caught" || b.kind === "perp_escaped").slice(0, 4),
    [activeRun]
  );
  return (
    <>
      {arrivals.map((b) => (
        <PoliceArrival key={b.key} beat={b} />
      ))}
    </>
  );
}
/* ------------------------------------------------------------------ */
/* Follow-incident camera                                              */
/* ------------------------------------------------------------------ */

function FollowCam() {
  const controls = useThree((s) => s.controls) as unknown as
    | (THREE.EventDispatcher & { target: THREE.Vector3; update: () => void })
    | null;
  const camera = useThree((s) => s.camera);
  const fly = useRef<{ x: number; z: number; zoom: number } | null>(null);
  const handled = useRef(-1);

  useEffect(() => {
    if (!controls) return;
    const stop = () => {
      fly.current = null; // user took manual control
    };
    (controls as any).addEventListener("start", stop);
    return () => (controls as any).removeEventListener("start", stop);
  }, [controls]);

  useFrame((_, delta) => {
    const st = useDrama.getState();
    if (st.followIncident && controls) {
      const playing = useEditor.getState().playing;
      if (playing) {
        for (const b of st.activeBeats) {
          if (b.kind === "attack_start" && b.key !== handled.current) {
            handled.current = b.key;
            fly.current = { x: b.x, z: b.z, zoom: Math.max(camera.zoom, 8) };
          }
        }
      }
    } else {
      fly.current = null;
    }
    const f = fly.current;
    if (!f || !controls) return;
    const k = 1 - Math.exp(-delta * 2.4);
    const dx = (f.x - controls.target.x) * k;
    const dz = (f.z - controls.target.z) * k;
    controls.target.x += dx;
    controls.target.z += dz;
    camera.position.x += dx;
    camera.position.z += dz;
    // lift the view toward top-down so buildings do not hide the incident
    const off = camera.position.clone().sub(controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.phi += (0.62 - sph.phi) * k;
    off.setFromSpherical(sph);
    camera.position.copy(controls.target).add(off);
    const dz2 = (f.zoom - camera.zoom) * k;
    camera.zoom += dz2;
    camera.updateProjectionMatrix();
    if (Math.abs(f.x - controls.target.x) + Math.abs(f.z - controls.target.z) < 0.4 && Math.abs(f.zoom - camera.zoom) < 0.05 && Math.abs(sph.phi - 0.62) < 0.02) {
      fly.current = null;
    }
  });
  return null;
}

/* ------------------------------------------------------------------ */

export function DramaLayer() {
  const activeRun = useSceneRun();
  const main = useIsMainScene();
  if (!activeRun) return null;
  return (
    <group>
      <DramaDriver />
      <BeatFx />
      <BeatBubbles />
      <DecisionBubbles />
      <PoliceLayer />
      {main && <FollowCam />}
    </group>
  );
}