/**
 * Server-only satellite capture: fetch imagery tiles for a bbox, stitch and
 * crop them with sharp so the output JPEG covers exactly [south,north,west,east].
 *
 * Providers: Google Static Maps (when GOOGLE_MAPS_API_KEY works) → Esri World
 * Imagery tiles (no key). Over a few hundred meters the Web-Mercator crop is
 * indistinguishable from the app's local equirectangular projection, so
 * image pixel (u,v) maps linearly to local meters across world bounds.
 */

import { createRequire } from "module";
import path from "path";
import type SharpNs from "sharp";

// Load sharp at runtime (Turbopack under Bun mis-resolves its hashed external for native modules).
type SharpFn = typeof SharpNs;
let sharpMod: SharpFn | null = null;
function sharp(input?: Buffer | { create: SharpNs.Create }): SharpNs.Sharp {
  if (!sharpMod) sharpMod = createRequire(path.join(process.cwd(), "package.json"))("sharp") as SharpFn;
  return input && !Buffer.isBuffer(input) ? sharpMod(input) : sharpMod(input as Buffer);
}

export const MAX_SAT_PX = 1280;
const TILE = 256;
const MAX_TILES = 64;

export interface SatelliteCapture {
  jpeg: Buffer;
  width: number;
  height: number;
  zoom: number;
  provider: "google" | "esri";
  attribution: string;
}

function lonToPx(lon: number, z: number) {
  return ((lon + 180) / 360) * TILE * 2 ** z;
}
function latToPx(lat: number, z: number) {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
}

async function fetchBuf(url: string, timeoutMs = 12000): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Praesidium/1.0 (residential safety planning prototype)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`imagery HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.startsWith("image/")) throw new Error("imagery provider returned a non-image response");
  return Buffer.from(await res.arrayBuffer());
}

async function finish(img: SharpNs.Sharp, w: number, h: number) {
  const scale = Math.min(1, MAX_SAT_PX / Math.max(w, h));
  const ow = Math.max(1, Math.round(w * scale));
  const oh = Math.max(1, Math.round(h * scale));
  const jpeg = await img.resize(ow, oh).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
  return { jpeg, width: ow, height: oh };
}

async function captureEsri(s: number, n: number, w: number, e: number): Promise<SatelliteCapture> {
  let z = 19;
  for (; z > 14; z--) {
    const tx = Math.floor(lonToPx(e, z) / TILE) - Math.floor(lonToPx(w, z) / TILE) + 1;
    const ty = Math.floor(latToPx(s, z) / TILE) - Math.floor(latToPx(n, z) / TILE) + 1;
    if (tx * ty <= MAX_TILES) break;
  }
  const x0 = lonToPx(w, z);
  const x1 = lonToPx(e, z);
  const y0 = latToPx(n, z);
  const y1 = latToPx(s, z);
  const tx0 = Math.floor(x0 / TILE);
  const tx1 = Math.floor(x1 / TILE);
  const ty0 = Math.floor(y0 / TILE);
  const ty1 = Math.floor(y1 / TILE);
  const jobs: Promise<{ input: Buffer; left: number; top: number } | null>[] = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`;
      jobs.push(
        fetchBuf(url)
          .then((input) => ({ input, left: (tx - tx0) * TILE, top: (ty - ty0) * TILE }))
          .catch(() => null)
      );
    }
  }
  const tiles = (await Promise.all(jobs)).filter((t): t is NonNullable<typeof t> => t !== null);
  if (!tiles.length) throw new Error("Esri imagery tiles could not be fetched");
  const mosaicW = (tx1 - tx0 + 1) * TILE;
  const mosaicH = (ty1 - ty0 + 1) * TILE;
  const mosaic = await sharp({ create: { width: mosaicW, height: mosaicH, channels: 3, background: "#4a5148" } })
    .composite(tiles)
    .png()
    .toBuffer();
  const left = Math.max(0, Math.floor(x0 - tx0 * TILE));
  const top = Math.max(0, Math.floor(y0 - ty0 * TILE));
  const cw = Math.max(1, Math.min(mosaicW - left, Math.round(x1 - x0)));
  const ch = Math.max(1, Math.min(mosaicH - top, Math.round(y1 - y0)));
  const out = await finish(sharp(mosaic).extract({ left, top, width: cw, height: ch }), cw, ch);
  return { ...out, zoom: z, provider: "esri", attribution: "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community" };
}

async function captureGoogle(s: number, n: number, w: number, e: number, key: string): Promise<SatelliteCapture> {
  // scale=2 → 1280px max image; choose the largest zoom where the bbox fits in 640 logical px
  let z = 20;
  for (; z > 14; z--) {
    if (lonToPx(e, z) - lonToPx(w, z) <= 620 && latToPx(s, z) - latToPx(n, z) <= 620) break;
  }
  const cLat = (s + n) / 2;
  const cLon = (w + e) / 2;
  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${cLat},${cLon}&zoom=${z}&size=640x640&scale=2&maptype=satellite&format=jpg&key=${encodeURIComponent(key)}`;
  const buf = await fetchBuf(url);
  const cx = lonToPx(cLon, z);
  const cy = latToPx(cLat, z);
  const left = Math.max(0, Math.round((lonToPx(w, z) - cx + 320) * 2));
  const top = Math.max(0, Math.round((latToPx(n, z) - cy + 320) * 2));
  const cw = Math.min(1280 - left, Math.round((lonToPx(e, z) - lonToPx(w, z)) * 2));
  const ch = Math.min(1280 - top, Math.round((latToPx(s, z) - latToPx(n, z)) * 2));
  const out = await finish(sharp(buf).extract({ left, top, width: cw, height: ch }), cw, ch);
  return { ...out, zoom: z, provider: "google", attribution: "Imagery © Google" };
}

export async function captureSatellite(s: number, n: number, w: number, e: number): Promise<SatelliteCapture> {
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (key) {
    try {
      return await captureGoogle(s, n, w, e, key);
    } catch {
      // billing disabled / quota / network — fall through to Esri
    }
  }
  return captureEsri(s, n, w, e);
}

/** Downscale an image (for faster model analysis) to fit maxPx, as JPEG. */
export async function downscaleJpeg(buf: Buffer, maxPx = 768): Promise<Buffer> {
  return sharp(buf).resize(maxPx, maxPx, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
}

/** Local-meter span of a bbox (same projection as convertOsmToWorld). */
export function bboxMeters(s: number, n: number, w: number, e: number) {
  const lat0 = (s + n) / 2;
  return {
    width: (e - w) * Math.cos((lat0 * Math.PI) / 180) * 111320,
    depth: (n - s) * 111320,
  };
}
