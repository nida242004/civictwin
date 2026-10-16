"use client";

/**
 * Praesidium — root single-page application.
 * Screen switching is client-side state (welcome ↔ editor); the whole
 * product lives on the `/` route. The editor (three, recharts, ...) is a
 * separate chunk that is prefetched on idle / hover of the launch buttons.
 */

import { useEffect } from "react";
import dynamic from "next/dynamic";
import WelcomeScreen from "@/components/editor/WelcomeScreen";
import { useEditor } from "@/lib/store/editor";
import ErrorBoundary from "@/components/ErrorBoundary";

const loadEditor = () => import("@/components/editor/EditorShell");

const EditorShell = dynamic(loadEditor, {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

/** Editor-shaped placeholder while the workspace chunk (three.js etc.) downloads. */
function EditorSkeleton() {
  const bar = "rounded bg-[#e9e4d8] animate-pulse";
  return (
    <div className="flex h-screen flex-col bg-[#f7f5f1]" aria-busy="true" aria-label="Loading Praesidium workspace">
      <div className="flex h-14 items-center gap-3 border-b border-[#e3ded4] bg-white px-3">
        <div className={`h-7 w-7 ${bar}`} />
        <div className={`h-4 w-40 ${bar}`} />
        <div className="ml-auto flex gap-2">
          {[64, 56, 56, 110, 110].map((w, i) => (
            <div key={i} className={`h-8 ${bar}`} style={{ width: w }} />
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-60 shrink-0 space-y-2 border-r border-[#e3ded4] bg-[#faf8f4] p-3 md:block">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className={`h-7 ${bar}`} />
          ))}
          <div className={`mt-4 h-16 ${bar}`} />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`h-3 ${bar}`} />
          ))}
        </div>
        <div className="grid min-w-0 flex-1 place-items-center bg-[#0b1220]">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#5fd3b0]" />
            <div className="mt-3 text-sm text-slate-400">Loading Praesidium workspace…</div>
          </div>
        </div>
        <div className="hidden w-64 shrink-0 space-y-2 border-l border-[#e3ded4] bg-[#faf8f4] p-3 lg:block">
          <div className={`h-3 w-20 ${bar}`} />
          <div className={`h-20 ${bar}`} />
          <div className={`h-28 ${bar}`} />
        </div>
      </div>
      <div className="flex h-14 items-center gap-3 border-t border-[#e3ded4] bg-white px-3">
        <div className={`h-8 w-24 ${bar}`} />
        <div className={`h-2 flex-1 ${bar}`} />
        <div className={`h-7 w-24 ${bar}`} />
      </div>
    </div>
  );
}

export default function Home() {
  const screen = useEditor((s) => s.screen);

  // warm the editor chunk once the landing page has painted and the browser is idle
  useEffect(() => {
    const w = window as any;
    const run = () => void loadEditor().catch(() => {});
    const id: number = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 4000 }) : window.setTimeout(run, 2500);
    return () => (w.requestIdleCallback ? w.cancelIdleCallback?.(id) : window.clearTimeout(id));
  }, []);

  if (screen === "editor")
    return (
      <ErrorBoundary variant="editor" onHome={() => useEditor.getState().openWelcome()}>
        <EditorShell />
      </ErrorBoundary>
    );
  return (
    <div
      onPointerOver={(e) => {
        const b = (e.target as HTMLElement).closest?.("button");
        if (b && /launch|demo|build/i.test(b.textContent ?? "")) void loadEditor().catch(() => {});
      }}
    >
      <WelcomeScreen />
    </div>
  );
}
