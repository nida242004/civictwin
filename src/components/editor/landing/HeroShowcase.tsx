"use client";

import { useState } from "react";
import Image from "next/image";
import { Play, Pause, RotateCcw, Maximize2, Shield, Eye, FileText, BarChart3, Layers } from "lucide-react";

interface HeroShowcaseProps {
  onLaunchDemo: () => void;
}

const TABS = [
  {
    id: "night",
    label: "Night Digital Twin",
    icon: Layers,
    src: "/showcase/night-twin.png",
    metric: "14 Agents Active",
    metricSub: "Raycast Lighting Enabled",
  },
  {
    id: "heatmap",
    label: "Coverage Heatmap",
    icon: Eye,
    src: "/showcase/coverage-heatmap.png",
    metric: "88.4% Illumination",
    metricSub: "6 CCTV Cones Mapped",
  },
  {
    id: "compare",
    label: "Intervention Delta",
    icon: BarChart3,
    src: "/showcase/compare-metrics.png",
    metric: "+48% Lux Efficiency",
    metricSub: "Baseline vs Intervention",
  },
  {
    id: "report",
    label: "Audit PDF Report",
    icon: FileText,
    src: "/showcase/report-preview.png",
    metric: "Vector PDF Ready",
    metricSub: "Formal Municipal Audit",
  },
] as const;

export default function HeroShowcase({ onLaunchDemo }: HeroShowcaseProps) {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("night");
  const [isPlaying, setIsPlaying] = useState(true);

  const current = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  return (
    <div className="relative mt-8 w-full max-w-5xl mx-auto">
      {/* Exterior bezel frame */}
      <div className="rounded-2xl border border-[#e3ded4] bg-white/70 p-2 sm:p-3 shadow-sm backdrop-blur-md">
        {/* Inner application viewport */}
        <div className="relative overflow-hidden rounded-xl border border-[#e3ded4] bg-[#1d2430]">
          {/* Top application chrome / tab strip */}
          <div className="flex flex-wrap items-center justify-between border-b border-[#2d3748] bg-[#161d28] px-3 py-2 text-xs text-[#94a3b8] gap-2">
            {/* Left window indicators & identity */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#334155]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#334155]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#334155]" />
              </div>
              <div className="hidden items-center gap-1.5 font-mono text-[11px] text-[#64748b] sm:flex">
                <span>praesidium-twin://vasanth-nagar-east</span>
              </div>
            </div>

            {/* View tabs */}
            <div className="flex items-center gap-1 rounded-lg bg-[#0f151f] p-0.5">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                      isActive
                        ? "bg-[#1d2430] text-[#f7f5f1] shadow-xs"
                        : "text-[#94a3b8] hover:text-[#f7f5f1]"
                    }`}
                  >
                    <Icon strokeWidth={1.5} className={`h-3 w-3 ${isActive ? "text-[#2e7d5b]" : ""}`} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Engine status indicator */}
            <div className="flex items-center gap-2 font-mono text-[10px] text-[#94a3b8]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#2e7d5b] animate-pulse" />
              <span className="hidden md:inline">60 FPS · 100MS DELTA</span>
            </div>
          </div>

          {/* Visual Showcase Surface */}
          <div className="group relative aspect-16/10 sm:aspect-16/9 w-full bg-[#0d131b] overflow-hidden">
            <Image
              src={current.src}
              alt={current.label}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 1024px"
              className="object-cover object-top transition duration-500 group-hover:scale-[1.01]"
            />

            {/* Subtle architectural vignette overlay */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0f151f]/60 via-transparent to-transparent" />

            {/* Live Scrubber & Status Overlay Bar */}
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0f151f]/85 px-3 py-2 text-xs text-white backdrop-blur-md">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 text-white transition hover:bg-white/20"
                  title={isPlaying ? "Pause simulation" : "Play simulation"}
                >
                  {isPlaying ? (
                    <Pause strokeWidth={1.5} className="h-3.5 w-3.5" />
                  ) : (
                    <Play strokeWidth={1.5} className="h-3.5 w-3.5 fill-current" />
                  )}
                </button>
                <div className="font-mono text-[11px] text-[#94a3b8]">
                  <span className="text-white font-semibold">23:42:15</span>
                  <span className="hidden sm:inline text-white/40"> / 05:00:00</span>
                </div>
                <div className="hidden h-3 w-px bg-white/10 sm:block" />
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#94a3b8]">
                  <span className="text-[#f7f5f1] font-medium">{current.metric}</span>
                  <span className="hidden md:inline text-white/40">·</span>
                  <span className="hidden md:inline text-white/60">{current.metricSub}</span>
                </div>
              </div>

              {/* Direct Workspace Launcher button */}
              <button
                onClick={onLaunchDemo}
                className="flex items-center gap-1.5 rounded-md bg-[#2e7d5b] px-3 py-1 text-[11px] font-medium text-white transition hover:bg-[#24654a]"
              >
                <span>Open Live Workspace</span>
                <span className="font-mono text-[10px] text-white/70">→</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
