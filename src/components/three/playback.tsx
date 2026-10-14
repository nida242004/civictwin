"use client";

/**
 * Simulation playback layers: animated pedestrian/guard agents, event
 * markers, and the playback clock. Positions are interpolated between
 * precomputed deterministic frames — scrubbing restores exact state.
 */

import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useEditor, playbackClock } from "@/lib/store/editor";
import { AGENT_STATE, GUARD_STATE } from "@/lib/sim/engine";

const SEVERITY_COLORS = ["#f59e0b", "#f97316", "#ef4444"];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Advances the playback clock inside the render loop (no React re-renders). */
export function PlaybackTicker() {
  const playing = useEditor((s) => s.playing);
  const speed = useEditor((s) => s.speed);
  const activeRun = useEditor((s) => s.activeRun);
  const accRef = useRef(0);

  useFrame((_, delta) => {
    if (!playing || !activeRun) return;
    const dur = activeRun.durationSec;
    playbackClock.t = Math.min(dur, playbackClock.t + delta * speed);
    if (playbackClock.t >= dur) {
      useEditor.getState().setPlaying(false);
    }
    // throttle UI clock mirror to ~5 Hz
    accRef.current += delta;
    if (accRef.current > 0.2) {
      accRef.current = 0;
      useEditor.getState().tickDisplay();
    }
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Agents                                                              */
/* ------------------------------------------------------------------ */

const MAX_AGENTS = 200;
const MAX_GUARDS = 24;

export function AgentsLayer() {
  const activeRun = useEditor((s) => s.activeRun);
  const residentRef = useRef<THREE.InstancedMesh>(null);
  const commuterRef = useRef<THREE.InstancedMesh>(null);
  const guardRef = useRef<THREE.InstancedMesh>(null);

  const nAgents = activeRun ? (activeRun.frames[0]?.agentPos.length ?? 0) / 2 : 0;
  const nGuards = activeRun ? (activeRun.frames[0]?.guardPos.length ?? 0) / 2 : 0;

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!activeRun) return;
    const t = playbackClock.t;
    const i0 = Math.min(Math.floor(t), activeRun.frames.length - 1);
    const i1 = Math.min(i0 + 1, activeRun.frames.length - 1);
    const frac = t - i0;
    const f0 = activeRun.frames[i0];
    const f1 = activeRun.frames[i1];

    let rCount = 0;
    let cCount = 0;
    for (let i = 0; i < nAgents; i++) {
      const state = f0.agentState[i];
      const x = lerp(f0.agentPos[i * 2], f1.agentPos[i * 2], frac);
      const z = lerp(f0.agentPos[i * 2 + 1], f1.agentPos[i * 2 + 1], frac);
      const mesh = f0.agentCat?.[i] === 1 ? commuterRef.current : residentRef.current;
      if (!mesh) continue;
      if (state === AGENT_STATE.WALKING) {
        dummy.position.set(x, 0.75 + Math.abs(Math.sin(t * 6 + i)) * 0.12, z);
        dummy.rotation.set(0, 0, 0);
      } else {
        // waiting / arrived / cancelled agents rest at their position
        dummy.position.set(x, 0.45, z);
        dummy.rotation.set(0, 0, Math.PI / 2); // lying low = resting
        if (state === AGENT_STATE.WAITING && !f0.agentStarted?.[i]) {
          // not yet spawned — hide
          dummy.position.set(0, -50, 0);
        }
      }
      dummy.scale.setScalar(state === AGENT_STATE.CANCELLED ? 0 : 1);
      dummy.updateMatrix();
      if (f0.agentCat?.[i] === 1) {
        commuterRef.current?.setMatrixAt(cCount++, dummy.matrix);
      } else {
        residentRef.current?.setMatrixAt(rCount++, dummy.matrix);
      }
    }
    if (residentRef.current) {
      residentRef.current.count = rCount;
      residentRef.current.instanceMatrix.needsUpdate = true;
    }
    if (commuterRef.current) {
      commuterRef.current.count = cCount;
      commuterRef.current.instanceMatrix.needsUpdate = true;
    }

    let gCount = 0;
    for (let i = 0; i < nGuards; i++) {
      const state = f0.guardState[i];
      const x = lerp(f0.guardPos[i * 2], f1.guardPos[i * 2], frac);
      const z = lerp(f0.guardPos[i * 2 + 1], f1.guardPos[i * 2 + 1], frac);
      const mesh = guardRef.current;
      if (!mesh) continue;
      dummy.position.set(x, 0.95 + Math.abs(Math.sin(t * 5 + i)) * 0.12, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(state === GUARD_STATE.UNAVAILABLE ? 0 : 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(gCount++, dummy.matrix);
    }
    if (guardRef.current) {
      guardRef.current.count = gCount;
      guardRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  if (!activeRun) return null;

  return (
    <group>
      <instancedMesh ref={residentRef} args={[undefined, undefined, MAX_AGENTS]} frustumCulled={false}>
        <capsuleGeometry args={[0.3, 0.9, 4, 8]} />
        <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={0.25} roughness={0.65} />
      </instancedMesh>
      <instancedMesh ref={commuterRef} args={[undefined, undefined, MAX_AGENTS]} frustumCulled={false}>
        <capsuleGeometry args={[0.3, 0.9, 4, 8]} />
        <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.3} roughness={0.65} />
      </instancedMesh>
      <instancedMesh ref={guardRef} args={[undefined, undefined, MAX_GUARDS]} frustumCulled={false}>
        <capsuleGeometry args={[0.36, 1.05, 4, 8]} />
        <meshStandardMaterial color="#facc15" emissive="#ca8a04" emissiveIntensity={0.35} roughness={0.65} />
      </instancedMesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Event markers                                                       */
/* ------------------------------------------------------------------ */

export function EventsLayer() {
  const activeRun = useEditor((s) => s.activeRun);
  const groupRef = useRef<THREE.Group>(null);
  const events = activeRun?.result.events ?? [];

  const markers = useMemo(
    () =>
      events.map((e) => ({
        ...e,
        color: SEVERITY_COLORS[e.severity - 1] ?? "#b98a2f",
      })),
    [events]
  );

  useFrame(() => {
    if (!groupRef.current) return;
    const t = playbackClock.t;
    groupRef.current.children.forEach((child, i) => {
      const e = markers[i];
      if (!e) return;
      const age = t - e.tSec;
      const visible = age >= 0 && age <= 90 && (e.resolvedSec === null || t < e.resolvedSec);
      child.visible = visible;
      if (!visible) return;
      const pulse = age < 40 ? 1 + 0.18 * Math.sin(t * 3) : 1;
      child.scale.setScalar(pulse);
    });
  });

  if (!activeRun || !markers.length) return null;

  return (
    <group ref={groupRef}>
      {markers.map((e) => (
        <group key={e.id} position={[e.x, 0.12, e.z]} visible={false}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.6, 2.3, 20]} />
            <meshBasicMaterial color={e.color} transparent opacity={0.9} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[1.4, 16]} />
            <meshBasicMaterial color={e.color} transparent opacity={0.25} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
