"use client";

/**
 * "Same night, one change" — synchronized split-screen replay.
 * Left: baseline. Right: intervention. Same seed, one shared clock/scrubber,
 * cameras kept in sync. Each side is a light-weight canvas that reuses the
 * main playback layers through a SceneSource provider.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { StoredRun } from "@/lib/world/types";
import { replayStoredRun, clockLabel, type ActiveRun } from "@/lib/sim/runner";
import { createDramaStore, type DramaStore } from "@/lib/store/drama";
import { RoadsLayer, FacilitiesLayer, StreetlightsLayer, CamerasLayer } from "@/components/three/layers";
import { BuildingsLayer } from "@/components/three/buildings";
import { CharactersLayer } from "@/components/three/characters";
import { DramaLayer } from "@/components/three/drama";
import { EventsLayer } from "@/components/three/playback";
import { SceneSourceProvider, type SceneSource } from "@/components/three/sceneSource";
import { SCENE_THEMES } from "@/components/three/NeighborhoodCanvas";
import type { Headline } from "@/lib/sim/compare";
import { planFit, type FitPlan } from "./replayCamera";
import { outcomeLabel } from "@/lib/sim/labels";

interface Shared {
  clock: { t: number };
  playing: boolean;
  speed: number;
  duration: number;
  cam: { pos: THREE.Vector3; target: THREE.Vector3; zoom: number; version: number; owner: number };
}

const theme = SCENE_THEMES.night;

function CamSync({ shared, side }: { shared: Shared; side: number }) {
  const controls = useThree((s) => s.controls) as unknown as (THREE.EventDispatcher & { target: THREE.Vector3; update: () => void }) | null;
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const seen = useRef(-1);
  useEffect(() => {
    if (!controls) return;
    const onChange = () => {
      if (shared.cam.owner !== side) return; // echo of a sync from the other side
      shared.cam.pos.copy(camera.position);
      shared.cam.target.copy(controls.target);
      shared.cam.zoom = camera.zoom;
      shared.cam.version += 1;
      seen.current = shared.cam.version;
    };
    const onStart = () => {
      shared.cam.owner = side;
    };
    (controls as any).addEventListener("start", onStart);
    (controls as any).addEventListener("change", onChange);
    return () => {
      (controls as any).removeEventListener("start", onStart);
      (controls as any).removeEventListener("change", onChange);
    };
  }, [controls, camera, shared, side]);
  useFrame(() => {
    if (!controls || shared.cam.owner === side || shared.cam.owner < 0 || seen.current === shared.cam.version) return;
    seen.current = shared.cam.version;
    camera.position.copy(shared.cam.pos);
    camera.zoom = shared.cam.zoom;
    camera.updateProjectionMatrix();
    controls.target.copy(shared.cam.target);
    controls.update();
  });
  return null;
}

function WhenConnected({ children }: { children: React.ReactNode }) {
  const connected = useThree((s) => s.events.connected);
  return connected ? <>{children}</> : null;
}

function Ticker({ shared }: { shared: Shared }) {
  useFrame((_, dt) => {
    if (!shared.playing) return;
    shared.clock.t = Math.min(shared.duration, shared.clock.t + Math.min(dt, 0.1) * shared.speed);
    if (shared.clock.t >= shared.duration) shared.playing = false;
  });
  return null;
}

function FocusRing({ x, z }: { x: number; z: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + 0.12 * Math.sin(clock.elapsedTime * 3));
  });
  return (
    <mesh ref={ref} position={[x, 0.2, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[13, 14.2, 48]} />
      <meshBasicMaterial color="#facc15" transparent opacity={0.7} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** Applies a FitPlan (center, zoom to fit extent, unoccluded view direction) to this side's camera. */
function CamFit({ plan, shared }: { plan: FitPlan; shared: Shared }) {
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void; minZoom: number; maxZoom: number } | null;
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const size = useThree((s) => s.size);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  useEffect(() => {
    if (!controls) return;
    const { width, height } = sizeRef.current;
    const zoom = Math.max(plan.minZoom, Math.min(plan.maxZoom, Math.min(width, height) / plan.extent));
    shared.cam.owner = -1; // each side applies the same plan itself; no echo needed
    camera.position.set(plan.center.x + plan.dir[0] * 300, plan.dir[1] * 300, plan.center.z + plan.dir[2] * 300);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    controls.target.set(plan.center.x, 0, plan.center.z);
    camera.lookAt(plan.center.x, 0, plan.center.z);
    controls.update();
  }, [controls, camera, plan, shared]);
  return null;
}

function Side({ stored, run, shared, side, focus, drama, plan }: { stored: StoredRun; run: ActiveRun; shared: Shared; side: number; focus: { x: number; z: number }; drama: DramaStore; plan: FitPlan }) {
  const source = useMemo<SceneSource>(
    () => ({
      run,
      clock: shared.clock,
      cameras: stored.world.cameras,
      drama,
      isPlaying: () => shared.playing,
      speed: () => shared.speed,
    }),
    [run, shared, stored, drama]
  );
  const w = stored.world;
  const camPos: [number, number, number] = [plan.center.x + plan.dir[0] * 300, plan.dir[1] * 300, plan.center.z + plan.dir[2] * 300];
  return (
    <Canvas
      orthographic
      dpr={[1, 1.5]}
      camera={{ position: camPos, zoom: 8, near: -800, far: 4000 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ camera }) => camera.lookAt(plan.center.x, 0, plan.center.z)}
    >
      <color attach="background" args={[theme.bg]} />
      <SceneSourceProvider value={source}>
        <ambientLight intensity={theme.ambientIntensity} color={theme.ambientColor} />
        <hemisphereLight args={[theme.hemiSky, theme.hemiGround, theme.hemiIntensity]} />
        <directionalLight position={[120, 200, 80]} intensity={theme.dirIntensity} color={theme.dirColor} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
          <planeGeometry args={[w.bounds.width + 60, w.bounds.depth + 60]} />
          <meshStandardMaterial color={theme.groundColor} roughness={0.85} />
        </mesh>
        <Suspense fallback={null}>
          <RoadsLayer roads={w.roads} coverage={null} selectedId={null} theme="night" />
          <BuildingsLayer buildings={w.buildings} selectedId={null} theme="night" />
          <FacilitiesLayer facilities={w.facilities} showLabels={false} selectedId={null} />
          <StreetlightsLayer lights={w.streetlights} showPools selectedId={null} />
          <CamerasLayer cameras={w.cameras} showFov selectedId={null} />
        </Suspense>
        {/* Actors + HTML bubbles mount only once pointer events are connected, so
            drei <Html> never has to re-parent (avoids unmount races on open/close). */}
        <WhenConnected>
          <CharactersLayer />
          <DramaLayer />
          <EventsLayer />
        </WhenConnected>
        <FocusRing x={focus.x} z={focus.z} />
        {side === 0 && <Ticker shared={shared} />}
        <OrbitControls
          makeDefault
          enableDamping={false}
          target={[plan.center.x, 0, plan.center.z]}
          minZoom={0.6}
          maxZoom={16}
          mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.ROTATE }}
          maxPolarAngle={Math.PI / 2.1}
        />
        <CamFit plan={plan} shared={shared} />
        <CamSync shared={shared} side={side} />
      </SceneSourceProvider>
    </Canvas>
  );
}

function outcomeAt(stored: StoredRun, h: Headline | null, t: number): { label: string; tone: "good" | "bad" | "mid" } | null {
  if (!h) return null;
  const e = stored.events
    .filter((ev) => Math.abs(ev.tSec - h.tSec) <= 240 && Math.hypot(ev.x - h.x, ev.z - h.z) < 60)
    .sort((a, b) => Math.abs(a.tSec - h.tSec) - Math.abs(b.tSec - h.tSec))[0];
  if (!e) return t >= h.tSec ? { label: "No incident here", tone: "good" } : null;
  if (t < e.tSec) return null;
  const done = e.resolvedSec ?? e.guardArrivalSec ?? e.tSec + 90;
  if (t < done) return { label: "Incident in progress…", tone: "mid" };
  return { label: outcomeLabel(e.outcome), tone: e.outcome === "resolved" ? "good" : e.outcome === "escaped_on_cctv" ? "mid" : "bad" };
}

export default function SameNightReplay({ baseline, intervention, headline }: { baseline: StoredRun; intervention: StoredRun; headline: Headline | null }) {
  const runs = useMemo(() => ({ a: replayStoredRun(baseline), b: replayStoredRun(intervention) }), [baseline, intervention]);
  const duration = Math.min(runs.a.durationSec, runs.b.durationSec);
  const start = headline ? Math.max(0, headline.tSec - 10) : 0;
  const shared = useMemo<Shared>(
    () => ({
      clock: { t: start },
      playing: true,
      speed: 2,
      duration,
      cam: { pos: new THREE.Vector3(), target: new THREE.Vector3(), zoom: 5.5, version: 0, owner: -1 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runs]
  );
  const [t, setT] = useState(start);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(2);

  const dramas = useMemo(() => [createDramaStore(), createDramaStore()] as const, [runs]);
  useEffect(() => {
    const id = setInterval(() => {
      setT(shared.clock.t);
      setPlaying(shared.playing);
    }, 200);
    return () => clearInterval(id);
  }, [shared]);

  const focus = headline ?? { x: 0, z: 0 };
  // Default: zoomed onto the headline incident + responding guard; toggle to fit the whole society.
  const [fit, setFit] = useState<{ mode: "incident" | "society"; version: number }>({ mode: headline ? "incident" : "society", version: 0 });
  const plan = useMemo(
    () =>
      planFit(fit.mode, fit.version, headline, [
        { stored: baseline, run: runs.a },
        { stored: intervention, run: runs.b },
      ]),
    [fit, headline, baseline, intervention, runs]
  );
  const startTime = baseline.scenario.startTime;
  const oa = outcomeAt(baseline, headline, t);
  const ob = outcomeAt(intervention, headline, t);
  const toneCls = (o: { tone: string } | null) =>
    !o ? "hidden" : o.tone === "good" ? "bg-[#2e7d5b]" : o.tone === "bad" ? "bg-[#c23b3b]" : "bg-[#b98a2f]";

  return (
    <div className="overflow-hidden rounded-lg border border-[#1e293b] bg-[#0b121e]">
      <div className="grid grid-cols-2 gap-px bg-[#1e293b]">
        {([
          ["A · Baseline", baseline, runs.a, oa],
          ["B · With intervention", intervention, runs.b, ob],
        ] as const).map(([label, stored, run, o], i) => (
          <div key={i} className="relative h-[340px] bg-[#0b121e]">
            <Side stored={stored} run={run} shared={shared} side={i} focus={focus} drama={dramas[i]} plan={plan} />
            <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">{label}</div>
            <div className={`pointer-events-none absolute bottom-2 left-2 rounded px-2 py-0.5 text-[11px] font-semibold text-white ${toneCls(o)}`}>{o?.label}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-[#1e293b] bg-[#0f172a] px-3 py-2 text-[11px] text-[#cbd5e1]">
        <button
          className="flex h-7 w-7 items-center justify-center rounded bg-[#2563eb] text-white"
          onClick={() => {
            if (!shared.playing && shared.clock.t >= duration) shared.clock.t = 0;
            shared.playing = !shared.playing;
            setPlaying(shared.playing);
          }}
          title="Play / pause both"
        >
          {playing ? "❚❚" : "▶"}
        </button>
        {[1, 2, 4].map((s) => (
          <button
            key={s}
            onClick={() => {
              shared.speed = s;
              setSpeed(s);
            }}
            className={`rounded px-1.5 py-0.5 ${speed === s ? "bg-white text-[#0f172a]" : "text-[#94a3b8] hover:text-white"}`}
          >
            {s}×
          </button>
        ))}
        <span className="w-28 shrink-0 font-mono">
          {clockLabel(t, startTime)} <span className="text-[#64748b]">/ {clockLabel(duration, startTime).slice(0, 5)}</span>
        </span>
        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={duration}
            step={1}
            value={Math.min(t, duration)}
            onChange={(e) => {
              shared.clock.t = parseFloat(e.target.value);
              setT(shared.clock.t);
            }}
            className="h-1.5 w-full cursor-pointer accent-[#facc15]"
            aria-label="Shared timeline"
          />
          {headline && (
            <span
              className="pointer-events-none absolute -top-1 h-3 w-0.5 bg-[#facc15]"
              style={{ left: `${(headline.tSec / duration) * 100}%` }}
              title="Headline incident"
            />
          )}
        </div>
        {headline && (
          <button
            className="rounded border border-[#38bdf8]/60 px-2 py-0.5 text-[#7dd3fc] hover:bg-[#38bdf8]/10"
            title="Switch both views between the headline incident and the whole society"
            onClick={() => setFit((f) => ({ mode: f.mode === "incident" ? "society" : "incident", version: f.version + 1 }))}
          >
            {fit.mode === "incident" ? "Fit society" : "Focus incident"}
          </button>
        )}
        {headline && (
          <button
            className="rounded border border-[#facc15]/60 px-2 py-0.5 text-[#facc15] hover:bg-[#facc15]/10"
            onClick={() => {
              shared.clock.t = Math.max(0, headline.tSec - 10);
              shared.playing = true;
              setPlaying(true);
            }}
          >
            ⟲ Jump to incident
          </button>
        )}
      </div>
    </div>
  );
}
