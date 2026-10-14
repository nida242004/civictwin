"use client";

import { Play, Plus, MapPin } from "lucide-react";

interface BottomCTAProps {
  onOpenDemo: () => void;
  onNewBlank: () => void;
  onOpenImport: () => void;
}

export default function BottomCTA({
  onOpenDemo,
  onNewBlank,
  onOpenImport,
}: BottomCTAProps) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="relative overflow-hidden rounded-2xl border border-[#e3ded4] bg-white p-8 sm:p-14 text-center shadow-xs">
        {/* Subtle radial architectural accent background */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#eef4f0]/70 via-transparent to-transparent" />

        <div className="relative z-10 mx-auto max-w-2xl">
          <div className="font-mono text-xs uppercase tracking-wider text-[#8a8272]">
            GET STARTED INSTANTLY
          </div>

          <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-[#1d2430]">
            Ready to model your neighborhood?
          </h2>

          <p className="mt-3 text-sm text-[#5c6470] max-w-[48ch] mx-auto leading-relaxed">
            Launch our pre-configured Vasanth Nagar East demo or import your local area vector data.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onOpenDemo}
              className="flex items-center gap-2 rounded-lg bg-[#2e7d5b] px-5 py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-[#24654a]"
            >
              <Play strokeWidth={1.5} className="h-4 w-4 fill-current" />
              <span>Launch Demo Environment</span>
            </button>

            <button
              onClick={onOpenImport}
              className="flex items-center gap-2 rounded-lg border border-[#e3ded4] bg-[#faf8f4] px-4 py-2.5 text-sm font-medium text-[#1d2430] transition hover:bg-[#f1ede4] hover:border-[#1d2430]/30"
            >
              <MapPin strokeWidth={1.5} className="h-4 w-4 text-[#8a8272]" />
              <span>Import OpenStreetMap</span>
            </button>

            <button
              onClick={onNewBlank}
              className="flex items-center gap-2 rounded-lg border border-[#e3ded4] bg-white px-4 py-2.5 text-sm font-medium text-[#1d2430] transition hover:bg-[#faf8f4]"
            >
              <Plus strokeWidth={1.5} className="h-4 w-4 text-[#8a8272]" />
              <span>Blank Canvas</span>
            </button>
          </div>

          <div className="mt-6 font-mono text-[11px] text-[#8a8272]">
            100% LOCAL-FIRST · ZERO LOGIN · PRIVATE & AUDITABLE
          </div>
        </div>
      </div>
    </section>
  );
}
