"use client";

/**
 * Left sidebar: placement tools, scenario configuration, layer visibility.
 */

import { useEditor, type Tool } from "@/lib/store/editor";
import { applyScenarioTemplate, scenarioTemplates } from "@/lib/sim/scenarios";
import type { FacilityType } from "@/lib/world/types";
import { cn } from "@/lib/utils";

const TOOLS: { id: Tool; label: string; hint: string; icon: string }[] = [
  { id: "select", label: "Select / Inspect", hint: "V", icon: "M" },
  { id: "road", label: "Road or path", hint: "R", icon: "╱" },
  { id: "building", label: "Building", hint: "B", icon: "▉" },
  { id: "facility", label: "Public facility", hint: "F", icon: "◷" },
  { id: "streetlight", label: "Streetlight", hint: "L", icon: "☼" },
  { id: "camera", label: "CCTV camera", hint: "C", icon: "▣" },
  { id: "guard", label: "Guard patrol", hint: "G", icon: "☺" },
];

const FACILITY_TYPES: FacilityType[] = [
  "bus_stop",
  "park",
  "community_centre",
  "market",
  "school",
  "clinic",
  "atm",
  "place_of_worship",
];

function Row({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1" title={title}>
      <span className="w-28 shrink-0 text-[11px] text-[#5c6470]">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function NumInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 flex-1 cursor-pointer appearance-none rounded bg-[#ddd6c8] accent-[#2e7d5b]"
      />
      <span className="w-14 shrink-0 text-right font-mono text-[11px] text-[#1d2430]">
        {value}
        {suffix ? ` ${suffix}` : ""}
      </span>
    </div>
  );
}

export default function ToolsSidebar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const facilityType = useEditor((s) => s.facilityType);
  const setFacilityType = useEditor((s) => s.setFacilityType);
  const layers = useEditor((s) => s.layers);
  const toggleLayer = useEditor((s) => s.toggleLayer);
  const sceneTheme = useEditor((s) => s.sceneTheme) ?? "night";
  const setSceneTheme = useEditor((s) => s.setSceneTheme);
  const scenario = useEditor((s) => s.project?.scenario);
  const updateScenario = useEditor((s) => s.updateScenario);
  const roadDraft = useEditor((s) => s.roadDraft);
  const commitRoad = useEditor((s) => s.commitRoad);
  const cancelRoad = useEditor((s) => s.cancelRoad);
  const world = useEditor((s) => s.project?.world);

  if (!scenario || !world) return null;

  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-[#e3ded4] bg-[#faf8f4]">
      {/* tools */}
      <div className="border-b border-[#e9e4d8] p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">Tools</div>
        <div className="grid grid-cols-1 gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition",
                tool === t.id
                  ? "border-[#2e7d5b] bg-[#eef4f0] text-[#1d2430]"
                  : "border-transparent text-[#5c6470] hover:border-[#dcd6c8] hover:bg-white"
              )}
              title={`${t.label} (${t.hint})`}
            >
              <span className="w-4 text-center text-sm">{t.icon}</span>
              <span className="flex-1">{t.label}</span>
              <kbd className="rounded border border-[#dcd6c8] bg-white px-1 text-[9px] text-[#8a8272]">{t.hint}</kbd>
            </button>
          ))}
        </div>

        {tool === "facility" && (
          <div className="mt-2">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-[#8a8272]">Facility type</div>
            <select
              value={facilityType}
              onChange={(e) => setFacilityType(e.target.value as FacilityType)}
              className="w-full rounded-md border border-[#dcd6c8] bg-white px-2 py-1.5 text-xs"
            >
              {FACILITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        )}

        {tool === "road" && (
          <div className="mt-2 rounded-md border border-[#dcd6c8] bg-white p-2 text-[11px] text-[#5c6470]">
            <div className="font-medium text-[#1d2430]">Drawing road — {roadDraft.length} point{roadDraft.length === 1 ? "" : "s"}</div>
            <div className="mt-0.5">Click points on the map in order. Finish with Enter or the button below.</div>
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={commitRoad}
                disabled={roadDraft.length < 2}
                className="flex-1 rounded bg-[#2e7d5b] px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
              >
                Finish road
              </button>
              <button onClick={cancelRoad} className="flex-1 rounded border border-[#dcd6c8] px-2 py-1 text-[11px]">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* scenario */}
      <div className="border-b border-[#e9e4d8] p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">Scenario</div>
        <div className="mb-2 grid grid-cols-2 gap-1">
          {scenarioTemplates().map((t) => (
            <button
              key={t.id}
              onClick={() => updateScenario(applyScenarioTemplate(scenario, t.id as "typical_night" | "low_visibility_night"))}
              className={cn(
                "rounded-md border px-2 py-1.5 text-[11px] leading-tight",
                scenario.id === t.id
                  ? "border-[#2e7d5b] bg-[#eef4f0] font-medium text-[#1d2430]"
                  : "border-[#dcd6c8] bg-white text-[#5c6470] hover:border-[#2e7d5b]"
              )}
            >
              {t.name}
            </button>
          ))}
        </div>
        <p className="mb-2 text-[10px] leading-snug text-[#8a8272]">{scenario.description}</p>

        <Row label="Duration">
          <NumInput value={Math.round(scenario.durationSec / 60)} onChange={(v) => updateScenario({ durationSec: v * 60 })} min={5} max={90} suffix="min" />
        </Row>
        <Row label="Population">
          <NumInput value={scenario.population} onChange={(v) => updateScenario({ population: Math.round(v) })} min={0} max={200} />
        </Row>
        <Row label="Residents">
          <NumInput value={Math.round(scenario.residentRatio * 100)} onChange={(v) => updateScenario({ residentRatio: v / 100 })} min={0} max={100} suffix="%" />
        </Row>
        <Row label="Walk speed">
          <NumInput value={scenario.pedestrianSpeed} onChange={(v) => updateScenario({ pedestrianSpeed: v })} min={0.5} max={2.5} step={0.05} suffix="m/s" />
        </Row>
        <Row label="Events / hour">
          <NumInput value={scenario.eventsPerHour} onChange={(v) => updateScenario({ eventsPerHour: v })} min={0} max={60} />
        </Row>
        <Row label="Lamp outages">
          <NumInput value={Math.round(scenario.lightingOutageFraction * 100)} onChange={(v) => updateScenario({ lightingOutageFraction: v / 100 })} min={0} max={100} suffix="%" />
        </Row>
        <Row label="Visibility">
          <NumInput value={Math.round(scenario.ambientVisibility * 100)} onChange={(v) => updateScenario({ ambientVisibility: Math.max(0.2, v / 100) })} min={20} max={100} suffix="%" />
        </Row>
        <Row label="Guards">
          <select
            value={scenario.guardCount === null ? "world" : String(scenario.guardCount)}
            onChange={(e) => updateScenario({ guardCount: e.target.value === "world" ? null : parseInt(e.target.value, 10) })}
            className="w-full rounded-md border border-[#dcd6c8] bg-white px-2 py-1 text-[11px]"
          >
            <option value="world">From neighborhood ({world.guards.filter((g) => g.active).length})</option>
            {[0, 1, 2, 3, 4, 6, 8].map((n) => (
              <option key={n} value={String(n)}>
                {n} guard{n === 1 ? "" : "s"} (override)
              </option>
            ))}
          </select>
        </Row>
        {scenario.guardCount !== null && (
          <Row label="Guard speed">
            <NumInput value={scenario.guardSpeed} onChange={(v) => updateScenario({ guardSpeed: v })} min={0.4} max={2.5} step={0.05} suffix="m/s" />
          </Row>
        )}
        <Row label="Seed" title="Same seed + same setup = identical results">
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={scenario.seed}
              onChange={(e) => updateScenario({ seed: Math.abs(parseInt(e.target.value, 10) || 0) })}
              className="w-full rounded-md border border-[#dcd6c8] bg-white px-2 py-1 font-mono text-[11px]"
            />
            <button
              onClick={() => updateScenario({ seed: Math.floor(Math.random() * 99999999) })}
              className="shrink-0 rounded border border-[#dcd6c8] bg-white px-1.5 py-1 text-[11px] hover:border-[#2e7d5b]"
              title="New random seed"
            >
              ⟳
            </button>
          </div>
        </Row>
      </div>

      {/* visual theme */}
      <div className="border-b border-[#e9e4d8] p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">Visual Theme</div>
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { id: "night", icon: "🌙", label: "Night" },
            { id: "sunset", icon: "🌅", label: "Sunset" },
            { id: "daylight", icon: "☀️", label: "Day" },
          ].map((th) => (
            <button
              key={th.id}
              onClick={() => setSceneTheme(th.id as any)}
              className={cn(
                "flex flex-col items-center justify-center rounded-md border p-1.5 text-center transition",
                sceneTheme === th.id
                  ? "border-[#2563eb] bg-[#eff6ff] font-medium text-[#1d4ed8] shadow-sm"
                  : "border-[#dcd6c8] bg-white text-[#5c6470] hover:border-[#2563eb]"
              )}
            >
              <span className="text-sm">{th.icon}</span>
              <span className="mt-0.5 text-[10px]">{th.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* layers */}
      <div className="p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">Layers & overlays</div>
        {(
          [
            ["lighting", "Lighting pools", "Modeled light pools around active lamps"],
            ["cctv", "CCTV fields of view", "Modeled camera FOV wedges"],
            ["coverage", "Coverage heat overlay", "Color walkable paths by modeled lighting coverage"],
            ["labels", "Labels & routes", "Facility labels and guard patrol routes"],
          ] as const
        ).map(([key, label, title]) => (
          <label key={key} className="flex cursor-pointer items-center justify-between py-1 text-xs" title={title}>
            <span className="text-[#5c6470]">{label}</span>
            <input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} className="h-3.5 w-3.5 accent-[#2e7d5b]" />
          </label>
        ))}
      </div>

      <div className="mt-auto border-t border-[#e9e4d8] p-3 text-[10px] leading-snug text-[#8a8272]">
        All simulation outcomes are fictional scenario models for planning exercises. They do not
        predict actual crime.
      </div>
    </aside>
  );
}
