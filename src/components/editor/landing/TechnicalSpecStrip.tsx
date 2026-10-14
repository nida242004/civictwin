"use client";

import { Cpu, Clock, ShieldCheck, FileCheck } from "lucide-react";

const SPECS = [
  {
    label: "ENGINE CORE",
    value: "MT19937 Seeded RNG",
    detail: "Identical seeds guarantee 100% reproducible trials",
    icon: Cpu,
  },
  {
    label: "RAYCAST RESOLUTION",
    value: "100ms Fixed Delta",
    detail: "3D line-of-sight lighting falloff and camera frustums",
    icon: Clock,
  },
  {
    label: "DATA SOVEREIGNTY",
    value: "100% Client-Side",
    detail: "IndexedDB persistent. Zero network telemetry calls",
    icon: ShieldCheck,
  },
  {
    label: "AUDIT DELIVERY",
    value: "Vector PDF + GeoJSON",
    detail: "Standardized municipal intervention documentation",
    icon: FileCheck,
  },
] as const;

export default function TechnicalSpecStrip() {
  return (
    <section className="my-14 border-y border-[#e3ded4] bg-white/60 backdrop-blur-xs">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-[#e3ded4]">
          {SPECS.map((spec, idx) => {
            const Icon = spec.icon;
            return (
              <div key={spec.label} className={idx > 0 ? "lg:pl-6" : ""}>
                <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-[#8a8272]">
                  <Icon strokeWidth={1.5} className="h-3.5 w-3.5 text-[#2e7d5b]" />
                  <span>{spec.label}</span>
                </div>
                <div className="mt-1 text-sm font-semibold tracking-tight text-[#1d2430]">
                  {spec.value}
                </div>
                <p className="mt-0.5 text-xs text-[#5c6470] leading-snug">
                  {spec.detail}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
