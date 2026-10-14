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
import { useSceneClock, useSceneRun } from "./sceneSource";

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

export { CharactersLayer as AgentsLayer } from "./characters";

/* ------------------------------------------------------------------ */
/* Event markers                                                       */
/* ------------------------------------------------------------------ */

export function EventsLayer() {
  const activeRun = useSceneRun();
  const clock = useSceneClock();
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
    const t = clock.t;
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
