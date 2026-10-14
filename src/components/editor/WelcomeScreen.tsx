"use client";

/**
 * Praesidium welcome / onboarding screen.
 * Never a blank canvas: demo, blank, import, or a saved project.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/lib/store/editor";
import { listSavedProjects, loadProject } from "@/lib/storage/projects";
import { parseProject } from "@/lib/world/serialize";
import type { PraesidiumProject } from "@/lib/world/types";
import ImportDialog from "./ImportDialog";

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-[#e3ded4] bg-white p-4">
      <div className="text-sm font-semibold text-[#1d2430]">{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-[#5c6470]">{body}</p>
    </div>
  );
}

export default function WelcomeScreen() {
  const openDemo = useEditor((s) => s.openDemo);
  const newBlank = useEditor((s) => s.newBlank);
  const openProject = useEditor((s) => s.openProject);
  const setImportOpen = useEditor((s) => s.setImportOpen);
  const [recent, setRecent] = useState<{ projectId: string; name: string; modifiedAt: string }[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    listSavedProjects()
      .then((r) => setRecent(r.slice(0, 5).map((x) => ({ projectId: x.projectId, name: x.name, modifiedAt: x.modifiedAt }))))
      .catch(() => setRecent([]));
  }, []);

  const openFromFile = async (file: File) => {
    setFileError(null);
    try {
      const text = await file.text();
      const parsed = parseProject(JSON.parse(text));
      if (!parsed.ok || !parsed.project) {
        setFileError(parsed.error ?? "The file could not be read as a Praesidium project.");
        return;
      }
      openProject(parsed.project as PraesidiumProject);
    } catch {
      setFileError("That file is not valid JSON.");
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f5f1] text-[#1d2430]">
      {/* header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <Logo />
          <div>
            <div className="text-lg font-bold tracking-tight">Praesidium</div>
            <div className="text-[11px] text-[#8a8272]">Neighborhood safety simulation & planning</div>
          </div>
        </div>
        <div className="hidden text-xs text-[#8a8272] sm:block">Local-first · No account needed · India-first defaults</div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16">
        {/* hero */}
        <section className="py-10 text-center sm:py-14">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#dcd6c8] bg-white px-3 py-1 text-[11px] text-[#5c6470]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#2e7d5b]" />
            Deterministic nighttime simulation · Modeled coverage · Evidence-based planning support
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-[#1d2430] sm:text-5xl">
            Plan safer nights for your neighborhood
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[#5c6470]">
            Build or import a neighborhood, add street lighting, CCTV and patrol routes, then run a
            reproducible nighttime simulation. Compare a baseline against interventions, inspect
            modeled coverage gaps, and export a professional report. Everything runs in your browser.
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-xs italic text-[#8a8272]">
            Praesidium models fictional scenarios with synthetic agents. It does not predict actual
            crime and never profiles real people.
          </p>
        </section>

        {/* start options */}
        <section className="grid gap-4 sm:grid-cols-3">
          <button
            onClick={openDemo}
            className="group rounded-xl border border-[#e3ded4] bg-white p-5 text-left shadow-sm transition hover:border-[#2e7d5b] hover:shadow-md"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef4f0] text-[#2e7d5b]">▶</div>
            <div className="mt-3 font-semibold">Explore the demo neighborhood</div>
            <p className="mt-1 text-sm leading-relaxed text-[#5c6470]">
              Vasanth Nagar East — a ready-made fictional neighborhood with roads, buildings, a park,
              bus stop, lighting, cameras and patrols. Best first step.
            </p>
            <span className="mt-3 inline-block text-xs font-medium text-[#2e7d5b] group-hover:underline">Open demo →</span>
          </button>

          <button
            onClick={newBlank}
            className="group rounded-xl border border-[#e3ded4] bg-white p-5 text-left shadow-sm transition hover:border-[#2e7d5b] hover:shadow-md"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef4f0] text-[#2e7d5b]">✚</div>
            <div className="mt-3 font-semibold">Build from scratch</div>
            <p className="mt-1 text-sm leading-relaxed text-[#5c6470]">
              Start with an empty canvas and draw roads and paths, place buildings and facilities,
              then add your own safety infrastructure.
            </p>
            <span className="mt-3 inline-block text-xs font-medium text-[#2e7d5b] group-hover:underline">Start building →</span>
          </button>

          <button
            onClick={() => setImportOpen(true)}
            className="group rounded-xl border border-[#e3ded4] bg-white p-5 text-left shadow-sm transition hover:border-[#2e7d5b] hover:shadow-md"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef4f0] text-[#2e7d5b]">⌖</div>
            <div className="mt-3 font-semibold">Import a real location</div>
            <p className="mt-1 text-sm leading-relaxed text-[#5c6470]">
              Search for a place and import mapped roads, paths, buildings and open spaces from
              OpenStreetMap. Needs network access; falls back gracefully.
            </p>
            <span className="mt-3 inline-block text-xs font-medium text-[#2e7d5b] group-hover:underline">Import area →</span>
          </button>
        </section>

        {/* open project file / recent */}
        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[#e3ded4] bg-white p-5">
            <div className="text-sm font-semibold">Open a project file</div>
            <p className="mt-1 text-xs text-[#5c6470]">Load a previously exported .json project. It is validated before opening.</p>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border border-[#dcd6c8] bg-[#faf8f4] px-3 py-2 text-xs font-medium hover:bg-[#f1ede4]">
              Choose file…
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void openFromFile(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {fileError && <div className="mt-2 text-xs text-[#c23b3b]">{fileError}</div>}
          </div>

          <div className="rounded-xl border border-[#e3ded4] bg-white p-5">
            <div className="text-sm font-semibold">Recent projects on this device</div>
            <p className="mt-1 text-xs text-[#5c6470]">
              Saved in your browser via IndexedDB. Projects are local to this device and browser.
            </p>
            <div className="mt-3 space-y-1.5">
              {recent.length === 0 && <div className="text-xs text-[#8a8272]">No saved projects yet.</div>}
              {recent.map((r) => (
                <button
                  key={r.projectId}
                  onClick={async () => {
                    const p = await loadProject(r.projectId);
                    if (p) openProject(p);
                  }}
                  className="flex w-full items-center justify-between rounded-md border border-[#eee9df] px-3 py-2 text-left text-xs hover:border-[#2e7d5b]"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="text-[#8a8272]">{new Date(r.modifiedAt).toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* feature strip */}
        <section className="mt-10 grid gap-3 sm:grid-cols-3">
          <Feature title="Deterministic engine" body="A seeded, fixed-timestep simulation: identical runs from identical setups. Reproducible, auditable, honest." />
          <Feature title="Modeled coverage analytics" body="Lighting and CCTV coverage, reachability, patrol and response metrics — all computed from your geometry, never hardcoded." />
          <Feature title="Compare & report" body="Preserve a baseline, run an intervention with the same seed, compare outcomes, and export a branded PDF report." />
        </section>
      </main>

      <footer className="border-t border-[#e3ded4] bg-white/60 py-4">
        <div className="mx-auto max-w-6xl px-6 text-center text-[11px] text-[#8a8272]">
          Praesidium is a planning-support simulation for community safety exercises. Simulated
          outcomes are simplified models, not predictions of actual crime or guarantees of safety.
        </div>
      </footer>
      <ImportDialog />
    </div>
  );
}

function Logo() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1d2430] text-[#e8c34a]">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2 L20 6 V12 C20 17 16.5 20.5 12 22 C7.5 20.5 4 17 4 12 V6 Z" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
