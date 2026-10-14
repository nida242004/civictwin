"use client";

/**
 * "Pick your society on a satellite map → AI builds the 3D twin".
 * Search → adjust the rectangle on the satellite map → pipeline:
 *   OSM features (bbox-centered) ∥ satellite capture → Gemini vision layout → open editor.
 * Degrades gracefully: Gemini failure → OSM-only; OSM failure → Gemini-only.
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/lib/store/editor";
import type { PraesidiumProject, ProjectGeo, World } from "@/lib/world/types";
import { defaultScenario } from "@/lib/world/types";
import { makeId } from "@/lib/world/ids";
import type { Bbox, MapProvider } from "./MapPicker";
import { proceduralSociety } from "@/lib/geo/procedural";
import { prepareImportedWorld } from "@/lib/geo/siteSetup";
import { parseProject } from "@/lib/world/serialize";

const SAMPLE_URL = "/samples/prestige-shantiniketan.json";

const MapPicker = dynamic(() => import("./MapPicker"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center rounded-md bg-[#2a2f36] text-xs text-[#c9c3b6]">Loading satellite map…</div>,
});

interface SearchResult {
  displayName: string;
  lat: number;
  lon: number;
  boundingbox: [number, number, number, number];
}

type StepState = "pending" | "active" | "done" | "skipped" | "failed";
const STEPS = ["Fetching map data", "Capturing satellite", "Gemini analysing layout", "Building 3D twin"] as const;

interface BuildResult {
  world: World;
  geo: ProjectGeo;
  name: string;
  attribution: string;
  notes: string[];
  added: Record<string, number> | null;
  model: string | null;
}

const MIN_SPAN = 80;
const MAX_SPAN = 1200;

function spanM(b: Bbox) {
  const lat0 = (b[0] + b[1]) / 2;
  return { w: (b[3] - b[2]) * Math.cos((lat0 * Math.PI) / 180) * 111320, d: (b[1] - b[0]) * 111320 };
}

/** Fit a geocoder bbox into a society-sized (~150–600 m) rectangle. */
function societyBox(r: SearchResult): Bbox {
  const [s, n, w, e] = r.boundingbox;
  const lat = (s + n) / 2 || r.lat;
  const lon = (w + e) / 2 || r.lon;
  const sp = spanM([s, n, w, e]);
  const half = (m: number) => Math.max(200, Math.min(600, m * 1.15)) / 2;
  const hl = half(sp.d) / 111320;
  const hw = half(sp.w) / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat - hl, lat + hl, lon - hw, lon + hw];
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.data;
}

export default function ImportDialog() {
  const open = useEditor((s) => s.importOpen);
  const setOpen = useEditor((s) => s.setImportOpen);
  const openProject = useEditor((s) => s.openProject);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [placeName, setPlaceName] = useState("");
  const [focus, setFocus] = useState<{ lat: number; lng: number; bbox: Bbox; seq: number } | null>(null);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [provider, setProvider] = useState<MapProvider | null>(null);

  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepState[]>(STEPS.map(() => "pending"));
  const [stepNotes, setStepNotes] = useState<string[]>(STEPS.map(() => ""));
  const [satImage, setSatImage] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [societyType, setSocietyType] = useState<string | null>(null);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const reset = () => {
    setQuery("");
    setSearchError(null);
    setResults([]);
    setPlaceName("");
    setFocus(null);
    setBbox(null);
    resetRun();
  };
  const resetRun = () => {
    setRunning(false);
    setSteps(STEPS.map(() => "pending"));
    setStepNotes(STEPS.map(() => ""));
    setSatImage(null);
    setDescription(null);
    setSocietyType(null);
    setResult(null);
    setFatal(null);
  };

  const search = async () => {
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const data = await postJson("/api/geo/search", { query });
      setResults(data.results ?? []);
      if (!data.results?.length) setSearchError("No places matched. Try the society name with its city, or a nearby landmark.");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed — the location service may be unreachable.");
    } finally {
      setSearching(false);
    }
  };

  const pick = (r: SearchResult) => {
    const b = societyBox(r);
    setPlaceName(r.displayName.split(",")[0]);
    setResults([]);
    setBbox(b);
    setFocus({ lat: r.lat, lng: r.lon, bbox: b, seq: Date.now() });
  };

  const span = bbox ? spanM(bbox) : null;
  const spanOk = span ? span.w >= MIN_SPAN && span.d >= MIN_SPAN && span.w <= MAX_SPAN && span.d <= MAX_SPAN : false;

  const build = async () => {
    if (!bbox || !spanOk) return;
    resetRun();
    setRunning(true);
    const set = (i: number, st: StepState, note = "") => {
      setSteps((p) => p.map((v, k) => (k === i ? st : v)));
      if (note) setStepNotes((p) => p.map((v, k) => (k === i ? note : v)));
    };
    const [south, north, west, east] = bbox;
    const sp = spanM(bbox);
    const notes: string[] = [];
    set(0, "active");
    set(1, "active");

    const osmP = postJson("/api/geo/import", { south, north, west, east, name: placeName, fixToBbox: true })
      .then((d) => {
        set(0, "done", `${d.stats.buildings} buildings · ${d.stats.roads} roads · ${d.stats.facilities} facilities`);
        return d as { world: World; notes: string[]; attribution: string };
      })
      .catch((err: Error) => {
        set(0, "failed", "OpenStreetMap unavailable — continuing with satellite only");
        notes.push(`OpenStreetMap fetch failed (${err.message}); the layout is AI-inferred only.`);
        return null;
      });
    const satP = postJson("/api/geo/satellite", { south, north, west, east })
      .then((d) => {
        setSatImage(d.image);
        set(1, "done", `${d.width}×${d.height}px · ${d.provider === "google" ? "Google" : "Esri"} z${d.zoom}`);
        return d as { image: string; attribution: string; provider: string };
      })
      .catch((err: Error) => {
        set(1, "failed", err.message);
        return null;
      });
    const [osm, sat] = await Promise.all([osmP, satP]);

    const baseWorld: World = osm?.world ?? {
      bounds: { width: sp.w, depth: sp.d },
      roads: [],
      buildings: [],
      facilities: [],
      streetlights: [],
      cameras: [],
      guards: [],
    };
    if (osm) notes.push(...osm.notes);

    let world = baseWorld;
    let added: Record<string, number> | null = null;
    let model: string | null = null;
    let sType: string | undefined;
    let summary: string | undefined;
    if (sat) {
      set(2, "active");
      try {
        const v = await postJson("/api/ai/vision-layout", { image: sat.image, bounds: baseWorld.bounds, world: osm?.world ?? null, placeName });
        world = v.world;
        added = v.added;
        model = v.model;
        sType = v.societyType;
        summary = v.description;
        setSocietyType(v.societyType);
        setDescription(v.description);
        set(2, "done", `+${v.added.buildings} buildings · ${v.added.gates} gates · ${v.added.walls ? "boundary wall" : "no wall"} · ${v.added.areas} zones (${v.model})`);
        notes.push("Walls, gates, dark zones and extra buildings were inferred by Gemini from satellite imagery — verify them on the ground.");
      } catch (err) {
        set(2, "failed", "Gemini unavailable — importing map data only");
        notes.push(`Gemini layout analysis failed (${err instanceof Error ? err.message : "error"}).`);
      }
    } else {
      set(2, "skipped", "No satellite image to analyse");
    }

    set(3, "active");
    if (!world.roads.length && !world.buildings.length && !world.site?.walls.length) {
      // never dead-end: estimated layout aligned to the bbox (and the satellite ground)
      world = proceduralSociety(baseWorld.bounds, bbox);
      sType = sType ?? "estimated";
      notes.push("Neither OpenStreetMap nor Gemini returned geometry, so an ESTIMATED grid layout (buildings, perimeter wall, main gate) was generated. Edit it to match the satellite ground.");
    }
    // simulation-ready: connected walk network + inferred baseline (guards, gate cameras, lights)
    const prepared = prepareImportedWorld(world, Math.round(Math.abs(south * 1e4 + west * 1e4)));
    world = prepared.world;
    notes.push(...prepared.notes);
    const attribution = [osm?.attribution ?? null, sat?.attribution ?? null, model ? `Layout inference: ${model}` : null].filter(Boolean).join(" · ");
    setResult({
      world,
      name: placeName || "Imported Society",
      attribution: attribution || "© OpenStreetMap contributors",
      notes,
      added,
      model,
      geo: {
        lat: (south + north) / 2,
        lng: (west + east) / 2,
        bbox,
        placeName: placeName || undefined,
        societyType: sType,
        summary,
        satelliteImage: sat?.image,
      },
    });
    set(3, "done", `${world.buildings.length} buildings · ${world.roads.length} roads/paths`);
    setRunning(false);
  };

  const [sampleLoading, setSampleLoading] = useState(false);
  const loadSample = async () => {
    setSampleLoading(true);
    setSearchError(null);
    try {
      const res = await fetch(SAMPLE_URL);
      const parsed = parseProject(await res.json());
      if (!parsed.ok || !parsed.project) throw new Error(parsed.error ?? "Sample is unreadable.");
      const now = new Date().toISOString();
      openProject({ ...parsed.project, projectId: makeId("prj"), createdAt: now, modifiedAt: now });
      setOpen(false);
      reset();
    } catch (err) {
      setSearchError(`Could not load the sample society: ${err instanceof Error ? err.message : "error"}`);
    } finally {
      setSampleLoading(false);
    }
  };

  const openTwin = () => {
    if (!result) return;
    const now = new Date().toISOString();
    const w = result.world;
    const project: PraesidiumProject = {
      schemaVersion: 1,
      projectId: makeId("prj"),
      name: result.name,
      description: `${result.geo.summary ? result.geo.summary + " " : ""}Imported from satellite + OpenStreetMap on ${new Date().toLocaleDateString()}: ${w.buildings.length} buildings, ${w.roads.length} roads/paths, ${w.site?.gates.length ?? 0} gates. AI-inferred items are marked as inferred.`,
      createdAt: now,
      modifiedAt: now,
      source: { kind: "osm", attribution: result.attribution, importedAt: now, geo: result.geo },
      world: w,
      scenario: defaultScenario("typical_night"),
      baselineRun: null,
      interventionRun: null,
    };
    // dev hook: lets scripts snapshot a live import (used to build public/samples/*)
    (window as unknown as Record<string, unknown>).__praesidiumLastImport = project;
    openProject(project);
    setOpen(false);
    reset();
  };

  const showPipeline = running || result || fatal;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto bg-[#f7f5f1] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-[#1d2430]">Pick your society on the map</DialogTitle>
          <DialogDescription className="text-xs text-[#5c6470]">
            Search, then drag the yellow rectangle around your society or gated community (~150–600 m). Gemini reads the
            satellite image to add compound walls, gates, missing buildings and likely dark zones on top of OpenStreetMap.
          </DialogDescription>
        </DialogHeader>

        {!showPipeline && (
          <div className="space-y-2 text-sm">
            <div className="relative flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim()) search();
                }}
                placeholder="e.g. Prestige Shantiniketan, Bengaluru"
                className="flex-1 rounded-md border border-[#dcd6c8] bg-white px-3 py-2 text-xs focus:border-[#2e7d5b] focus:outline-none"
              />
              <Button size="sm" className="h-8 bg-[#1d2430] text-xs text-white hover:bg-[#2c3642]" onClick={search} disabled={searching || !query.trim()}>
                {searching ? "Searching…" : "Search"}
              </Button>
              {results.length > 0 && (
                <div className="absolute left-0 right-20 top-9 z-[1000] max-h-56 overflow-y-auto rounded-md border border-[#dcd6c8] bg-white shadow-lg">
                  {results.map((r, i) => (
                    <button key={i} onClick={() => pick(r)} className="block w-full border-b border-[#f0ece4] px-3 py-1.5 text-left text-[11px] text-[#1d2430] hover:bg-[#eef4f0]">
                      {r.displayName}
                    </button>
                  ))}
                  <div className="px-3 py-1 text-right text-[9px] text-[#8a8272]">Search © OpenStreetMap contributors (Nominatim)</div>
                </div>
              )}
            </div>
            {searchError && <div className="rounded-md border border-[#e6c98a] bg-[#fdf6e7] px-3 py-1.5 text-xs text-[#7a5d1e]">{searchError}</div>}

            <div className="h-[420px]">
              <MapPicker focus={focus} bbox={bbox} onBbox={setBbox} onProvider={setProvider} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] text-[#5c6470]">
                {span ? (
                  <>
                    <span className={spanOk ? "text-[#1d2430]" : "text-[#a33]"}>
                      Selection {Math.round(span.w)} × {Math.round(span.d)} m
                    </span>
                    {!spanOk && <span className="text-[#a33]"> — keep each side between {MIN_SPAN} and {MAX_SPAN} m</span>}
                    {placeName && <span className="text-[#8a8272]"> · {placeName}</span>}
                  </>
                ) : (
                  "Search for a place to start."
                )}
                {provider && <span className="ml-2 text-[9px] text-[#a39b8b]">map: {provider === "google" ? "Google" : "Esri (fallback)"}</span>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled={sampleLoading} onClick={loadSample} title="Pre-built twin of Prestige Shantiniketan, Bengaluru (cached satellite + Gemini analysis)">
                  {sampleLoading ? "Loading sample…" : "Try a sample society"}
                </Button>
                <Button size="sm" className="h-8 bg-[#2e7d5b] text-xs text-white hover:bg-[#276c4f]" disabled={!spanOk} onClick={build}>
                  Build 3D twin with Gemini
                </Button>
              </div>
            </div>
          </div>
        )}

        {showPipeline && (
          <div className="grid gap-4 text-sm sm:grid-cols-[1fr_260px]">
            <div className="space-y-2">
              {STEPS.map((label, i) => {
                const st = steps[i];
                return (
                  <div key={label} className="flex items-start gap-2.5 rounded-md border border-[#e9e4d8] bg-white px-3 py-2">
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                        st === "done"
                          ? "bg-[#2e7d5b] text-white"
                          : st === "active"
                            ? "animate-pulse bg-[#f5c24b] text-[#1d2430]"
                            : st === "failed"
                              ? "bg-[#c45656] text-white"
                              : "bg-[#ece7dc] text-[#8a8272]"
                      }`}
                    >
                      {st === "done" ? "✓" : st === "failed" ? "!" : st === "skipped" ? "–" : i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className={`text-xs font-medium ${st === "pending" ? "text-[#a39b8b]" : "text-[#1d2430]"}`}>
                        {label}
                        {st === "active" && "…"}
                      </div>
                      {stepNotes[i] && <div className="text-[10px] text-[#8a8272]">{stepNotes[i]}</div>}
                    </div>
                  </div>
                );
              })}

              {description && (
                <div className="rounded-md border border-[#cfe2d7] bg-[#eef4f0] px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#2e7d5b]">
                    Gemini · {societyType?.replace(/_/g, " ")}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#1d2430]">{description}</p>
                </div>
              )}

              {fatal && <div className="rounded-md border border-[#e6c1c1] bg-[#fdf1f1] px-3 py-2 text-xs text-[#a33]">{fatal}</div>}

              {result && (
                <ul className="list-disc space-y-0.5 pl-4 text-[10px] leading-snug text-[#8a8272]">
                  {result.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}

              <div className="flex gap-2 pt-1">
                {result && (
                  <Button size="sm" className="h-8 bg-[#2e7d5b] text-xs text-white hover:bg-[#276c4f]" onClick={openTwin}>
                    Open 3D twin
                  </Button>
                )}
                {!running && (
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={resetRun}>
                    Back to map
                  </Button>
                )}
              </div>
            </div>

            <div>
              {satImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={satImage} alt="Captured satellite view of the selected area" className="w-full rounded-md border border-[#dcd6c8]" />
              ) : (
                <div className="grid aspect-square place-items-center rounded-md border border-dashed border-[#dcd6c8] text-[11px] text-[#a39b8b]">
                  {running ? "Capturing satellite…" : "No satellite image"}
                </div>
              )}
              {result?.attribution && <div className="mt-1 text-[9px] leading-snug text-[#8a8272]">{result.attribution}</div>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
