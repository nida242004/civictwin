"use client";

/**
 * Local Safety Intel: Gemini + Google Search grounded, area-level briefing
 * about the project's locality. Can apply the suggested scenario to the
 * simulation (explicit click only).
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/lib/store/editor";
import { useIntel } from "@/lib/ai/intelStore";
import type { LocalIntel } from "@/lib/ai/context";
import { cacheIntel, intelKey } from "@/lib/ai/intelLoader";
import { cn } from "@/lib/utils";

const DEFAULT_PLACE = "Vasanth Nagar, Bengaluru";
const DEFAULT_GEO = { lat: 12.9918, lng: 77.5937 };

export default function LocalIntelPanel() {
  const open = useIntel((s) => s.open);
  const setOpen = useIntel((s) => s.setOpen);
  const intel = useIntel((s) => s.intel);
  const setIntel = useIntel((s) => s.setIntel);
  const status = useIntel((s) => s.status);
  const project = useEditor((s) => s.project);
  const updateScenario = useEditor((s) => s.updateScenario);

  const geo = project?.source.geo;
  const [place, setPlace] = useState(geo?.placeName ?? DEFAULT_PLACE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (geo?.placeName) setPlace(geo.placeName);
  }, [geo?.placeName]);

  // Auto-research the first time the panel opens (one click fewer in the demo).
  const autoRan = useRef(false);
  useEffect(() => {
    // the background loader normally has it already; only research if it finished without a result
    if (!open || intel || loading || status === "loading" || autoRan.current || !project) return;
    autoRan.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, intel, status, project?.projectId]);

  if (!project) return null;

  async function run() {
    if (!project) return;
    setLoading(true);
    setError(null);
    setApplied(false);
    try {
      let lat = geo?.lat;
      let lng = geo?.lng;
      let placeName = geo?.placeName ?? place;
      if (lat === undefined || lng === undefined || (!geo?.placeName && place !== DEFAULT_PLACE)) {
        if (place.trim() === DEFAULT_PLACE && project.source.kind === "demo") {
          lat = DEFAULT_GEO.lat;
          lng = DEFAULT_GEO.lng;
        } else {
          const g = await fetch("/api/geo/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: place }),
          }).then((r) => r.json());
          const top = g?.data?.results?.[0];
          if (!g?.ok || !top) throw new Error(g?.error ?? "Could not find that locality.");
          lat = top.lat;
          lng = top.lon;
          placeName = place;
        }
      }
      const res = await fetch("/api/ai/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, placeName, societyType: geo?.societyType }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Request failed.");
      setIntel(json.data as LocalIntel);
      if (typeof lat === "number" && typeof lng === "number") cacheIntel(intelKey(lat, lng), json.data as LocalIntel);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setLoading(false);
    }
  }

  const apply = () => {
    if (!intel) return;
    const s = intel.suggestedScenario;
    updateScenario({
      eventsPerHour: s.eventsPerHour,
      lightingOutageFraction: s.lightingOutageFraction,
      ambientVisibility: s.ambientVisibility,
      perpCount: s.perpCount,
      guardFatigue: s.guardFatigue,
      incidentMix: intel.incidentMix,
    });
    setApplied(true);
  };

  const mix = Object.entries(intel?.incidentMix ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setOpen(false)} />}
      <aside
        className={cn(
          "fixed right-0 top-0 z-50 flex h-full w-[420px] max-w-[94vw] flex-col border-l border-[#e3ded4] bg-white shadow-xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full"
        )}
        aria-label="Local safety intel"
      >
        <div className="flex items-center justify-between border-b border-[#e3ded4] px-4 py-3">
          <div>
            <div className="text-sm font-bold text-[#1d2430]">◎ Local safety intel</div>
            <div className="text-[10px] text-[#8a8272]">Gemini + Google Search · area-level public info only</div>
          </div>
          <button onClick={() => setOpen(false)} className="rounded p-1 text-[#8a8272] hover:bg-[#f1ede4]" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs text-[#1d2430]">
          <div className="flex gap-1.5">
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value.slice(0, 120))}
              onKeyDown={(e) => e.key === "Enter" && !loading && run()}
              disabled={Boolean(geo?.placeName)}
              placeholder="Locality, city"
              className="min-w-0 flex-1 rounded-md border border-[#dcd6c8] bg-white px-2.5 py-1.5 text-xs focus:border-[#2e7d5b] focus:outline-none disabled:bg-[#faf8f4]"
            />
            <Button size="sm" className="h-8 bg-[#1d2430] text-xs text-white hover:bg-[#2c3642]" disabled={loading} onClick={run}>
              {loading ? "Researching…" : intel ? "Refresh" : "Research"}
            </Button>
          </div>

          {error && <div className="rounded-md border border-[#e6c4c4] bg-[#fbf0f0] p-2.5 text-[#8a3b3b]">{error}</div>}
          {!loading && !intel && status === "loading" && <div className="rounded-md border border-[#e3ded4] bg-[#faf8f4] p-3 text-[#5c6470]">Loading local context in the background…</div>}
          {loading && <div className="rounded-md border border-[#e3ded4] bg-[#faf8f4] p-3 text-[#5c6470]">Searching recent public reports…</div>}

          {intel && !loading && (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-medium",
                    intel.grounded ? "bg-[#e5f1ea] text-[#2e7d5b]" : "bg-[#f6ecd5] text-[#7a5d1e]"
                  )}
                >
                  {intel.grounded ? "Grounded in web sources" : "Not web-grounded"}
                </span>
                <span className="text-[#8a8272]">
                  {intel.placeName} · {intel.model}
                  {intel.cached ? " · cached" : ""}
                </span>
              </div>

              <p className="leading-relaxed text-[#3a4350]">{intel.summary}</p>

              <section>
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">Risk factors</h4>
                <ul className="space-y-1.5">
                  {intel.riskFactors.map((r, i) => (
                    <li key={i} className="rounded-md border border-[#eee9df] bg-[#faf8f4] p-2">
                      <div className="font-medium">
                        {r.factor}
                        {r.sourceIdx !== null && intel.sources[r.sourceIdx] && (
                          <a
                            href={intel.sources[r.sourceIdx].uri}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="ml-1 align-super text-[9px] text-[#2e7d5b] hover:underline"
                          >
                            [{r.sourceIdx + 1}]
                          </a>
                        )}
                      </div>
                      <div className="text-[#5c6470]">{r.evidence}</div>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">Incident mix & peak hours</h4>
                <div className="space-y-1">
                  {mix.map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 capitalize text-[#5c6470]">{k.replace("_", " ")}</span>
                      <div className="h-1.5 flex-1 rounded bg-[#eee9df]">
                        <div className="h-full rounded bg-[#2e7d5b]" style={{ width: `${Math.round(v * 100)}%` }} />
                      </div>
                      <span className="w-8 text-right tabular-nums text-[#8a8272]">{Math.round(v * 100)}%</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1.5 text-[#5c6470]">
                  Peak hours: <span className="font-medium text-[#1d2430]">{intel.peakHours || "n/a"}</span>
                </div>
              </section>

              <section className="rounded-md border border-[#dcd6c8] p-2.5">
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">Suggested scenario (simulation stress-test)</h4>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[#5c6470]">
                  <span>Events / hour: <b className="text-[#1d2430]">{intel.suggestedScenario.eventsPerHour}</b></span>
                  <span>Perpetrators: <b className="text-[#1d2430]">{intel.suggestedScenario.perpCount}</b></span>
                  <span>Guard fatigue: <b className="text-[#1d2430]">{intel.suggestedScenario.guardFatigue}</b></span>
                  <span>Lights out: <b className="text-[#1d2430]">{Math.round(intel.suggestedScenario.lightingOutageFraction * 100)}%</b></span>
                  <span>Visibility: <b className="text-[#1d2430]">{intel.suggestedScenario.ambientVisibility}</b></span>
                </div>
                <Button size="sm" className="mt-2 h-7 bg-[#2e7d5b] text-xs text-white hover:bg-[#276b4e]" onClick={apply} disabled={applied}>
                  {applied ? "Applied to scenario ✓" : "Apply to scenario"}
                </Button>
              </section>

              {intel.helplines.length > 0 && (
                <section>
                  <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">Helplines</h4>
                  <ul className="text-[#5c6470]">
                    {intel.helplines.map((h, i) => (
                      <li key={i}>
                        {h.name}: <b className="text-[#1d2430]">{h.number}</b>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {intel.sources.length > 0 && (
                <section>
                  <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">Sources</h4>
                  <ol className="list-decimal space-y-0.5 pl-4">
                    {intel.sources.map((s, i) => (
                      <li key={i}>
                        <a href={s.uri} target="_blank" rel="noreferrer noopener" className="break-words text-[#2e7d5b] hover:underline">
                          {s.title || s.uri}
                        </a>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              <p className="text-[10px] leading-snug text-[#8a8272]">
                Area-level context only. Scenario values drive a simulation and are not predictions of real crime; no individuals or communities are profiled.
              </p>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
