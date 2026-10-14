"use client";

import { useState } from "react";
import { Sliders, Shield, Database, Check, Upload, ArrowUpRight, Zap, Eye, Compass, Lock } from "lucide-react";

interface BentoGridProps {
  onOpenFromFile: (file: File) => void;
  fileError?: string | null;
}

export default function InteractiveBentoGrid({ onOpenFromFile, fileError }: BentoGridProps) {
  // Card 1: Interactive Raycast State
  const [lightRadius, setLightRadius] = useState<number>(22);
  const [cctvMode, setCctvMode] = useState<"wide" | "narrow">("wide");

  // Card 2: Patrol Shift
  const [patrolShift, setPatrolShift] = useState<"A" | "B">("A");

  // Card 4: Drag over state
  const [isDragOver, setIsDragOver] = useState(false);

  // Derived raycast calculations
  const illuminatedArea = Math.round(Math.PI * lightRadius * lightRadius * 1.8);
  const darkGapIndex = Math.max(2, Math.round(38 - lightRadius * 1.2));

  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="font-mono text-xs uppercase tracking-wider text-[#8a8272]">
            03 // CORE CAPABILITIES
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[#1d2430]">
            Engineered for rigorous civic analysis
          </h2>
        </div>
        <div className="font-mono text-xs text-[#8a8272] shrink-0">
          ASYMMETRIC ARCHITECTURE · DETERMINISTIC
        </div>
      </div>

      {/* Asymmetric Bento Grid: 2-column on md/lg, span 2 on primary features */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* =========================================================================
            BENTO CARD 1 (Span 3 / 60%): Interactive Raycast & Lighting Range Engine
           ========================================================================= */}
        <div className="md:col-span-3 rounded-xl border border-[#e3ded4] bg-white p-5 sm:p-6 flex flex-col justify-between shadow-xs">
          {/* Micro-UI: Interactive Raycast Simulator */}
          <div className="rounded-lg border border-[#e3ded4] bg-[#faf8f4] p-4 mb-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#e3ded4]/70">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#2e7d5b]" />
                <span className="font-mono text-[11px] uppercase tracking-wider text-[#1d2430] font-semibold">
                  LIVE RAYCAST TESTER
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#8a8272]">
                SIMULATED 2D ENVELOPE
              </span>
            </div>

            {/* Interactive SVG Canvas */}
            <div className="relative mt-3 h-44 w-full rounded-md border border-[#e3ded4] bg-[#161d28] overflow-hidden flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 400 180">
                <defs>
                  {/* Streetlight Radial Gradient */}
                  <radialGradient id="lampGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#fef08a" stopOpacity="0.85" />
                    <stop offset="40%" stopColor="#fef08a" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#fef08a" stopOpacity="0" />
                  </radialGradient>
                  {/* CCTV Cones */}
                  <linearGradient id="cameraCone" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2e7d5b" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#2e7d5b" stopOpacity="0.05" />
                  </linearGradient>
                </defs>

                {/* Road vector lines */}
                <line x1="0" y1="90" x2="400" y2="90" stroke="#334155" strokeWidth="24" strokeLinecap="square" />
                <line x1="0" y1="90" x2="400" y2="90" stroke="#fef08a" strokeWidth="1.5" strokeDasharray="6 8" strokeOpacity="0.5" />
                <line x1="200" y1="0" x2="200" y2="180" stroke="#334155" strokeWidth="20" strokeLinecap="square" />

                {/* Building obstacles (Occlusions) */}
                <rect x="50" y="20" width="80" height="50" rx="3" fill="#1e293b" stroke="#475569" strokeWidth="1" />
                <text x="90" y="48" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">BLDG A</text>

                <rect x="270" y="115" width="90" height="50" rx="3" fill="#1e293b" stroke="#475569" strokeWidth="1" />
                <text x="315" y="145" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">BLDG B</text>

                {/* Dynamic Streetlight Illumination Envelope */}
                <circle
                  cx="200"
                  cy="90"
                  r={lightRadius * 2.8}
                  fill="url(#lampGlow)"
                  className="transition-all duration-150"
                />
                {/* Streetlight pole center */}
                <circle cx="200" cy="90" r="4.5" fill="#fef08a" stroke="#d97706" strokeWidth="1.5" />

                {/* Dynamic CCTV Camera & Frustum */}
                <path
                  d={
                    cctvMode === "wide"
                      ? "M 130 70 L 60 160 L 220 160 Z"
                      : "M 130 70 L 90 160 L 170 160 Z"
                  }
                  fill="url(#cameraCone)"
                  stroke="#2e7d5b"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  className="transition-all duration-300"
                />
                <circle cx="130" cy="70" r="3.5" fill="#2e7d5b" stroke="#ffffff" strokeWidth="1" />
                <text x="130" y="60" fill="#2e7d5b" fontSize="7" fontFamily="monospace" textAnchor="middle">CCTV #1</text>
              </svg>

              {/* Real-time stats HUD on canvas */}
              <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-white backdrop-blur-xs">
                <span className="text-[#8a8272]">AREA:</span>
                <span className="text-[#fef08a] font-semibold">{illuminatedArea} m²</span>
              </div>

              <div className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-white backdrop-blur-xs">
                <span className="text-[#8a8272]">DARK GAP:</span>
                <span className="text-[#2e7d5b] font-semibold">{darkGapIndex}%</span>
              </div>
            </div>

            {/* Interactive Controls Bar */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                <span className="font-mono text-[11px] text-[#5c6470] shrink-0">Throw Radius:</span>
                <input
                  type="range"
                  min="12"
                  max="32"
                  value={lightRadius}
                  onChange={(e) => setLightRadius(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer accent-[#2e7d5b] bg-[#e3ded4] rounded-lg"
                />
                <span className="font-mono text-[11px] font-semibold text-[#1d2430] shrink-0 w-8 text-right">
                  {lightRadius}m
                </span>
              </div>

              <div className="flex items-center gap-1 rounded-md bg-[#e3ded4]/50 p-0.5 font-mono text-[10px]">
                <button
                  onClick={() => setCctvMode("wide")}
                  className={`px-2 py-0.5 rounded transition ${
                    cctvMode === "wide" ? "bg-white font-medium text-[#1d2430] shadow-xs" : "text-[#5c6470]"
                  }`}
                >
                  90° WIDE
                </button>
                <button
                  onClick={() => setCctvMode("narrow")}
                  className={`px-2 py-0.5 rounded transition ${
                    cctvMode === "narrow" ? "bg-white font-medium text-[#1d2430] shadow-xs" : "text-[#5c6470]"
                  }`}
                >
                  45° NARROW
                </button>
              </div>
            </div>
          </div>

          {/* Copy description */}
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#eef4f0] p-1 text-[#2e7d5b]">
                <Sliders strokeWidth={1.5} className="h-4 w-4" />
              </span>
              <h3 className="text-base font-semibold text-[#1d2430] tracking-tight">
                Line-of-Sight Coverage Engine
              </h3>
            </div>
            <p className="mt-1.5 text-xs text-[#5c6470] leading-relaxed max-w-[55ch]">
              Raycasts streetlight falloff and camera frustums directly against 3D building occlusion.
            </p>
          </div>
        </div>

        {/* =========================================================================
            BENTO CARD 2 (Span 2 / 40%): Dynamic Patrol Intercept
           ========================================================================= */}
        <div className="md:col-span-2 rounded-xl border border-[#e3ded4] bg-white p-5 sm:p-6 flex flex-col justify-between shadow-xs">
          {/* Micro-UI: Patrol Route Dispatcher */}
          <div className="rounded-lg border border-[#e3ded4] bg-[#faf8f4] p-4 mb-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#e3ded4]/70">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#2e7d5b]" />
                <span className="font-mono text-[11px] uppercase tracking-wider text-[#1d2430] font-semibold">
                  PATROL DISPATCH
                </span>
              </div>
              <div className="flex items-center gap-1 rounded bg-[#e3ded4]/60 p-0.5 font-mono text-[9px]">
                <button
                  onClick={() => setPatrolShift("A")}
                  className={`px-1.5 py-0.5 rounded ${patrolShift === "A" ? "bg-white font-bold text-[#1d2430]" : "text-[#5c6470]"}`}
                >
                  22:00
                </button>
                <button
                  onClick={() => setPatrolShift("B")}
                  className={`px-1.5 py-0.5 rounded ${patrolShift === "B" ? "bg-white font-bold text-[#1d2430]" : "text-[#5c6470]"}`}
                >
                  03:00
                </button>
              </div>
            </div>

            {/* Waypoint ticker */}
            <div className="mt-3 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between rounded border border-[#eee9df] bg-white px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#2e7d5b]" />
                  <span className="text-[#1d2430] font-medium">Waypoint 01 // Main Gate</span>
                </div>
                <span className="text-[#8a8272] text-[10px]">0.8m latency</span>
              </div>

              <div className="flex items-center justify-between rounded border border-[#eee9df] bg-white px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#2e7d5b]" />
                  <span className="text-[#1d2430] font-medium">Waypoint 02 // Park Path</span>
                </div>
                <span className="text-[#8a8272] text-[10px]">1.4m latency</span>
              </div>

              <div className="flex items-center justify-between rounded border border-[#eee9df] bg-white px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#2e7d5b]" />
                  <span className="text-[#1d2430] font-medium">Waypoint 03 // Transit Hub</span>
                </div>
                <span className="text-[#8a8272] text-[10px]">2.1m latency</span>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-[#eee9df] flex items-center justify-between font-mono text-[10px]">
              <span className="text-[#8a8272]">MEAN RESPONSE:</span>
              <span className="text-[#2e7d5b] font-bold">1.43 MIN (99.2% ON-SCHEDULE)</span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#eef4f0] p-1 text-[#2e7d5b]">
                <Shield strokeWidth={1.5} className="h-4 w-4" />
              </span>
              <h3 className="text-base font-semibold text-[#1d2430] tracking-tight">
                Patrol Intercept Modeling
              </h3>
            </div>
            <p className="mt-1.5 text-xs text-[#5c6470] leading-relaxed max-w-[55ch]">
              Evaluates guard response intervals across synthetic civilian walking corridors.
            </p>
          </div>
        </div>

        {/* =========================================================================
            BENTO CARD 3 (Span 2 / 40%): Paired Seed Verification
           ========================================================================= */}
        <div className="md:col-span-2 rounded-xl border border-[#e3ded4] bg-white p-5 sm:p-6 flex flex-col justify-between shadow-xs">
          {/* Micro-UI: Delta Metric Comparator */}
          <div className="rounded-lg border border-[#e3ded4] bg-[#faf8f4] p-4 mb-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#e3ded4]/70">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#1d2430] font-semibold">
                PAIRED RUN AUDIT
              </span>
              <span className="rounded bg-[#eef4f0] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#2e7d5b]">
                SEED #4092
              </span>
            </div>

            <div className="mt-3 divide-y divide-[#eee9df] font-mono text-xs">
              <div className="flex items-center justify-between py-2">
                <span className="text-[#5c6470]">Mean Illumination</span>
                <div className="flex items-center gap-2">
                  <span className="text-[#8a8272] line-through text-[11px]">14.2 lx</span>
                  <span className="font-bold text-[#2e7d5b]">28.6 lx</span>
                  <span className="text-[10px] text-[#2e7d5b] font-medium bg-[#eef4f0] px-1 rounded">+101%</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-[#5c6470]">Dark Gap Corridors</span>
                <div className="flex items-center gap-2">
                  <span className="text-[#8a8272] line-through text-[11px]">24</span>
                  <span className="font-bold text-[#2e7d5b]">4</span>
                  <span className="text-[10px] text-[#2e7d5b] font-medium bg-[#eef4f0] px-1 rounded">-83%</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-[#5c6470]">CCTV Line of Sight</span>
                <div className="flex items-center gap-2">
                  <span className="text-[#8a8272] line-through text-[11px]">32%</span>
                  <span className="font-bold text-[#2e7d5b]">89%</span>
                  <span className="text-[10px] text-[#2e7d5b] font-medium bg-[#eef4f0] px-1 rounded">+178%</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#eef4f0] p-1 text-[#2e7d5b]">
                <Zap strokeWidth={1.5} className="h-4 w-4" />
              </span>
              <h3 className="text-base font-semibold text-[#1d2430] tracking-tight">
                Paired Seed Verification
              </h3>
            </div>
            <p className="mt-1.5 text-xs text-[#5c6470] leading-relaxed max-w-[55ch]">
              Executes identical RNG seeds across baseline and intervention layouts to eliminate random noise.
            </p>
          </div>
        </div>

        {/* =========================================================================
            BENTO CARD 4 (Span 3 / 60%): 100% Local-First Engine
           ========================================================================= */}
        <div className="md:col-span-3 rounded-xl border border-[#e3ded4] bg-white p-5 sm:p-6 flex flex-col justify-between shadow-xs">
          {/* Micro-UI: Local Storage Inspector & Project Ingest Dropzone */}
          <div className="rounded-lg border border-[#e3ded4] bg-[#faf8f4] p-4 mb-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#e3ded4]/70">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#1d2430] font-semibold">
                SYSTEM ARCHITECTURE // CLIENT ISOLATION
              </span>
              <span className="font-mono text-[10px] text-[#2e7d5b] flex items-center gap-1 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2e7d5b]" />
                OFFLINE-FIRST
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[10px]">
              <div className="rounded border border-[#eee9df] bg-white p-2">
                <div className="text-[#8a8272]">PERSISTENCE</div>
                <div className="mt-0.5 font-bold text-[#1d2430]">IndexedDB</div>
              </div>
              <div className="rounded border border-[#eee9df] bg-white p-2">
                <div className="text-[#8a8272]">TELEMETRY</div>
                <div className="mt-0.5 font-bold text-[#2e7d5b]">0 Requests</div>
              </div>
              <div className="rounded border border-[#eee9df] bg-white p-2">
                <div className="text-[#8a8272]">EXECUTION</div>
                <div className="mt-0.5 font-bold text-[#1d2430]">Browser RAM</div>
              </div>
              <div className="rounded border border-[#eee9df] bg-white p-2">
                <div className="text-[#8a8272]">ACCOUNTS</div>
                <div className="mt-0.5 font-bold text-[#1d2430]">Zero Barrier</div>
              </div>
            </div>

            {/* Quick File Drop Target */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) onOpenFromFile(file);
              }}
              className={`mt-3 flex items-center justify-between rounded-md border-2 border-dashed px-3 py-2 text-xs transition ${
                isDragOver
                  ? "border-[#2e7d5b] bg-[#eef4f0]"
                  : "border-[#dcd6c8] bg-white hover:border-[#2e7d5b]"
              }`}
            >
              <div className="flex items-center gap-2">
                <Upload strokeWidth={1.5} className="h-4 w-4 text-[#8a8272]" />
                <span className="text-[#5c6470] text-[11px]">
                  Drop a <code className="font-mono text-[#1d2430]">.json</code> project file here to validate instantly
                </span>
              </div>
              <label className="cursor-pointer rounded bg-[#faf8f4] border border-[#e3ded4] px-2.5 py-1 font-mono text-[10px] font-medium text-[#1d2430] hover:bg-[#f1ede4]">
                Choose file
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onOpenFromFile(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            {fileError && <div className="mt-2 font-mono text-[11px] text-[#c23b3b]">{fileError}</div>}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#eef4f0] p-1 text-[#2e7d5b]">
                <Database strokeWidth={1.5} className="h-4 w-4" />
              </span>
              <h3 className="text-base font-semibold text-[#1d2430] tracking-tight">
                Zero Telemetry, Complete Sovereignty
              </h3>
            </div>
            <p className="mt-1.5 text-xs text-[#5c6470] leading-relaxed max-w-[55ch]">
              Runs entirely in browser memory. Neighborhood geometries and simulation outcomes never leave your machine.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
