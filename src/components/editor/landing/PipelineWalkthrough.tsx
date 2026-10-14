"use client";

import { Map, Cpu, FileSpreadsheet } from "lucide-react";

const STEPS = [
  {
    step: "01",
    tag: "GEOMETRY INGESTION",
    title: "Import or draft urban vectors",
    body: "Fetch road networks and buildings via OpenStreetMap or draft custom road grids and facility footprints on canvas.",
    metric: "OSM Vector Overpass API",
    icon: Map,
  },
  {
    step: "02",
    tag: "SIMULATION ENGINE",
    title: "Execute deterministic nighttime run",
    body: "Simulate low-light civilian paths against raycast streetlights, camera line-of-sight frustums, and guard patrol intervals.",
    metric: "100ms Fixed Timestep",
    icon: Cpu,
  },
  {
    step: "03",
    tag: "INTERVENTION AUDIT",
    title: "Verify delta and export reports",
    body: "Compare baseline vs intervention outcomes using identical seeds. Quantify coverage gains and compile signed PDF briefs.",
    metric: "Automated PDF Generation",
    icon: FileSpreadsheet,
  },
] as const;

export default function PipelineWalkthrough() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="font-mono text-xs uppercase tracking-wider text-[#8a8272]">
            02 // WORKFLOW ARCHITECTURE
          </div>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[#1d2430]">
            Three steps from vector map to verified intervention
          </h2>
        </div>
        <div className="font-mono text-xs text-[#8a8272] shrink-0">
          END-TO-END PIPELINE · CLIENT RUNTIME
        </div>
      </div>

      {/* 3-Step Border Grid */}
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-[#e3ded4] bg-white divide-y lg:grid-cols-3 lg:divide-y-0 lg:divide-x divide-[#e3ded4] shadow-xs">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.step} className="p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[#2e7d5b]">
                    {s.step}
                  </span>
                  <span className="rounded bg-[#faf8f4] border border-[#e3ded4] px-2 py-0.5 font-mono text-[10px] uppercase text-[#8a8272]">
                    {s.tag}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef4f0] text-[#2e7d5b]">
                    <Icon strokeWidth={1.5} className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-semibold text-[#1d2430] tracking-tight">
                    {s.title}
                  </h3>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#5c6470] max-w-[45ch]">
                  {s.body}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-[#eee9df] flex items-center justify-between font-mono text-[11px] text-[#8a8272]">
                <span>Status: Active</span>
                <span className="text-[#1d2430] font-medium">{s.metric}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
