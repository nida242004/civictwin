import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — backend health + feature configuration status.
 * Never exposes secret values, only whether they are configured.
 */
export async function GET() {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
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
