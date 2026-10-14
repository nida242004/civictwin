"use client";

/**
 * Editor application shell: top bar, tool sidebar, 3D canvas, inspector,
 * timeline, and dialogs. Panels collapse to keep the scene primary.
 */

import { useEffect, useState } from "react";
import TopBar from "./TopBar";
import ToolsSidebar from "./ToolsSidebar";
import Inspector from "./Inspector";
import TimelineBar from "./TimelineBar";
import NeighborhoodCanvas from "@/components/three/NeighborhoodCanvas";
import { ResultsDialog, CompareDialog } from "./ResultsDialog";
import AssistantPanel from "./AssistantPanel";
import ImportDialog from "./ImportDialog";
import { useEditor } from "@/lib/store/editor";
import { cn } from "@/lib/utils";

export default function EditorShell() {
  const showScenarioPanel = useEditor((s) => s.showScenarioPanel);
  const setScenarioPanel = useEditor((s) => s.setScenarioPanel);
  const [showInspector, setShowInspector] = useState(true);

  useEffect(() => {
    (window as any).__praesidiumEditor = useEditor;
  }, []);

  // global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.tagName?.match(/INPUT|TEXTAREA|SELECT/)) return;
      const s = useEditor.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      switch (e.key.toLowerCase()) {
        case "v":
          s.setTool("select");
          break;
        case "r":
          s.setTool("road");
          break;
        case "b":
          s.setTool("building");
          break;
        case "f":
          s.setTool("facility");
          break;
        case "l":
          s.setTool("streetlight");
          break;
        case "c":
          if (!e.ctrlKey && !e.metaKey) s.setTool("camera");
          break;
        case "g":
          s.setTool("guard");
          break;
        case "delete":
        case "backspace":
          if (s.selection) s.deleteSelected();
          break;
        case "enter":
          if (s.tool === "road" && s.roadDraft.length >= 2) s.commitRoad();
          break;
        case "escape":
          if (s.roadDraft.length) s.cancelRoad();
          else if (s.selection) s.select(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // warn before leaving with unsaved changes (autosave makes this rare)
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f7f5f1] text-[#1d2430]">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {showScenarioPanel ? (
          <ToolsSidebar />
        ) : (
          <button
            onClick={() => setScenarioPanel(true)}
            className="flex w-8 shrink-0 flex-col items-center gap-2 border-r border-[#e3ded4] bg-[#faf8f4] py-3 text-[10px] text-[#8a8272] hover:bg-[#f1ede4]"
            title="Show tools & scenario"
          >
            <span className="[writing-mode:vertical-lr]">Tools ▸</span>
          </button>
        )}

        <main className="relative min-w-0 flex-1">
          <NeighborhoodCanvas />
          {/* sidebar collapse */}
          <button
            onClick={() => setScenarioPanel(!showScenarioPanel)}
            className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-r-md border border-l-0 border-[#e3ded4] bg-white/90 px-0.5 py-3 text-[10px] text-[#8a8272] hover:bg-white"
            title={showScenarioPanel ? "Hide tools" : "Show tools"}
          >
            {showScenarioPanel ? "◂" : "▸"}
          </button>
          <button
            onClick={() => setShowInspector(!showInspector)}
            className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-l-md border border-r-0 border-[#e3ded4] bg-white/90 px-0.5 py-3 text-[10px] text-[#8a8272] hover:bg-white"
            title={showInspector ? "Hide inspector" : "Show inspector"}
          >
            {showInspector ? "▸" : "◂"}
          </button>
        </main>

        {showInspector && <Inspector />}
      </div>
      <TimelineBar />

      <ResultsDialog />
      <CompareDialog />
      <ImportDialog />
      <AssistantPanel />
    </div>
  );
}
