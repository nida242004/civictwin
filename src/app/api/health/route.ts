import { NextResponse } from "next/server";
import { geminiConfigured as hasGemini } from "@/lib/ai/gemini";
import { jevConfigured } from "@/lib/ai/typesafe";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness + feature availability (Cloud Run probe friendly).
 * Reports only WHETHER providers are configured, never key values or counts
 * that would help enumerate secrets. Read at request time (runtime env).
 */
export async function GET() {
  const geminiConfigured = hasGemini();
  const typesafeConfigured = jevConfigured();
  const googleMapsServer = Boolean(process.env.GOOGLE_MAPS_API_KEY);

  return NextResponse.json(
    {
      ok: true,
      service: "praesidium",
      version: process.env.npm_package_version ?? "0.2.1",
      time: new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      features: {
        // planning assistant: Gemini → rule-based fallback (always available)
        aiProvider: geminiConfigured ? "gemini" : "rules",
        geminiConfigured,
        typesafeJevConfigured: typesafeConfigured,
        satelliteImagery: googleMapsServer ? "google+esri" : "esri",
        streetMap: "esri",
        geoSearch: true,
        geoImport: true,
      },
      fallbacks: {
        assistant: "deterministic rule-based proposals",
        visionLayout: geminiConfigured ? null : "OpenStreetMap-only import + estimated layout",
        localIntel: geminiConfigured ? null : "disabled (simulation unaffected)",
        jevPolicy: typesafeConfigured ? null : "pre-baked / hand-tuned behaviour tables",
        narration: geminiConfigured ? null : "deterministic caption lines",
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
