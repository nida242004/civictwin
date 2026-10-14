/**
 * Bake voice for the deterministic demo nights.
 *
 * Runs the engine for the demo neighborhood (Typical Night seed 20260214, High-Risk Night
 * both as the template applied in the UI and with its own seed), collects speakable lines
 * (default EN lines + Gemini EN/Hinglish narration via the running /api/ai/narrate),
 * synthesizes them through the running /api/ai/tts, encodes to MP3 (ffmpeg; falls back to
 * 16 kHz mono WAV) and writes public/voice/<hash>.<ext>, manifest.json and narration.json.
 *
 * Usage: bun scripts/bake-voice.ts        (dev server on http://localhost:3000, or BASE_URL)
 * Incremental: clips already in the manifest are skipped.
 */
import fs from "fs";
import path from "path";
import { buildDemoWorld, DEMO_NAME } from "../src/lib/world/demo";
import { defaultScenario } from "../src/lib/world/types";
import { applyScenarioTemplate } from "../src/lib/sim/scenarios";
import { runSimulation } from "../src/lib/sim/engine";
import type { IncidentBeat } from "../src/lib/sim/incidents";
import { clipHash, narrationKey, pickBeats } from "../src/lib/voice/hash";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const Bun = (globalThis as any).Bun;
const OUT = path.resolve(process.cwd(), "public/voice");
const MIN_SEV = 2;
const ROLE: Record<string, string> = {
  perp_spawn: "narrator", stalk_start: "perp", attack_start: "perp", victim_scream: "victim", cctv_detect: "narrator",
  cctv_missed: "narrator", guard_asleep: "narrator", guard_wakes: "guard", guard_spots: "guard", guard_drowsy: "narrator",
  guard_dispatched: "guard", guard_arrived: "guard", perp_flee: "perp", perp_caught: "guard", perp_escaped: "narrator", resident_alert: "victim",
};

fs.mkdirSync(OUT, { recursive: true });
const manifestPath = path.join(OUT, "manifest.json");
const narrationPath = path.join(OUT, "narration.json");
const manifest: Record<string, string> = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
const narration: Record<string, { lines: string[]; debriefs: Record<string, string> }> = fs.existsSync(narrationPath)
  ? JSON.parse(fs.readFileSync(narrationPath, "utf8"))
  : {};

const base = defaultScenario("typical_night");
const scenarios = [
  { name: "typical", sc: base },
  { name: "high-risk(template)", sc: applyScenarioTemplate(base, "high_risk_night") },
  { name: "high-risk(own seed)", sc: defaultScenario("high_risk_night") },
];

const jobs = new Map<string, { role: string; text: string }>();
let addAudio = true;
const add = (b: IncidentBeat, text: string) => {
  if (!addAudio || b.severity < MIN_SEV || !text.trim()) return;
  const role = ROLE[b.kind] ?? "narrator";
  jobs.set(clipHash(role, text), { role, text: text.replace(/\s+/g, " ").trim().slice(0, 240) });
};

// BAKE_ONLY=typical limits audio synthesis to scenarios whose name contains the text (narration text is always baked)
const onlyAudio = process.env.BAKE_ONLY;
for (const { name, sc } of scenarios) {
  addAudio = !onlyAudio || name.includes(onlyAudio);
  const world = buildDemoWorld();
  const res = runSimulation(world, sc);
  const beats = res.beats;
  console.log(`[${name}] seed=${sc.seed} beats=${beats.length} speakable=${beats.filter((b) => b.severity >= MIN_SEV).length}`);
  beats.forEach((b) => add(b, b.line));
  const picked = pickBeats(beats);
  for (const lang of ["en", "hinglish"] as const) {
    const key = narrationKey(lang, picked);
    let entry = narration[key];
    if (!entry) {
      try {
        const r = await fetch(`${BASE}/api/ai/narrate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ beats: picked, lang, context: { placeName: DEMO_NAME } }),
          signal: AbortSignal.timeout(90000),
        });
        const j: any = await r.json();
        if (j?.ok && j.data?.provider === "gemini" && Array.isArray(j.data.lines)) {
          entry = { lines: j.data.lines, debriefs: j.data.debriefs ?? {} };
          narration[key] = entry;
        } else console.log(`  narrate ${lang}: provider=${j?.data?.provider ?? "none"} - not baked`);
      } catch (e) {
        console.log(`  narrate ${lang} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (entry) {
      const byBeat = new Map(picked.map((b, i) => [b, entry!.lines[i]]));
      for (const b of picked) add(b, byBeat.get(b) ?? b.line);
      console.log(`  narration ${lang}: ${entry.lines.length} lines`);
    }
  }
}
fs.writeFileSync(narrationPath, JSON.stringify(narration));

/* ---------------- synthesize + encode ---------------- */

const hasFfmpeg = Bun.spawnSync(["ffmpeg", "-version"]).exitCode === 0;
console.log(`clips to bake: ${jobs.size} (ffmpeg: ${hasFfmpeg})`);

function downsampleWav16k(wav: Uint8Array): Uint8Array {
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const rate = dv.getUint32(24, true);
  const pcm = new Int16Array(wav.buffer.slice(wav.byteOffset + 44, wav.byteOffset + wav.byteLength));
  const ratio = rate / 16000;
  const n = Math.floor(pcm.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio, i0 = Math.floor(p), f = p - i0;
    out[i] = pcm[i0] * (1 - f) + (pcm[Math.min(i0 + 1, pcm.length - 1)] ?? 0) * f;
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + n * 2, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(n * 2, 40);
  return Buffer.concat([h, Buffer.from(out.buffer)]);
}

async function encode(wav: Uint8Array, hash: string): Promise<string> {
  if (hasFfmpeg) {
    const tmp = path.join(OUT, `${hash}.tmp.wav`);
    const out = path.join(OUT, `${hash}.mp3`);
    fs.writeFileSync(tmp, wav);
    const trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03";
    const p = Bun.spawnSync(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-ac", "1", "-ar", "24000", "-af", `${trim},areverse,${trim},areverse`, "-c:a", "libmp3lame", "-b:a", "32k", out]);
    fs.rmSync(tmp, { force: true });
    if (p.exitCode === 0) return `${hash}.mp3`;
  }
  fs.writeFileSync(path.join(OUT, `${hash}.wav`), downsampleWav16k(wav));
  return `${hash}.wav`;
}

const todo = [...jobs.entries()].filter(([h]) => !(manifest[h] && fs.existsSync(path.join(OUT, manifest[h]))));
let next = 0, ok = 0, fail = 0;
async function worker() {
  while (true) {
    const item = todo[next++];
    if (!item) return;
    const [hash, { role, text }] = item;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${BASE}/api/ai/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: role }),
          signal: AbortSignal.timeout(70000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        manifest[hash] = await encode(new Uint8Array(await r.arrayBuffer()), hash);
        ok++;
        break;
      } catch (e) {
        if (attempt === 2) {
          fail++;
          console.log(`  FAIL ${role}: "${text.slice(0, 40)}" ${e instanceof Error ? e.message : e}`);
        } else await new Promise((r) => setTimeout(r, 1500));
      }
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    if ((ok + fail) % 10 === 0) console.log(`  ${ok + fail}/${todo.length}`);
  }
}
await Promise.all([worker(), worker()]);

// drop files no longer referenced
const keep = new Set(Object.values(manifest));
for (const f of fs.readdirSync(OUT)) if (f !== "manifest.json" && f !== "narration.json" && !keep.has(f)) fs.rmSync(path.join(OUT, f));
fs.writeFileSync(manifestPath, JSON.stringify(manifest));
const bytes = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`baked ok=${ok} fail=${fail} total clips=${Object.keys(manifest).length} size=${(bytes / 1024 / 1024).toFixed(2)} MB`);
