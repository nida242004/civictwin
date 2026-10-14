"use client";

/**
 * Client voice system for incident beats.
 *
 * Timing model: nothing on the playback hot path touches the network.
 *  - prefetchBeats() generates audio for every speakable beat ahead of time
 *    (baked manifest -> IndexedDB -> /api/ai/tts, concurrency 2, earliest first)
 *    and keeps decoded AudioBuffers in memory (one Web Audio context).
 *  - handleBeat() runs when the drama clock reaches a beat: if the clip is
 *    decoded it starts instantly via Web Audio; if not, it falls back to
 *    speechSynthesis immediately. A late clip is never played afterwards.
 *  - Playback speed policy, overlap policy and stop-on-pause/seek/mute live here.
 */

import { useEffect, useSyncExternalStore } from "react";
import type { BeatKind, IncidentBeat } from "@/lib/sim/incidents";
import { subscribeNewBeats, useDrama, type DramaStore } from "@/lib/store/drama";
import { useEditor, playbackClock } from "@/lib/store/editor";
import type { VoiceRole } from "@/lib/ai/context";
import { clipHash } from "./hash";
import { idbGet, idbPut } from "./audioStore";

const MUTE_KEY = "praesidium.voice.muted";

/* ---------------- mute state (persisted) ---------------- */

let muted = false;
try {
  muted = typeof localStorage !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
} catch {
  /* ignore */
}
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function isMuted() {
  return muted;
}
export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (v) stopSpeaking();
  else if (lastBeats.length) prefetchBeats(lastBeats);
  emit();
}
export function useVoiceMuted(): [boolean, (v: boolean) => void] {
  const m = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => muted,
    () => false
  );
  return [m, setMuted];
}

/* ---------------- configuration ---------------- */

let minSeverity: 1 | 2 | 3 = 2;
export function setMinSeverity(s: 1 | 2 | 3) {
  minSeverity = s;
}

/** Optional rewritten lines (e.g. from /api/ai/narrate), keyed by beatKey(). */
const overrides = new Map<string, string>();
export const beatKey = (b: Pick<IncidentBeat, "tSec" | "kind" | "eventId">) => `${Math.round(b.tSec * 10)}|${b.kind}|${b.eventId ?? ""}`;
/** Caption for a beat: narrate-rewritten line if present, else the engine default. */
export function getBeatLine(b: Pick<IncidentBeat, "tSec" | "kind" | "eventId" | "line">): string {
  return overrides.get(beatKey(b)) ?? b.line ?? "";
}
export function clearLineOverrides() {
  overrides.clear();
}
export function setLineOverrides(beats: IncidentBeat[], lines: string[]) {
  beats.forEach((b, i) => {
    if (lines[i]) overrides.set(beatKey(b), lines[i]);
  });
}

export const ROLE: Record<BeatKind, VoiceRole> = {
  perp_spawn: "narrator",
  stalk_start: "perp",
  attack_start: "perp",
  victim_scream: "victim",
  cctv_detect: "narrator",
  cctv_missed: "narrator",
  guard_asleep: "narrator",
  guard_wakes: "guard",
  guard_spots: "guard",
  guard_drowsy: "narrator",
  guard_dispatched: "guard",
  guard_arrived: "guard",
  perp_flee: "perp",
  perp_caught: "guard",
  perp_escaped: "narrator",
  resident_alert: "victim",
};

const SPEECH: Record<VoiceRole, { pitch: number; rate: number }> = {
  victim: { pitch: 1.5, rate: 1.15 },
  perp: { pitch: 0.6, rate: 0.9 },
  guard: { pitch: 0.85, rate: 1.0 },
  narrator: { pitch: 1.0, rate: 1.0 },
};

/* ---------------- debug ---------------- */

interface DebugEntry {
  label: string;
  beatT: number;
  clockT: number;
  /** Wall-clock ms between the beat's sim time and the moment audio was started (frame quantisation included). */
  lateMs: number;
  /** ms spent inside handleBeat before start() */
  handlerMs: number;
  mode: "buffer" | "speech" | "skip";
  reason?: string;
  text: string;
  sev: number;
}
function debugOn(): boolean {
  return typeof window !== "undefined" && (window as unknown as { __praesidiumVoiceDebug?: boolean }).__praesidiumVoiceDebug === true;
}
function debugLog(e: DebugEntry) {
  if (!debugOn()) return;
  const w = window as unknown as { __praesidiumVoiceLog?: DebugEntry[] };
  (w.__praesidiumVoiceLog ??= []).push(e);
  // eslint-disable-next-line no-console
  console.log(
    `[voice] ${e.label} beat@${e.beatT.toFixed(1)}s clock@${e.clockT.toFixed(2)}s late=${e.lateMs.toFixed(0)}ms handler=${e.handlerMs.toFixed(1)}ms ${e.mode}${e.reason ? `(${e.reason})` : ""} "${e.text.slice(0, 40)}"`
  );
}

/* ---------------- Web Audio context ---------------- */

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === "undefined") return null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}
function resumeCtx() {
  const c = getCtx();
  if (c && c.state !== "running") void c.resume().catch(() => {});
}
if (typeof window !== "undefined") {
  for (const ev of ["pointerdown", "keydown", "touchstart", "click"]) window.addEventListener(ev, resumeCtx, { passive: true, capture: true });
}

/* ---------------- clip cache ---------------- */

interface Clip {
  buf: AudioBuffer;
  /** seconds of leading silence to skip */
  lead: number;
}
const clips = new Map<string, Clip>();
const CLIP_CAP = 240;
const inflight = new Map<string, Promise<Clip | null>>();
const failedAt = new Map<string, number>();
let ttsDown = 0; // timestamp until which /api/ai/tts is considered unavailable
let manifestP: Promise<Record<string, string>> | null = null;

function loadManifest(): Promise<Record<string, string>> {
  manifestP ??= fetch("/voice/manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : {}))
    .catch(() => ({}));
  return manifestP;
}

function leadingSilence(buf: AudioBuffer): number {
  try {
    const d = buf.getChannelData(0);
    const thr = 0.012;
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > thr) return Math.max(0, i / buf.sampleRate - 0.04);
  } catch {
    /* ignore */
  }
  return 0;
}

async function decode(bytes: ArrayBuffer): Promise<Clip | null> {
  const c = getCtx();
  if (!c) return null;
  try {
    const buf = await c.decodeAudioData(bytes.slice(0));
    return { buf, lead: Math.min(leadingSilence(buf), 1.5) };
  } catch {
    return null;
  }
}

async function loadClip(hash: string, role: VoiceRole, text: string, network: boolean): Promise<Clip | null> {
  const stored = await idbGet(hash);
  if (stored) {
    const c = await decode(stored);
    if (c) return c;
  }
  try {
    const file = (await loadManifest())[hash];
    if (file) {
      const r = await fetch(`/voice/${file}`);
      if (r.ok) {
        const bytes = await r.arrayBuffer();
        const c = await decode(bytes);
        if (c) {
          void idbPut(hash, bytes);
          return c;
        }
      }
    }
  } catch {
    /* fall through */
  }
  if (!network || Date.now() < ttsDown) return null;
  const failed = failedAt.get(hash);
  if (failed && Date.now() - failed < 60_000) return null;
  try {
    const res = await fetch("/api/ai/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: role }),
    });
    if (res.ok && (res.headers.get("content-type") ?? "").includes("audio")) {
      const bytes = await res.arrayBuffer();
      const c = await decode(bytes);
      if (c) {
        void idbPut(hash, bytes);
        return c;
      }
    } else if (res.status === 503) {
      ttsDown = Date.now() + 60_000; // no key configured
    }
  } catch {
    ttsDown = Date.now() + 15_000;
  }
  failedAt.set(hash, Date.now());
  return null;
}

function ensureClip(hash: string, role: VoiceRole, text: string, network: boolean): Promise<Clip | null> {
  const hit = clips.get(hash);
  if (hit) return Promise.resolve(hit);
  const k = `${hash}|${network ? 1 : 0}`;
  let p = inflight.get(k);
  if (!p) {
    p = loadClip(hash, role, text, network)
      .then((c) => {
        if (c) {
          clips.set(hash, c);
          if (clips.size > CLIP_CAP) clips.delete(clips.keys().next().value as string);
        }
        return c;
      })
      .finally(() => inflight.delete(k));
    inflight.set(k, p);
  }
  return p;
}

/* ---------------- prefetch ---------------- */

let prefetchGen = 0;
let lastBeats: IncidentBeat[] = [];
const PREFETCH_CONCURRENCY = 2;

/**
 * Generate/load audio for every speakable beat in the background (earliest
 * first, deduped by voice+text). `network:false` only warms from the baked
 * manifest / IndexedDB (used before narration lines are final).
 */
export function prefetchBeats(beats: IncidentBeat[], opts?: { network?: boolean; minSeverity?: 1 | 2 | 3 }) {
  if (typeof window === "undefined") return;
  lastBeats = beats;
  const gen = ++prefetchGen;
  const minSev = opts?.minSeverity ?? minSeverity;
  const network = opts?.network !== false && !muted;
  const seen = new Set<string>();
  const jobs: { hash: string; role: VoiceRole; text: string }[] = [];
  for (const b of [...beats].sort((a, c) => a.tSec - c.tSec)) {
    if (b.severity < minSev) continue;
    const text = getBeatLine(b).trim();
    if (!text) continue;
    const role = ROLE[b.kind] ?? "narrator";
    const hash = clipHash(role, text);
    if (seen.has(hash) || clips.has(hash)) continue;
    seen.add(hash);
    jobs.push({ hash, role, text });
  }
  let next = 0;
  const worker = async () => {
    while (gen === prefetchGen) {
      const j = jobs[next++];
      if (!j) return;
      await ensureClip(j.hash, j.role, j.text, network);
    }
  };
  for (let i = 0; i < PREFETCH_CONCURRENCY; i++) void worker();
}

/* ---------------- playback ---------------- */

/** Identity of the line currently being spoken (matches speakKeyOf of its beat), or "". */
let speakingKey = "";
export const speakKeyOf = (b: Pick<IncidentBeat, "tSec" | "kind" | "eventId">) => beatKey(b);
export function getSpeakingKey() {
  return speakingKey;
}

interface Current {
  key: string;
  sev: number;
  startedAt: number; // performance.now()
  durMs: number;
  stop: () => void;
}
let cur: Current | null = null;

function setCur(c: Current | null) {
  cur = c;
  speakingKey = c?.key ?? "";
}
function clearIf(me: Current) {
  if (cur === me) setCur(null);
}

function stopCurrent() {
  const c = cur;
  setCur(null);
  try {
    c?.stop();
  } catch {
    /* ignore */
  }
}

export function stopSpeaking() {
  stopCurrent();
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}

interface Policy {
  ok: boolean;
  rate: number;
  reason?: string;
}
/** Which beats are spoken, and how fast, at a given playback speed. */
function speedPolicy(speed: number, sev: number): Policy {
  if (speed >= 7) return { ok: false, rate: 1, reason: "speed>=8x muted" };
  if (speed >= 3) return sev >= 3 ? { ok: true, rate: 1.25 } : { ok: false, rate: 1, reason: "4x: sev3 only" };
  if (speed >= 1.5) return { ok: true, rate: 1.25 };
  return { ok: true, rate: 1 };
}

function playBuffer(clip: Clip, rate: number, sev: number, key: string): number {
  const c = getCtx()!;
  const src = c.createBufferSource();
  src.buffer = clip.buf;
  src.playbackRate.value = rate;
  const gain = c.createGain();
  src.connect(gain).connect(c.destination);
  const durMs = ((clip.buf.duration - clip.lead) / rate) * 1000;
  const me: Current = {
    key,
    sev,
    startedAt: performance.now(),
    durMs,
    stop: () => {
      const t = c.currentTime;
      try {
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.04);
        src.stop(t + 0.05);
      } catch {
        /* already stopped */
      }
    },
  };
  src.onended = () => clearIf(me);
  setCur(me);
  src.start(0, clip.lead);
  return durMs;
}

function speak(text: string, role: VoiceRole, rate: number, sev: number, key: string) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(text);
  const p = SPEECH[role];
  u.pitch = p.pitch;
  u.rate = Math.min(2, p.rate * (rate > 1 ? 1.2 : 1));
  const durMs = Math.min(9000, (text.length * 75) / u.rate);
  const me: Current = {
    key,
    sev,
    startedAt: performance.now(),
    durMs,
    stop: () => {
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
    },
  };
  const done = () => clearIf(me);
  u.onend = done;
  u.onerror = done;
  setCur(me);
  setTimeout(done, durMs + 2500);
  synth.speak(u);
}

export interface BeatEnv {
  /** Current sim clock (seconds) of the scene that fired the beat. */
  clockT: number;
  speed: number;
  playing: boolean;
  label?: string;
  force?: boolean;
  /** Session id; only the most recently started session may speak. */
  session?: number;
}

/** Called the moment a beat starts. Never awaits; never touches the network. */
export function handleBeat(beat: IncidentBeat, env: BeatEnv) {
  if (typeof window === "undefined" || muted) return;
  const t0 = performance.now();
  const text = getBeatLine(beat).trim();
  const label = env.label ?? "main";
  const log = (mode: DebugEntry["mode"], reason?: string) =>
    debugLog({
      label,
      beatT: beat.tSec,
      clockT: env.clockT,
      lateMs: Math.max(0, ((env.clockT - beat.tSec) * 1000) / Math.max(0.25, env.speed)),
      handlerMs: performance.now() - t0,
      mode,
      reason,
      text,
      sev: beat.severity,
    });

  if (!text) return;
  if (!env.force && beat.severity < minSeverity) return;
  if (!env.playing) return log("skip", "paused");
  if (typeof document !== "undefined" && document.hidden) return log("skip", "tab hidden");
  if (env.session !== undefined && env.session !== activeSession) return log("skip", "not the active session");
  // only while the run plays forward THROUGH this beat: a seek/jump/replay-restart
  // lands the clock far from the beat time and is dropped here.
  const lateSim = env.clockT - beat.tSec;
  if (lateSim < -0.1 || lateSim > Math.max(0.5, 0.12 * env.speed)) return log("skip", "not at beat time (seek/jump/stale)");
  const pol = speedPolicy(env.speed, beat.severity);
  if (!pol.ok) return log("skip", pol.reason);

  // overlap policy: a more important line cuts the current one; an equal one
  // only once the current is mostly done; otherwise the new line is dropped.
  if (cur) {
    const progress = (performance.now() - cur.startedAt) / Math.max(1, cur.durMs);
    const interrupt = beat.severity > cur.sev || (beat.severity === cur.sev && progress > 0.6);
    if (!interrupt) return log("skip", "overlap");
    stopSpeaking();
  }

  const role = ROLE[beat.kind] ?? "narrator";
  const hash = clipHash(role, text);
  const key = speakKeyOf(beat);
  const clip = clips.get(hash);
  const c = getCtx();
  if (clip && c) {
    if (c.state !== "running") {
      void c.resume().catch(() => {});
      speak(text, role, pol.rate, beat.severity, key); // not unlocked yet: don't wait
      return log("speech", "audio locked");
    }
    playBuffer(clip, pol.rate, beat.severity, key);
    return log("buffer");
  }
  // not ready: speak right now with the browser voice; warm the clip for replays
  speak(text, role, pol.rate, beat.severity, key);
  void ensureClip(hash, role, text, true);
  log("speech", "clip not ready");
}

/** Back-compat helper: speak one beat as if it just fired (ignores speed/overlap history). */
export function speakBeat(beat: IncidentBeat, opts?: { force?: boolean }) {
  handleBeat(beat, { clockT: beat.tSec, speed: 1, playing: true, force: opts?.force, label: "adhoc" });
}

/* ---------------- sessions (bind a drama store + clock to the voice) ---------------- */

export interface VoiceSource {
  drama: DramaStore;
  getClock: () => number;
  getSpeed: () => number;
  isPlaying: () => boolean;
  label?: string;
}

/**
 * Speak beats from one scene. Cancels all audio on pause, scrub/seek (clock
 * jump), and on teardown (run change, leaving the editor, focus change).
 */
export function startVoiceSession(src: VoiceSource): () => void {
  const id = ++sessionSeq;
  activeSession = id; // supersedes any other subscriber: never two voices
  stopSpeaking();
  const off = subscribeNewBeats(
    (b) => handleBeat(b, { clockT: src.getClock(), speed: src.getSpeed(), playing: src.isPlaying(), label: src.label, session: id }),
    src.drama
  );
  let last = src.getClock();
  let lastW = performance.now();
  const iv = setInterval(() => {
    const t = src.getClock();
    const now = performance.now();
    const playing = src.isPlaying();
    const expected = last + (playing ? ((now - lastW) / 1000) * src.getSpeed() : 0);
    if (!playing || t < last - 0.05 || t > expected + 1.0) stopSpeaking();
    last = t;
    lastW = now;
  }, 100);
  return () => {
    off();
    clearInterval(iv);
    if (activeSession === id) {
      activeSession = 0;
      stopSpeaking();
    }
  };
}
let sessionSeq = 0;
let activeSession = 0;

/**
 * Mount once (TopBar): warms audio for the loaded run and speaks beats of the
 * main scene as the playback clock reaches them.
 */
export function useVoiceDriver() {
  const activeRun = useEditor((s) => s.activeRun);
  const compareOpen = useEditor((s) => s.compareOpen);

  useEffect(() => {
    if (!activeRun) return;
    prefetchBeats(activeRun.result.beats ?? [], { network: false });
  }, [activeRun]);

  useEffect(() => {
    if (!activeRun || compareOpen) return;
    return startVoiceSession({
      drama: useDrama,
      getClock: () => playbackClock.t,
      getSpeed: () => useEditor.getState().speed,
      isPlaying: () => useEditor.getState().playing,
      label: "main",
    });
  }, [activeRun, compareOpen]);

  useEffect(() => () => stopSpeaking(), []);
}
