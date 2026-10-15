"use client";

/**
 * Manga / comic speech bubbles anchored above actors.
 * Variants: burst (attack / scream), round speech (default), dashed thought
 * (stalk / drowsy / asleep), yellow caption box (CCTV / dispatch).
 * Plus onomatopoeia SFX pops. Size is clamped against camera zoom so text
 * stays readable at every zoom level; close-by bubbles are stacked.
 */

import { useMemo, useRef, useState } from "react";
import { useDrama } from "@/lib/store/drama";
import { formatDist, shortAction, type PolicyDecision } from "@/lib/sim/policy";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Bangers } from "next/font/google";
import { useSceneClock, useSceneDrama, useSceneRun } from "./sceneSource";
import { BEAT_WINDOW_SEC, type ActiveBeat } from "@/lib/store/drama";
import { getBeatLine } from "@/lib/captions/captions";
import type { ActorRef, BeatKind, DramaFrame } from "@/lib/sim/incidents";
import type { Frame } from "@/lib/sim/engine";
import { CHAR_SCALE } from "./characters";

const bangers = Bangers({ weight: "400", subsets: ["latin"], display: "swap", fallback: ["Comic Sans MS", "Chalkboard SE", "system-ui", "sans-serif"] });

type F = Frame & Partial<DramaFrame>;
type Variant = "burst" | "round" | "thought" | "caption";

const VARIANT: Partial<Record<BeatKind, Variant>> = {
  attack_start: "burst",
  victim_scream: "burst",
  stalk_start: "thought",
  guard_drowsy: "thought",
  guard_asleep: "thought",
  perp_spawn: "thought",
  cctv_detect: "caption",
  cctv_missed: "caption",
  guard_dispatched: "caption",
};

const SFX: Partial<Record<BeatKind, string>> = {
  attack_start: "THWACK!",
  victim_scream: "AIEEE!",
  perp_caught: "GOTCHA!",
  perp_flee: "DASH!",
  guard_asleep: "ZZZ…",
  cctv_detect: "BEEP!",
  guard_arrived: "HALT!",
  guard_wakes: "HUH?!",
};

const ACCENT = ["#2563eb", "#ea580c", "#dc2626"] as const;
const SPIKES = (() => {
  const pts: string[] = [];
  const n = 18;
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 49 : 38;
    const jit = i % 4 === 0 ? 0.92 : 1;
    pts.push(`${(50 + Math.cos(a) * r * jit).toFixed(1)},${(50 + Math.sin(a) * r * 0.9 * jit).toFixed(1)}`);
  }
  return pts.join(" ");
})();

function actorXZ(frames: Frame[], ref: ActorRef, t: number, fb: { x: number; z: number }): [number, number] {
  const last = frames.length - 1;
  if (last < 0) return [fb.x, fb.z];
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
  if (!a || !b || ref.idx < 0 || a.length < ref.idx * 2 + 2 || b.length < ref.idx * 2 + 2) return [fb.x, fb.z];
  const k = ref.idx * 2;
  return [a[k] + (b[k] - a[k]) * fr, a[k + 1] + (b[k + 1] - a[k + 1]) * fr];
}

const OUT = "#0a0a0a";

export function BubbleBody({ variant, text, accent, sev }: { variant: Variant; text: string; accent: string; sev: number }) {
  const base: React.CSSProperties = {
    position: "relative",
    fontFamily: `${bangers.style.fontFamily}, 'Comic Sans MS', system-ui, sans-serif`,
    fontSize: 11.5,
    lineHeight: 1.15,
    letterSpacing: "0.04em",
    color: OUT,
    textAlign: "center",
    width: "max-content",
    maxWidth: 150,
    textTransform: "uppercase",
  };
  if (variant === "burst") {
    const fill = sev === 3 ? "#fde047" : "#ffffff";
    return (
      <div style={{ ...base, padding: "18px 22px", maxWidth: 170, fontSize: 12.5, color: sev === 3 ? "#7f1d1d" : OUT }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", filter: "drop-shadow(3px 3px 0 rgba(0,0,0,.55))" }}>
          <polygon points={SPIKES} fill={fill} stroke={OUT} strokeWidth="3.2" strokeLinejoin="miter" vectorEffect="non-scaling-stroke" />
          <polygon points={SPIKES} fill="none" stroke="#dc2626" strokeWidth="1.2" transform="translate(50 50) scale(0.82) translate(-50 -50)" vectorEffect="non-scaling-stroke" />
        </svg>
        <span style={{ position: "relative" }}>{text}</span>
      </div>
    );
  }
  if (variant === "caption") {
    return (
      <div
        style={{
          ...base,
          textAlign: "left",
          fontSize: 10.5,
          padding: "3px 7px 4px",
          background: "#fde047",
          border: `3px solid ${OUT}`,
          boxShadow: `3px 3px 0 ${OUT}`,
          borderRadius: 1,
          maxWidth: 150,
        }}
      >
        {text}
      </div>
    );
  }
  const thought = variant === "thought";
  return (
    <div style={{ ...base, padding: "6px 11px 7px" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#fff",
          border: `3.5px ${thought ? "dashed" : "solid"} ${OUT}`,
          borderRadius: thought ? 28 : "48% / 60%",
          boxShadow: `3px 3px 0 rgba(0,0,0,.45)`,
        }}
      />
      <span style={{ position: "relative", color: thought ? "#334155" : OUT, fontStyle: thought ? "italic" : "normal" }}>{text}</span>
      {/* tail */}
      {thought ? (
        <>
          <i style={{ position: "absolute", left: "50%", bottom: -12, width: 10, height: 10, marginLeft: -2, borderRadius: "50%", background: "#fff", border: `3px solid ${OUT}` }} />
          <i style={{ position: "absolute", left: "50%", bottom: -22, width: 6, height: 6, marginLeft: -10, borderRadius: "50%", background: "#fff", border: `2.5px solid ${OUT}` }} />
        </>
      ) : (
        <svg width="24" height="20" viewBox="0 0 24 20" style={{ position: "absolute", left: "50%", bottom: -15, marginLeft: -10 }}>
          <path d="M2 0 L12 19 L19 0 Z" fill="#fff" stroke={OUT} strokeWidth="3.2" strokeLinejoin="miter" />
          <path d="M5 -1 L18 -1" stroke="#fff" strokeWidth="5" />
        </svg>
      )}
      <i style={{ position: "absolute", left: 10, top: 6, width: 6, height: 6, borderRadius: "50%", background: accent, opacity: 0.0 }} />
    </div>
  );
}

function Sfx({ beat, word }: { beat: ActiveBeat; word: string }) {
  const activeRun = useSceneRun();
  const clock = useSceneClock();
  const group = useRef<THREE.Group>(null);
  const box = useRef<HTMLDivElement>(null);
  const camera = useThree((s) => s.camera);
  const rot = useMemo(() => (beat.key % 2 ? -9 : 8), [beat.key]);
  const red = beat.severity >= 3;

  useFrame(() => {
    if (!group.current || !activeRun) return;
    const t = clock.t;
    const age = Math.max(0, t - beat.tSec);
    const [x, z] = actorXZ(activeRun.frames, beat.actor, t, beat);
    group.current.position.set(x, CHAR_SCALE * 1.3, z);
    if (!box.current) return;
    const life = 1.8;
    const pop = Math.min(1, age / 0.15);
    const sc = (1 + Math.sin(pop * Math.PI) * 0.45) * (1 + age * 0.08);
    const zoomK = Math.min(1.0, Math.max(0.7, 0.55 + 0.08 * (camera as THREE.OrthographicCamera).zoom));
    box.current.style.opacity = String(Math.max(0, Math.min(1, (life - age) / 0.4)) * (age < life ? 1 : 0));
    box.current.style.transform = `translate(-50%, -50%) translate(${38 + Math.sin(age * 60) * 2 * Math.max(0, 1 - age * 3)}px, -6px) rotate(${rot}deg) scale(${(sc * pop * zoomK).toFixed(3)})`;
  });

  return (
    <group ref={group}>
      <Html zIndexRange={[19, 0]} style={{ pointerEvents: "none" }} wrapperClass="praesidium-sfx">
        <div
          ref={box}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            opacity: 0,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            fontFamily: `${bangers.style.fontFamily}, 'Comic Sans MS', system-ui, sans-serif`,
            fontSize: 24,
            letterSpacing: "0.05em",
            color: red ? "#ef4444" : "#fde047",
            WebkitTextStroke: `4px ${OUT}`,
            paintOrder: "stroke fill",
            textShadow: `3px 3px 0 ${OUT}`,
          }}
        >
          {word}
        </div>
      </Html>
    </group>
  );
}

export function BeatBubbles() {
  const dramaStore = useSceneDrama();
  const active = dramaStore((s) => s.activeBeats);
  const camera = useThree((s) => s.camera);
  const activeRun = useSceneRun();
  const clock = useSceneClock();
  const slots = useRef<number[]>([]);

  const shown = useMemo(() => {
    const ranked = active
      .map((b) => ({ b, text: getBeatLine(b).trim() }))
      .filter((r) => r.text)
      .sort((a, c) => c.b.severity * 0.4 + c.b.tSec * 0.01 - (a.b.severity * 0.4 + a.b.tSec * 0.01));
    const seen = new Set<string>();
    const out: { b: ActiveBeat; text: string }[] = [];
    for (const r of ranked) {
      const k = `${r.b.actor.kind}:${r.b.actor.idx}:${r.b.actor.id ?? ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
      if (out.length >= 4) break;
    }
    return out;
  }, [active]);

  const sfx = useMemo(() => active.filter((b) => SFX[b.kind]).slice(-2), [active]);

  // stack bubbles whose actors are close together
  useFrame(() => {
    if (!activeRun) return;
    const t = clock.t;
    const zoom = (camera as THREE.OrthographicCamera).zoom || 1;
    const close = 16 / Math.max(0.6, zoom / 2.2);
    const pos = shown.map((r) => actorXZ(activeRun.frames, r.b.actor, t, r.b));
    for (let i = 0; i < shown.length; i++) {
      let n = 0;
      for (let j = 0; j < i; j++) if (Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]) < close) n++;
      slots.current[i] = n;
    }
  });

  return (
    <>
      {shown.map((r, i) => (
        <BubbleLive key={r.b.key} beat={r.b} text={r.text} index={i} slots={slots} />
      ))}
      {sfx.map((b) => (
        <Sfx key={`sfx-${b.key}`} beat={b} word={SFX[b.kind]!} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Jev "AI thinking" bubbles                                           */
/* ------------------------------------------------------------------ */

const THINK_SEC = 3.2;
const THINK_ACTOR_GAP = 10;

/**
 * Rate-limited list of policy decisions worth showing: per actor at most one
 * bubble every THINK_ACTOR_GAP s, and a repeat of the same action by the same
 * actor within 30 s is skipped (e.g. "keep stalking" every 6 s).
 */
type UiDecision = PolicyDecision & { uid: number };

export function thinkingDecisions(decisions: PolicyDecision[]): UiDecision[] {
  const lastAt = new Map<string, { t: number; a: string }>();
  const out: UiDecision[] = [];
  decisions.forEach((d, uid) => {
    const id = `${d.actor.kind}:${d.actor.idx}`;
    const prev = lastAt.get(id);
    if (prev && (d.tSec - prev.t < THINK_ACTOR_GAP || (prev.a === d.action && d.tSec - prev.t < 30))) return;
    lastAt.set(id, { t: d.tSec, a: d.action });
    out.push({ ...d, uid });
  });
  return out;
}

export function decisionText(d: PolicyDecision): string {
  return `🤔 Jev: ${formatDist(d.probs)} → ${shortAction(d.action)}`;
}

export function DecisionBubbles() {
  const activeRun = useSceneRun();
  const clock = useSceneClock();
  const show = useDrama((s) => s.showThinking);
  const list = useMemo(() => thinkingDecisions(activeRun?.result.decisions ?? []), [activeRun]);
  const [active, setActive] = useState<UiDecision[]>([]);
  const prev = useRef<string>("");

  useFrame(() => {
    if (!list.length) return;
    const t = clock.t;
    const cur = list.filter((d) => d.tSec <= t && t - d.tSec < THINK_SEC).slice(-2);
    const sig = cur.map((d) => d.uid).join(",");
    if (sig !== prev.current) {
      prev.current = sig;
      setActive(cur);
    }
  });

  if (!show || !activeRun) return null;
  return (
    <>
      {active.map((d) => (
        <ThoughtLive key={`think-${d.uid}`} d={d} />
      ))}
    </>
  );
}

function ThoughtLive({ d }: { d: UiDecision }) {
  const activeRun = useSceneRun();
  const clock = useSceneClock();
  const group = useRef<THREE.Group>(null);
  const box = useRef<HTMLDivElement>(null);
  const camera = useThree((s) => s.camera);
  const text = decisionText(d);
  useFrame(() => {
    if (!group.current || !activeRun) return;
    const t = clock.t;
    const [x, z] = actorXZ(activeRun.frames, d.actor, t, d);
    group.current.position.set(x, CHAR_SCALE * 2.2, z);
    if (!box.current) return;
    const age = Math.max(0, t - d.tSec);
    const pop = Math.min(1, age / 0.25);
    const zoomK = Math.min(1.0, Math.max(0.7, 0.55 + 0.08 * (camera as THREE.OrthographicCamera).zoom));
    box.current.style.opacity = String(Math.max(0, Math.min(1, age / 0.15, (THINK_SEC - age) / 0.4)));
    // offset to the side so it does not cover beat bubbles above the same actor
    box.current.style.transform = `translate(12px, -100%) translate(0, -46px) scale(${(pop * zoomK).toFixed(3)})`;
  });
  return (
    <group ref={group}>
      <Html zIndexRange={[21, 0]} style={{ pointerEvents: "none" }} wrapperClass="praesidium-thought">
        <div
          ref={box}
          data-jev-thought=""
          style={{ position: "absolute", left: 0, top: 0, opacity: 0, transformOrigin: "0% 100%", pointerEvents: "none" }}
          title={d.situation}
        >
          <BubbleBody variant="thought" text={text} accent="#7c3aed" sev={1} />
        </div>
      </Html>
    </group>
  );
}

function BubbleLive({ beat, text, index, slots }: { beat: ActiveBeat; text: string; index: number; slots: React.MutableRefObject<number[]> }) {
  // Bubble variant that reads the slot each frame
  const activeRun = useSceneRun();
  const clock = useSceneClock();
  const group = useRef<THREE.Group>(null);
  const box = useRef<HTMLDivElement>(null);
  const camera = useThree((s) => s.camera);
  const variant: Variant = VARIANT[beat.kind] ?? "round";
  const accent = ACCENT[beat.severity - 1] ?? ACCENT[0];
  const smooth = useRef(0);

  useFrame((_, dt) => {
    if (!group.current || !activeRun) return;
    const t = clock.t;
    const [x, z] = actorXZ(activeRun.frames, beat.actor, t, beat);
    group.current.position.set(x, CHAR_SCALE * 2.2 + (beat.actor.kind === "camera" ? 3 : 0), z);
    if (!box.current) return;
    smooth.current += ((slots.current[index] ?? 0) - smooth.current) * (1 - Math.exp(-dt * 8));
    const slot = smooth.current;
    const age = Math.max(0, t - beat.tSec);
    const pop = Math.min(1, age / 0.22);
    const overshoot = 1 + Math.sin(pop * Math.PI) * 0.22;
    const zoomK = Math.min(1.0, Math.max(0.7, 0.55 + 0.08 * (camera as THREE.OrthographicCamera).zoom));
    const op = Math.max(0, Math.min(1, age / 0.12, (BEAT_WINDOW_SEC - age) / 0.25));
    let sx = 0, sy = 0;
    if (variant === "burst" && age < 0.9) {
      const d = 1 - age / 0.9;
      sx = Math.sin(age * 70) * 4 * d;
      sy = Math.cos(age * 85) * 3 * d;
    }
    const stackY = slot * 64;
    const stackX = slot > 0.5 ? (Math.round(slot) % 2 === 1 ? 50 : -50) : 0;
    const anchor = variant === "caption" ? "translate(-100%, -100%) translate(10px, -4px)" : "translate(-50%, -100%)";
    box.current.style.opacity = String(op);
    box.current.style.transform = `${anchor} translate(${stackX + sx}px, ${-stackY + sy}px) scale(${(pop * overshoot * zoomK).toFixed(3)})`;  });

  return (
    <group ref={group}>
      <Html zIndexRange={[20, 0]} style={{ pointerEvents: "none" }} wrapperClass="praesidium-bubble">
        <div ref={box} style={{ position: "absolute", left: 0, top: 0, opacity: 0, transformOrigin: "50% 100%", pointerEvents: "none", willChange: "transform, opacity" }}>
          <BubbleBody variant={variant} text={text} accent={accent} sev={beat.severity} />
        </div>
      </Html>
    </group>
  );
}
