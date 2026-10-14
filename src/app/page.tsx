"use client";

/**
 * Praesidium — root single-page application.
 * Screen switching is client-side state (welcome ↔ editor); the whole
 * product lives on the `/` route.
 */

import dynamic from "next/dynamic";
import WelcomeScreen from "@/components/editor/WelcomeScreen";
import { useEditor } from "@/lib/store/editor";

const EditorShell = dynamic(() => import("@/components/editor/EditorShell"), {
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
  return screen === "editor" ? <EditorShell /> : <WelcomeScreen />;
}
