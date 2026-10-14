import { NextRequest, NextResponse } from "next/server";
import { geminiConfigured } from "@/lib/ai/gemini";
import { VOICES, type VoiceRole } from "@/lib/ai/context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODELS = ["gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-3.8-flash-tts"];

const VOICE_MAP: Record<VoiceRole, { name: string; style: string }> = {
  victim: { name: "Kore", style: "Say in a frightened, breathless, trembling voice, urgent:" },
  perp: { name: "Charon", style: "Say in a low, menacing, curt whisper:" },
  guard: { name: "Fenrir", style: "Say in a firm, authoritative, alert voice:" },
  narrator: { name: "Puck", style: "Say in a calm, clear documentary narrator voice:" },
};

const CACHE = new Map<string, Buffer>();
const CACHE_MAX = 120;
let cursor = 0;

function keys(): string[] {
  const out: string[] = [];
  const push = (v?: string) => {
    for (const k of (v ?? "").split(",")) {
      const t = k.trim().replace(/^["']|["']$/g, "");
      if (t && !out.includes(t)) out.push(t);
    }
  };
  push(process.env.GEMINI_API_KEYS);
  for (let i = 1; i <= 9; i++) push(process.env[`GEMINI_API_KEY_${i}`]);
  push(process.env.GEMINI_API_KEY);
  return out;
}

function wav(pcm: Buffer, rate = 24000): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function synth(text: string, voice: VoiceRole): Promise<Buffer> {
  const ks = keys();
  const v = VOICE_MAP[voice];
  let last = "no models";
  for (const model of MODELS) {
    for (let a = 0; a < ks.length; a++) {
      const key = ks[cursor++ % ks.length];
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${v.style} ${text}` }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: v.name } } },
            },
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (!res.ok) {
          last = `HTTP ${res.status} on ${model}`;
          if (res.status === 404 || res.status === 400) break;
          continue;
        }
        const j = (await res.json()) as any;
        const inl = j?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData;
        if (!inl?.data) {
          last = `no audio from ${model}`;
          break;
        }
        const buf = Buffer.from(inl.data, "base64");
        const mime = String(inl.mimeType ?? "").toLowerCase();
        if (mime.includes("wav") || buf.subarray(0, 4).toString() === "RIFF") return buf;
        const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
        return wav(buf, rate);
      } catch (e) {
        last = e instanceof Error ? e.message : "error";
      }
    }
  }
  throw new Error(last);
}

export async function POST(req: NextRequest) {
  let body: { text?: unknown; voice?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.replace(/\s+/g, " ").trim().slice(0, 240) : "";
  const voice = (VOICES as readonly string[]).includes(body.voice as string) ? (body.voice as VoiceRole) : "narrator";
  if (!text) return NextResponse.json({ ok: false, error: "text required" }, { status: 400 });
  if (!geminiConfigured()) return NextResponse.json({ ok: false, error: "No Gemini key configured." }, { status: 503 });

  const ck = `${voice}|${text}`;
  let buf = CACHE.get(ck);
  if (buf) {
    CACHE.delete(ck);
    CACHE.set(ck, buf); // refresh LRU position
  } else {
    try {
      buf = await synth(text, voice);
    } catch (e) {
      return NextResponse.json({ ok: false, error: `TTS failed: ${e instanceof Error ? e.message : "unknown"}` }, { status: 502 });
    }
    CACHE.set(ck, buf);
    if (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value as string);
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=3600" },
  });
}
