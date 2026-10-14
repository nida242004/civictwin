"use client";

/**
 * Bottom timeline: playback controls, scrubber, event markers, event log,
 * and access to results / comparison / assistant.
 */

import { useEffect, useRef, useState } from "react";
import { useEditor, playbackClock } from "@/lib/store/editor";
import { clockLabel } from "@/lib/sim/runner";
import { loadStoredRun } from "@/lib/run-actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const SPEEDS = [1, 2, 4, 8];

const SEVERITY_COLORS = ["#b98a2f", "#d9662f", "#c23b3b"];

export default function TimelineBar() {
  const project = useEditor((s) => s.project);
  const activeRun = useEditor((s) => s.activeRun);
  const runKind = useEditor((s) => s.runKind);
  const playing = useEditor((s) => s.playing);
  const speed = useEditor((s) => s.speed);
  const displayT = useEditor((s) => s.displayT);
  const setPlaying = useEditor((s) => s.setPlaying);
  const setSpeed = useEditor((s) => s.setSpeed);
  const seek = useEditor((s) => s.seek);
  const setResultsOpen = useEditor((s) => s.setResultsOpen);
  const setCompareOpen = useEditor((s) => s.setCompareOpen);
  const setAssistantOpen = useEditor((s) => s.setAssistantOpen);
  const hasBaseline = !!project?.baselineRun;
  const hasIntervention = !!project?.interventionRun;

  const [logOpen, setLogOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // keyboard space = play/pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/)) return;
      if (e.code === "Space" && activeRun) {
        e.preventDefault();
        if (playbackClock.t >= (activeRun?.durationSec ?? 0)) {
          playbackClock.t = 0;
        }
        setPlaying(!useEditor.getState().playing);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeRun, setPlaying]);

  useEffect(() => {
    if (logOpen && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logOpen, displayT]);

  if (!project) return null;

  const duration = activeRun?.durationSec ?? project.scenario.durationSec;
  const events = activeRun?.result.events ?? [];
  const visibleEvents = events.filter((e) => e.tSec <= displayT);
  const recent = [...visibleEvents].slice(-3);
  const currentEvent = visibleEvents.filter((e) => displayT - e.tSec < 20).at(-1);

  return (
    <div className="border-t border-[#e3ded4] bg-white">
      {/* main bar */}
      <div className="flex h-14 items-center gap-3 px-3">
        {/* transport */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              seek(0);
              setPlaying(true);
            }}
            disabled={!activeRun}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#dcd6c8] text-sm hover:bg-[#f1ede4] disabled:opacity-40"
            title="Restart"
          >
            ⏮
          </button>
          <button
            onClick={() => {
              if (!activeRun) return;
              if (!playing && playbackClock.t >= duration) seek(0);
              setPlaying(!playing);
            }}
            disabled={!activeRun}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-[#1d2430] text-white hover:bg-[#2c3642] disabled:opacity-40"
            title="Play / pause (Space)"
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <button
            onClick={() => {
              seek(0);
              setPlaying(false);
            }}
            disabled={!activeRun}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#dcd6c8] text-sm hover:bg-[#f1ede4] disabled:opacity-40"
            title="Stop and reset"
          >
            ⏹
          </button>
        </div>

        {/* speeds */}
        <div className="flex overflow-hidden rounded-md border border-[#dcd6c8]">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={cn(
                "px-2 py-1 text-[11px] font-medium",
                speed === s ? "bg-[#1d2430] text-white" : "bg-white text-[#5c6470] hover:bg-[#f1ede4]"
              )}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* clock */}
        <div className="w-36 shrink-0 font-mono text-xs">
          <span className="text-[#1d2430]">{clockLabel(displayT, project.scenario.startTime)}</span>
          <span className="text-[#8a8272]"> / {clockLabel(duration, project.scenario.startTime)}</span>
        </div>

        {/* scrubber with event markers */}
        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={duration}
            step={1}
            value={Math.min(displayT, duration)}
            onChange={(e) => {
              setPlaying(false);
              seek(parseFloat(e.target.value));
            }}
            disabled={!activeRun}
            className="h-1.5 w-full cursor-pointer appearance-none rounded bg-[#ddd6c8] accent-[#2e7d5b] disabled:opacity-40"
            aria-label="Simulation timeline"
          />
          <div className="pointer-events-none absolute -top-0.5 left-0 right-0 h-2">
            {events.map((e) => (
              <span
                key={e.id}
                className="absolute top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
                style={{
                  left: `${(e.tSec / duration) * 100}%`,
                  backgroundColor: SEVERITY_COLORS[e.severity - 1],
                  opacity: e.tSec <= displayT ? 1 : 0.35,
                }}
                title={`${e.tSec}s · ${e.type}`}
              />
            ))}
          </div>
        </div>

        {/* current event chip */}
        <div className="hidden w-44 shrink-0 text-[10px] leading-tight lg:block">
          {currentEvent ? (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SEVERITY_COLORS[currentEvent.severity - 1] }} />
              <span className="truncate text-[#1d2430]">{currentEvent.type.replace(/_/g, " ")}</span>
            </span>
          ) : (
            <span className="text-[#8a8272]">No simulated event active</span>
          )}
        </div>

        {/* right actions */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setLogOpen(!logOpen)}>
            Event log ({events.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => setResultsOpen(true)}
            disabled={!hasBaseline}
          >
            Results
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] border-[#2e7d5b] text-[#2e7d5b]"
            onClick={() => setCompareOpen(true)}
            disabled={!hasIntervention}
          >
            Compare
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setAssistantOpen(true)}>
            ✦ Assistant
          </Button>
        </div>
      </div>

      {/* run kind strip */}
      <div className="flex h-7 items-center gap-2 border-t border-[#efeadf] bg-[#faf8f4] px-3 text-[10px] text-[#8a8272]">
        <span>
          {activeRun ? (
            <>
              Viewing <b className="text-[#1d2430]">{runKind}</b> run · seed <span className="font-mono">{activeRun.result.seed}</span> ·{" "}
              {activeRun.result.engineVersion === project.baselineRun?.engineVersion ? "engine v" + activeRun.result.engineVersion : activeRun.result.engineVersion}
            </>
          ) : (
            "No simulation loaded — press “Run simulation” in the top bar"
          )}
        </span>
        {hasBaseline && (
          <button
            className={cn("ml-2 rounded px-1.5 py-0.5 hover:bg-[#f1ede4]", runKind === "baseline" && "bg-[#eef4f0] font-medium text-[#2e7d5b]")}
            onClick={() => loadStoredRun("baseline")}
          >
            Replay baseline
          </button>
        )}
        {hasIntervention && (
          <button
            className={cn("rounded px-1.5 py-0.5 hover:bg-[#f1ede4]", runKind === "intervention" && "bg-[#eef4f0] font-medium text-[#2e7d5b]")}
            onClick={() => loadStoredRun("intervention")}
          >
            Replay intervention
          </button>
        )}
        <span className="ml-auto">Playback restores exact simulated state — scrubbing is deterministic.</span>
      </div>

      {/* event log */}
      {logOpen && (
        <div ref={logRef} className="max-h-40 overflow-y-auto border-t border-[#efeadf] bg-[#fcfbf8] px-3 py-2">
          {events.length === 0 && (
            <div className="py-3 text-center text-[11px] text-[#8a8272]">
              {activeRun ? "No simulated events in this run." : "Run a simulation to see its event log."}
            </div>
          )}
          <div className="space-y-1">
            {visibleEvents
              .slice()
              .reverse()
              .map((e) => (
                <div key={e.id} className="flex items-start gap-2 rounded border border-[#eee9df] bg-white px-2 py-1 text-[11px]">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SEVERITY_COLORS[e.severity - 1] }} />
                  <span className="w-14 shrink-0 font-mono text-[#8a8272]">{clockLabel(e.tSec, project.scenario.startTime).slice(0, 5)}</span>
                  <span className="w-32 shrink-0 font-medium text-[#1d2430]">{e.type.replace(/_/g, " ")}</span>
                  <span className="w-24 shrink-0 text-[#5c6470]">sev {e.severity}</span>
                  <span className="flex-1 text-[#5c6470]">{e.note}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium",
                      e.outcome === "resolved" ? "bg-[#eef4f0] text-[#2e7d5b]" : "bg-[#fdf6e7] text-[#7a5d1e]"
                    )}
                  >
                    {e.outcome.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* recent events ticker */}
      {!logOpen && recent.length > 0 && (
        <div className="flex items-center gap-2 overflow-hidden border-t border-[#efeadf] bg-[#fcfbf8] px-3 py-1 text-[10px] text-[#8a8272]">
          <span className="shrink-0 font-medium">Recent:</span>
          {recent.map((e) => (
            <span key={e.id} className="flex shrink-0 items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SEVERITY_COLORS[e.severity - 1] }} />
              {clockLabel(e.tSec, project.scenario.startTime).slice(0, 5)} {e.type.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
