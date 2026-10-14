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

const loadEditor = () => import("@/components/editor/EditorShell");

const EditorShell = dynamic(loadEditor, {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-[#f7f5f1]">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#dcd6c8] border-t-[#2e7d5b]" />
        <div className="mt-3 text-sm text-[#8a8272]">Loading Praesidium workspace…</div>
      </div>
    </div>
  ),
});

export default function Home() {
  const screen = useEditor((s) => s.screen);

  // warm the editor chunk once the landing page has painted and the browser is idle
  useEffect(() => {
    const w = window as any;
    const run = () => void loadEditor().catch(() => {});
    const id: number = w.requestIdleCallback ? w.requestIdleCallback(run, { timeout: 4000 }) : window.setTimeout(run, 2500);
    return () => (w.requestIdleCallback ? w.cancelIdleCallback?.(id) : window.clearTimeout(id));
  }, []);

  if (screen === "editor") return <EditorShell />;
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
