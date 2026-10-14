"use client";

/**
 * Praesidium — Bespoke Urban Digital Twin & Safety Simulation
 * High-craft landing page & onboarding interface.
 */

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  Play,
  Plus,
  MapPin,
  FolderOpen,
  Shield,
  Layers,
  ArrowRight,
  Sparkles,
} from "lucide-react";

import { useEditor } from "@/lib/store/editor";
import { listSavedProjects, loadProject } from "@/lib/storage/projects";
import { parseProject } from "@/lib/world/serialize";
import type { PraesidiumProject } from "@/lib/world/types";
import ImportDialog from "./ImportDialog";

// Bespoke landing components
import HeroShowcase from "./landing/HeroShowcase";
import TechnicalSpecStrip from "./landing/TechnicalSpecStrip";
import PipelineWalkthrough from "./landing/PipelineWalkthrough";
import InteractiveBentoGrid from "./landing/InteractiveBentoGrid";
import RecentProjectsStrip from "./landing/RecentProjectsStrip";
import BottomCTA from "./landing/BottomCTA";

// Subtle Linear/Vercel motion configuration (10px reveal, crisp bezier curve, no bouncy spring)
const revealVariant = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      delay: i * 0.08,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
};

export default function WelcomeScreen() {
  const openDemo = useEditor((s) => s.openDemo);
  const newBlank = useEditor((s) => s.newBlank);
  const openProject = useEditor((s) => s.openProject);
  const setImportOpen = useEditor((s) => s.setImportOpen);

  const [recent, setRecent] = useState<
    { projectId: string; name: string; modifiedAt: string }[]
  >([]);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    listSavedProjects()
      .then((r) =>
        setRecent(
          r
            .slice(0, 6)
            .map((x) => ({
              projectId: x.projectId,
              name: x.name,
              modifiedAt: x.modifiedAt,
            }))
        )
      )
      .catch(() => setRecent([]));
  }, []);

  const openFromFile = useCallback(
    async (file: File) => {
      setFileError(null);
      try {
        const text = await file.text();
        const parsed = parseProject(JSON.parse(text));
        if (!parsed.ok || !parsed.project) {
          setFileError(
            parsed.error ?? "The file could not be parsed as a Praesidium project."
          );
          return;
        }
        openProject(parsed.project as PraesidiumProject);
      } catch {
        setFileError("Invalid project file format (valid JSON required).");
      }
    },
    [openProject]
  );

  // Global keyboard shortcuts (Linear style): D for Demo, B for Blank, I for Import
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.metaKey ||
        e.ctrlKey
      ) {
        return;
      }
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        openDemo();
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        newBlank();
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        setImportOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openDemo, newBlank, setImportOpen]);

  const handleOpenProject = async (id: string) => {
    const proj = await loadProject(id);
    if (proj) openProject(proj);
  };

  return (
    <div className="relative min-h-screen bg-[#f7f5f1] text-[#1d2430] antialiased selection:bg-[#2e7d5b]/15 selection:text-[#1d2430]">
      {/* Background Atmosphere: Subtle architectural hairline grid with radial mask */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-40"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #1d2430 1px, transparent 0)`,
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse at 50% 20%, black 50%, transparent 90%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at 50% 20%, black 50%, transparent 90%)",
        }}
      />

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-[#e3ded4] bg-[#f7f5f1]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          {/* Brand & Version Identifier */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1d2430] shadow-xs">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#e8c34a"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2 L20 6 V12 C20 17 16.5 20.5 12 22 C7.5 20.5 4 17 4 12 V6 Z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-[#1d2430]">
                  Praesidium
                </span>
                <span className="rounded bg-[#faf8f4] border border-[#e3ded4] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#8a8272]">
                  v0.2.1
                </span>
              </div>
              <div className="hidden text-[11px] text-[#8a8272] sm:block">
                Neighborhood Safety Digital Twin
              </div>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-1.5 font-mono text-[11px] text-[#8a8272] md:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2e7d5b]" />
              <span>100% LOCAL-FIRST</span>
            </div>

            <div className="hidden h-4 w-px bg-[#e3ded4] md:block" />

            <button
              onClick={() => setImportOpen(true)}
              className="hidden sm:flex items-center gap-1.5 rounded-md border border-[#e3ded4] bg-white px-3 py-1.5 text-xs font-medium text-[#1d2430] transition hover:bg-[#faf8f4] hover:border-[#1d2430]/30"
            >
              <MapPin strokeWidth={1.5} className="h-3.5 w-3.5 text-[#8a8272]" />
              <span>Import Area</span>
            </button>

            <button
              onClick={openDemo}
              className="flex items-center gap-1.5 rounded-md bg-[#2e7d5b] px-3.5 py-1.5 text-xs font-medium text-white shadow-xs transition hover:bg-[#24654a]"
            >
              <Play strokeWidth={1.5} className="h-3.5 w-3.5 fill-current" />
              <span>Open Demo</span>
              <span className="hidden font-mono text-[10px] text-white/70 sm:inline">
                [D]
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 mx-auto max-w-6xl pb-20">
        {/* =========================================================================
            SECTION 1: HERO (Above the fold)
           ========================================================================= */}
        <section className="px-6 pt-12 sm:pt-16 text-center">
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={revealVariant}
            className="flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-wider text-[#8a8272]"
          >
            <span>01 // URBAN SAFETY SIMULATION</span>
          </motion.div>

          <motion.h1
            custom={1}
            initial="hidden"
            animate="visible"
            variants={revealVariant}
            className="mx-auto mt-4 max-w-4xl text-4xl sm:text-6xl font-bold tracking-tight text-[#1d2430] leading-[1.08]"
          >
            Deterministic Nighttime Simulation for Safer Neighborhoods
          </motion.h1>

          <motion.p
            custom={2}
            initial="hidden"
            animate="visible"
            variants={revealVariant}
            className="mx-auto mt-4 max-w-2xl text-base sm:text-lg text-[#5c6470] leading-relaxed"
          >
            Model lighting, CCTV, and patrols in browser. Run reproducible night trials with zero telemetry or accounts.
          </motion.p>

          {/* Primary Action Row */}
          <motion.div
            custom={3}
            initial="hidden"
            animate="visible"
            variants={revealVariant}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <button
              onClick={openDemo}
              className="group flex items-center gap-2 rounded-lg bg-[#2e7d5b] px-5 py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-[#24654a]"
            >
              <Play strokeWidth={1.5} className="h-4 w-4 fill-current" />
              <span>Launch Demo Neighborhood</span>
              <span className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px] text-white">
                D
              </span>
            </button>

            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-[#e3ded4] bg-white px-4 py-2.5 text-sm font-medium text-[#1d2430] shadow-xs transition hover:bg-[#faf8f4] hover:border-[#1d2430]/30"
            >
              <MapPin strokeWidth={1.5} className="h-4 w-4 text-[#8a8272]" />
              <span>Import OpenStreetMap</span>
              <span className="rounded bg-[#f1ede4] px-1.5 py-0.5 font-mono text-[10px] text-[#8a8272]">
                I
              </span>
            </button>

            <button
              onClick={newBlank}
              className="flex items-center gap-2 rounded-lg border border-[#e3ded4] bg-white px-4 py-2.5 text-sm font-medium text-[#1d2430] shadow-xs transition hover:bg-[#faf8f4]"
            >
              <Plus strokeWidth={1.5} className="h-4 w-4 text-[#8a8272]" />
              <span>Blank Canvas</span>
              <span className="rounded bg-[#f1ede4] px-1.5 py-0.5 font-mono text-[10px] text-[#8a8272]">
                B
              </span>
            </button>
          </motion.div>

          <motion.div
            custom={4}
            initial="hidden"
            animate="visible"
            variants={revealVariant}
            className="mt-4 font-mono text-[11px] text-[#8a8272]"
          >
            // SYNTHETIC BEHAVIOR MODEL · NO REAL PERSON PROFILING · INDIA-FIRST DEFAULTS
          </motion.div>

          {/* Framed Application Showcase */}
          <motion.div
            custom={5}
            initial="hidden"
            animate="visible"
            variants={revealVariant}
          >
            <HeroShowcase onLaunchDemo={openDemo} />
          </motion.div>
        </section>

        {/* =========================================================================
            SECTION 2: TECHNICAL CREDIBILITY STRIP
           ========================================================================= */}
        <TechnicalSpecStrip />

        {/* =========================================================================
            SECTION 3: 3-STEP PIPELINE WALKTHROUGH
           ========================================================================= */}
        <PipelineWalkthrough />

        {/* =========================================================================
            SECTION 4: ASYMMETRIC BENTO GRID (Core Capabilities & Micro-UI)
           ========================================================================= */}
        <InteractiveBentoGrid
          onOpenFromFile={openFromFile}
          fileError={fileError}
        />

        {/* =========================================================================
            SECTION 5: SAVED PROJECTS ON LOCAL DEVICE
           ========================================================================= */}
        <RecentProjectsStrip
          recent={recent}
          onOpenProject={handleOpenProject}
          onNewBlank={newBlank}
        />

        {/* =========================================================================
            SECTION 6: HIGH-CONTRAST BOTTOM CTA
           ========================================================================= */}
        <BottomCTA
          onOpenDemo={openDemo}
          onNewBlank={newBlank}
          onOpenImport={() => setImportOpen(true)}
        />
      </main>

      {/* Bespoke Footer */}
      <footer className="border-t border-[#e3ded4] bg-white/70 py-6 text-xs text-[#8a8272]">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between px-6 gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#1d2430]">Praesidium</span>
            <span>—</span>
            <span>Synthetic safety modeling for community planning.</span>
          </div>
          <div className="font-mono text-[11px]">
            Deterministic Client-Side Simulation · No Real-World Crime Profiling
          </div>
        </div>
      </footer>

      {/* OpenStreetMap Import Dialog */}
      <ImportDialog />
    </div>
  );
}
