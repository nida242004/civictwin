"use client";

/**
 * Geographic import dialog: search → preview → confirm.
 * Uses the backend proxy for Nominatim/Overpass with graceful failures.
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/lib/store/editor";
import type { World } from "@/lib/world/types";
import { defaultScenario } from "@/lib/world/types";
import { makeId } from "@/lib/world/ids";

interface SearchResult {
  displayName: string;
  lat: number;
  lon: number;
  boundingbox: [number, number, number, number];
}

interface ImportPreview {
  world: World;
  stats: Record<string, number>;
  notes: string[];
  attribution: string;
  fetchedAt: string;
  suggestedName: string;
  bbox: [number, number, number, number];
}

export default function ImportDialog() {
  const open = useEditor((s) => s.importOpen);
  const setOpen = useEditor((s) => s.setImportOpen);
  const openProject = useEditor((s) => s.openProject);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [imported, setImported] = useState(false);

  const reset = () => {
    setQuery("");
    setSearchError(null);
    setResults([]);
    setSelected(null);
    setImportError(null);
    setPreview(null);
    setImported(false);
  };

  const search = async () => {
    setSearching(true);
    setSearchError(null);
    setResults([]);
    setSelected(null);
    setPreview(null);
    try {
      const res = await fetch("/api/geo/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (!json.ok) {
        setSearchError(json.error ?? "Search failed.");
        return;
      }
      setResults(json.data.results ?? []);
      if (!json.data.results?.length) setSearchError("No places matched that search. Try a locality, suburb, or landmark name.");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed — the location service may be unreachable from this network.");
    } finally {
      setSearching(false);
    }
  };

  const doImport = async (r: SearchResult) => {
    setImporting(true);
    setImportError(null);
    setPreview(null);
    try {
      const [s, n, w, e] = r.boundingbox;
      // clamp the import area to ~1.8 km per side (server limit ~2.2 km)
      let south = s;
      let north = n;
      let west = w;
      let east = e;
      const maxSpanM = 1800;
      const cLat = (s + n) / 2;
      const cLon = (w + e) / 2;
      const latSpan = maxSpanM / 111320;
      const lonSpan = maxSpanM / (111320 * Math.max(0.2, Math.cos((cLat * Math.PI) / 180)));
      if (north - south > latSpan) {
        south = cLat - latSpan / 2;
        north = cLat + latSpan / 2;
      }
      if (east - west > lonSpan) {
        west = cLon - lonSpan / 2;
        east = cLon + lonSpan / 2;
      }
      const res = await fetch("/api/geo/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ south, north, west, east, name: r.displayName.split(",")[0] }),
      });
      const json = await res.json();
      if (!json.ok) {
        setImportError(json.error ?? "Import failed.");
        return;
      }
      setPreview({ ...json.data, bbox: [south, north, west, east] });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed — the map data service may be unreachable.");
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = () => {
    if (!preview) return;
    const now = new Date().toISOString();
    const shortName = preview.suggestedName;
    openProject({
      schemaVersion: 1,
      projectId: makeId("prj"),
      name: shortName,
      description: `Imported from OpenStreetMap on ${new Date().toLocaleDateString()}. ${preview.stats.roads} roads/paths, ${preview.stats.buildings} buildings, ${preview.stats.facilities} facilities. Geometry is editable; heights may be inferred.`,
      createdAt: now,
      modifiedAt: now,
      source: { kind: "osm", attribution: preview.attribution, importedAt: preview.fetchedAt },
      world: preview.world,
      scenario: defaultScenario("typical_night"),
      baselineRun: null,
      interventionRun: null,
    });
    setImported(true);
    setOpen(false);
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto bg-[#f7f5f1] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-[#1d2430]">Import a neighborhood</DialogTitle>
          <DialogDescription className="text-xs text-[#5c6470]">
            Search for a locality or landmark to import roads, buildings, and parks from OpenStreetMap.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-xs leading-relaxed text-[#5c6470]">
            Search for a locality or landmark. Praesidium fetches mapped roads, paths, buildings,
            parks and bus stops from OpenStreetMap within a bounded area (~2 km) and converts them
            into an editable neighborhood. No safety infrastructure is imported — you add it.
          </p>

          {/* search */}
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) search();
              }}
              placeholder="e.g. Indiranagar, Bengaluru"
              className="flex-1 rounded-md border border-[#dcd6c8] bg-white px-3 py-2 text-xs focus:border-[#2e7d5b] focus:outline-none"
            />
            <Button size="sm" className="h-8 bg-[#1d2430] text-xs text-white hover:bg-[#2c3642]" onClick={search} disabled={searching || !query.trim()}>
              {searching ? "Searching…" : "Search"}
            </Button>
          </div>

          {searchError && (
            <div className="rounded-md border border-[#e6c98a] bg-[#fdf6e7] px-3 py-2 text-xs text-[#7a5d1e]">
              {searchError}
              <div className="mt-1 text-[10px]">You can still use the demo neighborhood or build from scratch — the rest of the product works offline.</div>
            </div>
          )}

          {/* results */}
          {results.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">Search results</div>
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSelected(r);
                    doImport(r);
                  }}
                  className={`w-full rounded-md border px-3 py-2 text-left text-xs transition ${
                    selected === r ? "border-[#2e7d5b] bg-[#eef4f0]" : "border-[#eee9df] bg-white hover:border-[#2e7d5b]"
                  }`}
                >
                  {r.displayName}
                </button>
              ))}
              <div className="pt-1 text-right text-[9px] text-[#8a8272]">Search by © OpenStreetMap contributors (Nominatim)</div>
            </div>
          )}

          {importing && (
            <div className="flex items-center gap-2 rounded-md border border-[#e3ded4] bg-white p-3 text-xs text-[#5c6470]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#2e7d5b]" />
              Fetching and converting map features — this can take up to 20 seconds…
            </div>
          )}

          {importError && (
            <div className="rounded-md border border-[#e6c1c1] bg-[#fdf1f1] px-3 py-2 text-xs text-[#a33]">
              {importError}
              <div className="mt-1 flex gap-2 text-[10px]">
                {selected && <button className="underline" onClick={() => doImport(selected)}>try again</button>}
                <span>or use the demo neighborhood instead.</span>
              </div>
            </div>
          )}

          {/* preview */}
          {preview && (
            <div className="rounded-lg border border-[#e3ded4] bg-white p-3">
              <div className="text-xs font-semibold text-[#1d2430]">Preview — {preview.suggestedName}</div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                {[
                  ["Roads", preview.stats.roads],
                  ["Buildings", preview.stats.buildings],
                  ["Facilities", preview.stats.facilities],
                  ["Lights", preview.world.streetlights.length],
                ].map(([label, n]) => (
                  <div key={String(label)} className="rounded border border-[#eee9df] bg-[#faf8f4] py-1.5">
                    <div className="text-base font-bold text-[#1d2430]">{n}</div>
                    <div className="text-[9px] uppercase tracking-wide text-[#8a8272]">{label}</div>
                  </div>
                ))}
              </div>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[10px] leading-snug text-[#8a8272]">
                {preview.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
              <div className="mt-2 text-[9px] text-[#8a8272]">
                Map data © OpenStreetMap contributors · fetched {new Date(preview.fetchedAt).toLocaleString()}
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" className="h-7 bg-[#2e7d5b] text-xs text-white hover:bg-[#276c4f]" onClick={confirmImport}>
                  Import & open
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPreview(null)}>
                  Back
                </Button>
              </div>
              {imported && <div className="mt-2 text-[11px] text-[#2e7d5b]">Imported!</div>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
