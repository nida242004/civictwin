"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import {
  Camera, MoonStar, Route, MapPinned, Boxes, PlayCircle, Scale,
  Leaf, Users, ShieldCheck, Accessibility, Eye, Search, AudioLines, Cloud, Zap,
} from "lucide-react";

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const wrap = "mx-auto max-w-[1200px] px-5 sm:px-8";
const eyebrow = "text-xs font-medium uppercase tracking-[0.18em] text-teal-300";
const h2 = "mt-3 text-balance text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[2.75rem] sm:leading-[1.08]";
const lead = "mt-4 max-w-[60ch] text-pretty text-base leading-relaxed text-slate-400 sm:text-lg";

function Head({ k, title, sub }: { k: string; title: string; sub?: string }) {
  return (
    <Reveal>
      <p className={eyebrow}>{k}</p>
      <h2 className={h2}>{title}</h2>
      {sub && <p className={lead}>{sub}</p>}
    </Reveal>
  );
}

export function Problem() {
  const items = [
    { icon: Camera, t: "Cameras watching empty walls", d: "RWAs spend lakhs on CCTV that points where nothing happens, while the lane people actually walk stays unseen." },
    { icon: MoonStar, t: "Guards doze at 2am", d: "A patrol plan looks fine on paper. At night it leaves long gaps nobody notices until something goes wrong." },
    { icon: Route, t: "One dark lane is all it takes", d: "A single broken streetlight turns the shortcut home into the place residents learn to avoid." },
  ];
  return (
    <section id="problem" className="flex min-h-[100svh] flex-col justify-center pt-24 pb-16">
      <div className={wrap}>
        <Head k="The problem" title="Security budgets are spent on guesses." sub="Most societies only find out their setup doesn't work after someone gets hurt." />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {items.map((it, i) => (
            <Reveal key={it.t} delay={i * 0.06} className="rounded-2xl border border-white/10 bg-[#070c19] p-7">
              <it.icon className="h-5 w-5 text-rose-300" strokeWidth={1.6} />
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-white">{it.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{it.d}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const steps = [
    { icon: MapPinned, t: "Pick your society", d: "Search or draw your area on a satellite map." },
    { icon: Boxes, t: "Get a 3D twin", d: "Gemini reads the map: roads, gates, lights, buildings." },
    { icon: PlayCircle, t: "Play a full night", d: "Synthetic residents, guards and offenders act it out." },
    { icon: Scale, t: "Compare fixes", d: "Add a camera, light or guard. See what changes, per rupee." },
  ];
  return (
    <section id="how" className="border-t border-white/[0.06] flex min-h-[100svh] flex-col justify-center pt-24 pb-16">
      <div className={wrap}>
        <Head k="How it works" title="From map to answer in minutes." />
        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <Reveal key={s.t} delay={i * 0.06}>
              <li className="list-none">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-slate-500">0{i + 1}</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
                <s.icon className="mt-6 h-6 w-6 text-teal-300" strokeWidth={1.5} />
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-white">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.d}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function MiniMap({ after }: { after: boolean }) {
  return (
    <svg viewBox="0 0 320 180" className="h-auto w-full" role="img" aria-label={after ? "After: new camera covers the lane, offender caught" : "Baseline: mugging in blind spot, offender escapes"}>
      <rect width="320" height="180" rx="12" fill="#0a1222" />
      {[[20, 20, 90, 55], [210, 20, 90, 55], [20, 110, 90, 50], [210, 110, 90, 50]].map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="4" fill="#15203a" />
      ))}
      <rect x="0" y="85" width="320" height="16" fill="#1c2945" />
      <rect x="140" y="0" width="40" height="180" fill="#1c2945" />
      {/* existing camera covering a wall */}
      <path d="M210 30 L170 10 L180 50 Z" fill="#5eead4" opacity="0.18" />
      <circle cx="210" cy="30" r="4" fill="#5eead4" />
      {/* lamp */}
      <circle cx="60" cy="93" r="22" fill="#fbbf6a" opacity="0.12" />
      <circle cx="60" cy="93" r="3" fill="#fbbf6a" />
      {after && (
        <>
          <path d="M200 100 L140 125 L150 160 Z" fill="#5eead4" opacity="0.28" />
          <circle cx="200" cy="100" r="5" fill="#5eead4" stroke="#fff" strokeWidth="1.5" />
        </>
      )}
      {/* incident */}
      <circle cx="160" cy="140" r="9" fill="none" stroke={after ? "#5eead4" : "#fb7185"} strokeWidth="2" />
      <circle cx="160" cy="140" r="3" fill={after ? "#5eead4" : "#fb7185"} />
      {after ? (
        <path d="M160 140 L160 150" stroke="#5eead4" strokeWidth="2" />
      ) : (
        <path d="M160 140 Q170 165 160 178" fill="none" stroke="#fb7185" strokeWidth="2" strokeDasharray="4 4" />
      )}
    </svg>
  );
}

export function SameNight() {
  return (
    <section id="compare" className="border-t border-white/[0.06] flex min-h-[100svh] flex-col justify-center pt-24 pb-16">
      <div className={wrap}>
        <Head k="Same night, one change" title="Replay the exact same night. Change one thing." sub="Every run uses the same seed, so the only difference is your decision. That's how you know it worked." />
        <Reveal className="mt-12 overflow-hidden rounded-2xl border border-white/10 bg-[#070c19]">
          <div className="grid md:grid-cols-2">
            {[false, true].map((after) => (
              <div key={String(after)} className={`p-6 sm:p-8 ${after ? "border-t border-white/10 md:border-l md:border-t-0" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-300">{after ? "After · +1 camera (₹26k)" : "Baseline"}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${after ? "bg-teal-400/10 text-teal-300" : "bg-rose-400/10 text-rose-300"}`}>
                    {after ? "Caught on CCTV" : "Escaped"}
                  </span>
                </div>
                <div className="mt-5"><MiniMap after={after} /></div>
                <p className="mt-5 text-sm leading-relaxed text-slate-400">
                  {after
                    ? "02:14 · Same offender, same lane. The new camera covers the blind spot, the guard is alerted, the offender is identified."
                    : "02:14 · A resident walking home is mugged in the lane no camera sees. The offender leaves unseen."}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function SocialImpact() {
  const items = [
    { icon: Scale, t: "Better allocation", d: "Fund the camera, light or patrol that measurably helps, not the one with the best sales pitch." },
    { icon: Leaf, t: "Resource efficiency", d: "Fewer redundant cameras and always-on floodlights. Less hardware, less power, less waste." },
    { icon: Users, t: "Community resilience", d: "RWAs, residents and local police plan together from one shared, explainable picture." },
    { icon: Accessibility, t: "Accessible", d: "Free, runs in a browser, no special hardware. Spoken summaries for residents who don't read reports." },
  ];
  return (
    <section id="impact" className="border-t border-white/[0.06] flex min-h-[100svh] flex-col justify-center pt-24 pb-16">
      <div className={wrap}>
        <Head k="Sustainability & Social Impact" title="Safer neighbourhoods without wasting money." sub="Built for the Sustainability & Social Impact track of the Google Cloud AI Builder Cup 2026." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {items.map((it, i) => (
            <Reveal key={it.t} delay={i * 0.05} className="rounded-2xl border border-white/10 bg-white/[0.02] p-7">
              <it.icon className="h-5 w-5 text-teal-300" strokeWidth={1.6} />
              <h3 className="mt-5 text-lg font-semibold tracking-tight text-white">{it.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{it.d}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BuiltWith() {
  const items = [
    { icon: Eye, t: "Gemini vision", d: "Reads satellite imagery into roads, gates and buildings." },
    { icon: Search, t: "Search grounding", d: "Gemini + Google Search for real local prices and context." },
    { icon: AudioLines, t: "Gemini TTS", d: "Narrates the night and the results aloud." },
    { icon: Cloud, t: "Cloud Run", d: "Serverless backend, scales to zero between runs." },
    { icon: Zap, t: "TypeSafe Jev", d: "TypeSafe Jev for instant agent judgments — how actors behave, quick picks in under a second." },
  ];
  return (
    <section id="tech" className="border-t border-white/[0.06] flex min-h-[100svh] flex-col justify-center pt-24 pb-16">
      <div className={wrap}>
        <Head k="Built with Gemini on Google Cloud" title="AI where it helps. Simulation where it counts." />
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {items.map((it, i) => (
            <Reveal key={it.t} delay={i * 0.05}>
              <it.icon className="h-5 w-5 text-slate-300" strokeWidth={1.6} />
              <h3 className="mt-4 font-semibold tracking-tight text-white">{it.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{it.d}</p>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-12 flex gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm leading-relaxed text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" strokeWidth={1.6} />
          <p>
            <span className="font-medium text-slate-200">Responsible by design.</span> Every agent is synthetic. No faces, no real
            people, no profiling. Results are estimates to support a community decision, not a prediction about any individual.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
