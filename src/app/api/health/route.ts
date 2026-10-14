import { NextResponse } from "next/server";
import { geminiConfigured as hasGemini } from "@/lib/ai/gemini";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — backend health + feature configuration status.
 * Never exposes secret values, only whether they are configured.
 */
export async function GET() {
  const geminiConfigured = hasGemini();
  const zaiConfigured = true; // z-ai-web-dev-sdk is bundled with the runtime
  const osmConfigured = true; // public endpoints with optional env overrides

  return NextResponse.json({
    ok: true,
    service: "praesidium-backend",
    time: new Date().toISOString(),
    features: {
      aiProvider: geminiConfigured ? "gemini" : zaiConfigured ? "z-ai" : "none",
      geminiConfigured,
      geoSearch: osmConfigured,
      geoImport: osmConfigured,
    },
  });
}
