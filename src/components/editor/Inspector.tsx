"use client";

/**
 * Right inspector: context-sensitive properties for the selected object,
 * or scenario summary when nothing is selected.
 */

import { useEditor } from "@/lib/store/editor";
import { Button } from "@/components/ui/button";
import { nearestRoutableNode, buildNavGraph } from "@/lib/world/graph";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block py-1" title={hint}>
      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-[#8a8272]">{label}</div>
      {children}
    </label>
  );
}

function num(v: number): string {
  return String(Math.round(v * 100) / 100);
}

export default function Inspector() {
  const project = useEditor((s) => s.project);
  const selection = useEditor((s) => s.selection);
  const mutateWorld = useEditor((s) => s.mutateWorld);
  const deleteSelected = useEditor((s) => s.deleteSelected);
  const moveMode = useEditor((s) => s.moveMode);
  const setMoveMode = useEditor((s) => s.setMoveMode);
  const setTool = useEditor((s) => s.setTool);

  const graphInfo = useMemo(() => {
    if (!project) return null;
    try {
      const g = buildNavGraph(project.world);
      return { stats: g.stats, graph: g };
    } catch {
      return null;
    }
  }, [project]);

  if (!project) return null;
  const world = project.world;

  const findSelected = (): { obj: any; kind: string } | null => {
    if (!selection) return null;
    switch (selection.kind) {
      case "streetlight":
        return { obj: world.streetlights.find((o) => o.id === selection.id), kind: selection.kind };
      case "camera":
        return { obj: world.cameras.find((o) => o.id === selection.id), kind: selection.kind };
      case "guard":
        return { obj: world.guards.find((o) => o.id === selection.id), kind: selection.kind };
      case "building":
        return { obj: world.buildings.find((o) => o.id === selection.id), kind: selection.kind };
      case "facility":
        return { obj: world.facilities.find((o) => o.id === selection.id), kind: selection.kind };
      case "road":
        return { obj: world.roads.find((o) => o.id === selection.id), kind: selection.kind };
    }
  };

  const found = findSelected();
  const isConnected =
    found && graphInfo && found.kind !== "road"
      ? nearestRoutableNode(graphInfo.graph, found.obj.x as number, found.obj.z as number) !== null
      : null;

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-[#e3ded4] bg-[#faf8f4]">
      <div className="border-b border-[#e9e4d8] px-3 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#8a8272]">Inspector</div>
      </div>

      <div className="flex-1 p-3">
        {!found && (
          <div className="space-y-3 text-xs text-[#5c6470]">
            <p>
              Nothing selected. Click an object in the 3D view to inspect and edit it, or pick a
              placement tool from the left.
            </p>
            {graphInfo && (
              <div className="rounded-md border border-[#e3ded4] bg-white p-2.5">
                <div className="font-medium text-[#1d2430]">Walkable network</div>
                <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
                  <span>Nodes: {graphInfo.stats.nodeCount}</span>
                  <span>Links: {graphInfo.stats.edgeCount}</span>
                  <span className={graphInfo.stats.componentCount > 1 ? "text-[#b98a2f]" : "text-[#2e7d5b]"}>
                    Components: {graphInfo.stats.componentCount}
                  </span>
                  <span>Largest: {graphInfo.stats.largestComponent}</span>
                </div>
                {graphInfo.stats.componentCount > 1 && (
                  <p className="mt-1.5 text-[10px] leading-snug text-[#b98a2f]">
                    The pedestrian network has disconnected parts — agents cannot walk between them.
                    Connect them with a path.
                  </p>
                )}
              </div>
            )}
            <div className="rounded-md border border-[#e3ded4] bg-white p-2.5 text-[11px] leading-relaxed">
              <div className="font-medium text-[#1d2430]">Quick start</div>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                <li>Inspect lighting & coverage</li>
                <li>Add streetlights on dark paths</li>
                <li>Run the baseline simulation</li>
                <li>Add an intervention & rerun</li>
                <li>Compare and export the report</li>
              </ol>
            </div>
          </div>
        )}

        {found && found.obj && (
          <div className="space-y-1 text-xs">
            <div className="mb-2 flex items-center justify-between">
              <span className="rounded-full bg-[#eef4f0] px-2 py-0.5 text-[10px] font-medium capitalize text-[#2e7d5b]">
                {found.kind.replace(/_/g, " ")}
              </span>
              <span className="font-mono text-[9px] text-[#8a8272]">{(found.obj as { id: string }).id}</span>
            </div>

            {isConnected === false && (
              <div className="mb-2 rounded border border-[#e6c98a] bg-[#fdf6e7] px-2 py-1.5 text-[10px] leading-snug text-[#7a5d1e]">
                This object is more than 30 m from the walkable network — agents may not be able to
                reach it. Move it closer to a road or path.
              </div>
            )}

            {selection?.kind === "streetlight" && (
              <>
                <Field label="Position (x, z)">
                  <div className="flex gap-1">
                    <input
                      className="w-full rounded border border-[#dcd6c8] bg-white px-1.5 py-1 font-mono text-[11px]"
                      value={num(found.obj.x)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        mutateWorld((d) => {
                          const o = d.world.streetlights.find((x) => x.id === selection.id);
                          if (o) o.x = v;
                        });
                      }}
                    />
                    <input
                      className="w-full rounded border border-[#dcd6c8] bg-white px-1.5 py-1 font-mono text-[11px]"
                      value={num(found.obj.z)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        mutateWorld((d) => {
                          const o = d.world.streetlights.find((x) => x.id === selection.id);
                          if (o) o.z = v;
                        });
                      }}
                    />
                  </div>
                </Field>
                <Field label={`Brightness — ${Math.round(found.obj.brightness * 100)}%`}>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round(found.obj.brightness * 100)}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.streetlights.find((x) => x.id === selection.id);
                        if (o) o.brightness = parseInt(e.target.value, 10) / 100;
                      })
                    }
                    className="h-1 w-full cursor-pointer appearance-none rounded bg-[#ddd6c8] accent-[#2e7d5b]"
                  />
                </Field>
                <Field label={`Illumination radius — ${found.obj.radius} m`}>
                  <input
                    type="range"
                    min={6}
                    max={40}
                    value={found.obj.radius}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.streetlights.find((x) => x.id === selection.id);
                        if (o) o.radius = parseInt(e.target.value, 10);
                      })
                    }
                    className="h-1 w-full cursor-pointer appearance-none rounded bg-[#ddd6c8] accent-[#2e7d5b]"
                  />
                </Field>
                <Field label={`Pole height — ${found.obj.height} m`}>
                  <input
                    type="range"
                    min={4}
                    max={14}
                    value={found.obj.height}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.streetlights.find((x) => x.id === selection.id);
                        if (o) o.height = parseInt(e.target.value, 10);
                      })
                    }
                    className="h-1 w-full cursor-pointer appearance-none rounded bg-[#ddd6c8] accent-[#2e7d5b]"
                  />
                </Field>
                <div className="flex gap-3 py-1">
                  <label className="flex items-center gap-1.5 text-[11px]">
                    <input
                      type="checkbox"
                      checked={found.obj.on}
                      onChange={(e) =>
                        mutateWorld((d) => {
                          const o = d.world.streetlights.find((x) => x.id === selection.id);
                          if (o) o.on = e.target.checked;
                        })
                      }
                      className="h-3.5 w-3.5 accent-[#2e7d5b]"
                    />
                    On
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px]">
                    <input
                      type="checkbox"
                      checked={found.obj.maintenance === "faulty"}
                      onChange={(e) =>
                        mutateWorld((d) => {
                          const o = d.world.streetlights.find((x) => x.id === selection.id);
                          if (o) o.maintenance = e.target.checked ? "faulty" : "ok";
                        })
                      }
                      className="h-3.5 w-3.5 accent-[#2e7d5b]"
                    />
                    Faulty
                  </label>
                </div>
              </>
            )}

            {selection?.kind === "camera" && (
              <>
                <Field label={`Orientation — ${found.obj.orientationDeg}°`} hint="0° = east, clockwise">
                  <input
                    type="range"
                    min={0}
                    max={359}
                    value={found.obj.orientationDeg}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.cameras.find((x) => x.id === selection.id);
                        if (o) o.orientationDeg = parseInt(e.target.value, 10);
                      })
                    }
                    className="h-1 w-full cursor-pointer appearance-none rounded bg-[#ddd6c8] accent-[#2e7d5b]"
                  />
                </Field>
                <Field label={`Field of view — ${found.obj.fovDeg}°`}>
                  <input
                    type="range"
                    min={20}
                    max={360}
                    value={found.obj.fovDeg}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.cameras.find((x) => x.id === selection.id);
                        if (o) o.fovDeg = parseInt(e.target.value, 10);
                      })
                    }
                    className="h-1 w-full cursor-pointer appearance-none rounded bg-[#ddd6c8] accent-[#2e7d5b]"
                  />
                </Field>
                <Field label={`Effective range — ${found.obj.range} m`}>
                  <input
                    type="range"
                    min={6}
                    max={60}
                    value={found.obj.range}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.cameras.find((x) => x.id === selection.id);
                        if (o) o.range = parseInt(e.target.value, 10);
                      })
                    }
                    className="h-1 w-full cursor-pointer appearance-none rounded bg-[#ddd6c8] accent-[#2e7d5b]"
                  />
                </Field>
                <label className="flex items-center gap-1.5 py-1 text-[11px]">
                  <input
                    type="checkbox"
                    checked={found.obj.active}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.cameras.find((x) => x.id === selection.id);
                        if (o) o.active = e.target.checked;
                      })
                    }
                    className="h-3.5 w-3.5 accent-[#2e7d5b]"
                  />
                  Active this night
                </label>
              </>
            )}

            {selection?.kind === "guard" && (
              <>
                <Field label="Name">
                  <input
                    className="w-full rounded border border-[#dcd6c8] bg-white px-1.5 py-1 text-[11px]"
                    value={found.obj.name}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.guards.find((x) => x.id === selection.id);
                        if (o) o.name = e.target.value.slice(0, 40);
                      })
                    }
                  />
                </Field>
                <Field label={`Speed — ${found.obj.speed} m/s`}>
                  <input
                    type="range"
                    min={40}
                    max={250}
                    value={Math.round(found.obj.speed * 100)}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.guards.find((x) => x.id === selection.id);
                        if (o) o.speed = parseInt(e.target.value, 10) / 100;
                      })
                    }
                    className="h-1 w-full cursor-pointer appearance-none rounded bg-[#ddd6c8] accent-[#2e7d5b]"
                  />
                </Field>
                <Field label={`Waypoints — ${found.obj.waypoints.length}`} hint="Patrol loops through these points in order">
                  <div className="space-y-1">
                    {found.obj.waypoints.map((w, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="w-4 text-[10px] text-[#8a8272]">{i + 1}.</span>
                        <input
                          className="w-full rounded border border-[#dcd6c8] bg-white px-1 py-0.5 font-mono text-[10px]"
                          value={num(w.x)}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            mutateWorld((d) => {
                              const o = d.world.guards.find((x) => x.id === selection.id);
                              if (o) o.waypoints[i].x = v;
                            });
                          }}
                        />
                        <input
                          className="w-full rounded border border-[#dcd6c8] bg-white px-1 py-0.5 font-mono text-[10px]"
                          value={num(w.z)}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            mutateWorld((d) => {
                              const o = d.world.guards.find((x) => x.id === selection.id);
                              if (o) o.waypoints[i].z = v;
                            });
                          }}
                        />
                        <button
                          className="px-1 text-[11px] text-[#8a8272] hover:text-[#c23b3b]"
                          title="Remove waypoint"
                          onClick={() =>
                            mutateWorld((d) => {
                              const o = d.world.guards.find((x) => x.id === selection.id);
                              if (o && o.waypoints.length > 1) o.waypoints.splice(i, 1);
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </Field>
                <p className="py-1 text-[10px] leading-snug text-[#8a8272]">
                  Tip: click “Move” then click the map to relocate the nearest waypoint, or use the
                  planning assistant to redesign the route.
                </p>
              </>
            )}

            {selection?.kind === "building" && (
              <>
                <Field label="Name">
                  <input
                    className="w-full rounded border border-[#dcd6c8] bg-white px-1.5 py-1 text-[11px]"
                    value={found.obj.name ?? ""}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.buildings.find((x) => x.id === selection.id);
                        if (o) o.name = e.target.value.slice(0, 60);
                      })
                    }
                  />
                </Field>
                <Field label="Category">
                  <select
                    className="w-full rounded border border-[#dcd6c8] bg-white px-1.5 py-1 text-[11px]"
                    value={found.obj.category}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.buildings.find((x) => x.id === selection.id);
                        if (o) o.category = e.target.value as typeof o.category;
                      })
                    }
                  >
                    {["residential", "commercial", "community", "mixed", "other"].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`Floors — ${found.obj.floors} (${found.obj.height} m)`}>
                  <input
                    type="range"
                    min={1}
                    max={12}
                    value={found.obj.floors}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.buildings.find((x) => x.id === selection.id);
                        if (o) {
                          o.floors = parseInt(e.target.value, 10);
                          o.height = o.floors * 3;
                        }
                      })
                    }
                    className="h-1 w-full cursor-pointer appearance-none rounded bg-[#ddd6c8] accent-[#2e7d5b]"
                  />
                </Field>
                <Field label={`Overnight occupancy — ${found.obj.occupancy}`} hint="Synthetic estimate used to seed simulated residents">
                  <input
                    type="range"
                    min={0}
                    max={80}
                    value={found.obj.occupancy}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.buildings.find((x) => x.id === selection.id);
                        if (o) o.occupancy = parseInt(e.target.value, 10);
                      })
                    }
                    className="h-1 w-full cursor-pointer appearance-none rounded bg-[#ddd6c8] accent-[#2e7d5b]"
                  />
                </Field>
                {found.obj.inferred && (
                  <p className="py-1 text-[10px] text-[#b98a2f]">
                    Height was inferred during import (no mapped data) and is not an authoritative fact.
                  </p>
                )}
              </>
            )}

            {selection?.kind === "facility" && (
              <>
                <Field label="Name">
                  <input
                    className="w-full rounded border border-[#dcd6c8] bg-white px-1.5 py-1 text-[11px]"
                    value={found.obj.name ?? ""}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.facilities.find((x) => x.id === selection.id);
                        if (o) o.name = e.target.value.slice(0, 60);
                      })
                    }
                  />
                </Field>
                <Field label="Type">
                  <select
                    className="w-full rounded border border-[#dcd6c8] bg-white px-1.5 py-1 text-[11px]"
                    value={found.obj.type}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.facilities.find((x) => x.id === selection.id);
                        if (o) o.type = e.target.value as typeof o.type;
                      })
                    }
                  >
                    {["bus_stop", "park", "community_centre", "market", "school", "clinic", "atm", "place_of_worship", "other"].map((c) => (
                      <option key={c} value={c}>
                        {c.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </Field>
                {found.obj.type === "park" && (
                  <Field label={`Radius — ${found.obj.radius ?? 20} m`}>
                    <input
                      type="range"
                      min={8}
                      max={80}
                      value={found.obj.radius ?? 20}
                      onChange={(e) =>
                        mutateWorld((d) => {
                          const o = d.world.facilities.find((x) => x.id === selection.id);
                          if (o) o.radius = parseInt(e.target.value, 10);
                        })
                      }
                      className="h-1 w-full cursor-pointer appearance-none rounded bg-[#ddd6c8] accent-[#2e7d5b]"
                    />
                  </Field>
                )}
              </>
            )}

            {selection?.kind === "road" && (
              <>
                <Field label="Name">
                  <input
                    className="w-full rounded border border-[#dcd6c8] bg-white px-1.5 py-1 text-[11px]"
                    value={found.obj.name ?? ""}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.roads.find((x) => x.id === selection.id);
                        if (o) o.name = e.target.value.slice(0, 60);
                      })
                    }
                  />
                </Field>
                <Field label="Category">
                  <select
                    className="w-full rounded border border-[#dcd6c8] bg-white px-1.5 py-1 text-[11px]"
                    value={found.obj.category}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.roads.find((x) => x.id === selection.id);
                        if (o) o.category = e.target.value as "road" | "path";
                      })
                    }
                  >
                    <option value="road">road</option>
                    <option value="path">pedestrian path</option>
                  </select>
                </Field>
                <Field label={`Width — ${found.obj.width} m`}>
                  <input
                    type="range"
                    min={1.5}
                    max={14}
                    step={0.5}
                    value={found.obj.width}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.roads.find((x) => x.id === selection.id);
                        if (o) o.width = parseFloat(e.target.value);
                      })
                    }
                    className="h-1 w-full cursor-pointer appearance-none rounded bg-[#ddd6c8] accent-[#2e7d5b]"
                  />
                </Field>
                <label className="flex items-center gap-1.5 py-1 text-[11px]">
                  <input
                    type="checkbox"
                    checked={found.obj.pedestrian}
                    onChange={(e) =>
                      mutateWorld((d) => {
                        const o = d.world.roads.find((x) => x.id === selection.id);
                        if (o) o.pedestrian = e.target.checked;
                      })
                    }
                    className="h-3.5 w-3.5 accent-[#2e7d5b]"
                  />
                  Walkable by pedestrians
                </label>
                {(() => {
                  const pts = (found.obj.points ?? []) as { x: number; z: number }[];
                  let len = 0;
                  for (let i = 0; i + 1 < pts.length; i++) {
                    len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
                  }
                  return (
                    <div className="mt-2 rounded border border-[#e3ded4] bg-white p-2 text-[11px] text-[#5c6470]">
                      <div className="flex justify-between">
                        <span>Corridor length:</span>
                        <span className="font-medium text-[#1d2430]">{Math.round(len)} m</span>
                      </div>
                      <div className="mt-0.5 flex justify-between">
                        <span>Waypoints:</span>
                        <span className="font-medium text-[#1d2430]">{pts.length} nodes</span>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {/* actions */}
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#e9e4d8] pt-3">
              <Button
                size="sm"
                variant="outline"
                className={cn("h-7 text-[11px]", moveMode && "border-[#2e7d5b] bg-[#eef4f0] text-[#2e7d5b]")}
                onClick={() => setMoveMode(!moveMode)}
              >
                {moveMode ? "Click the map…" : "Move"}
              </Button>
              {selection?.kind === "streetlight" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    mutateWorld((d) => {
                      const o = d.world.streetlights.find((x) => x.id === selection!.id);
                      if (o)
                        d.world.streetlights.push({
                          ...o,
                          id: `sl_${Math.random().toString(36).slice(2, 9)}`,
                          x: o.x + 6,
                          z: o.z + 6,
                        });
                    });
                  }}
                >
                  Duplicate
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-[#c23b3b]/40 text-[11px] text-[#c23b3b] hover:bg-[#fbf0f0]"
                onClick={() => {
                  setTool("select");
                  deleteSelected();
                }}
              >
                Delete
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-[#8a8272]">Delete can be undone with Ctrl+Z.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
