"use client";

/**
 * Satellite map picker with an adjustable selection rectangle.
 * Provider: Google Maps JS (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) when the key
 * works; otherwise Leaflet + Esri World Imagery. The key is probed with a
 * 1×1 Static Maps request first so billing/auth failures fall back silently.
 * Client-only — load via next/dynamic with ssr:false.
 */

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

export type Bbox = [number, number, number, number]; // south, north, west, east
export type MapProvider = "google" | "esri";

interface Props {
  /** Fly here when it changes. */
  focus: { lat: number; lng: number; bbox: Bbox; seq: number } | null;
  bbox: Bbox | null;
  onBbox: (b: Bbox) => void;
  onProvider?: (p: MapProvider) => void;
}

const GKEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
/** Default view: DLF Phase 1, Gurugram (a plotted colony) until the user searches. */
const DEFAULT_BBOX: Bbox = [28.4705, 28.4741, 77.0952, 77.0993];
let providerPromise: Promise<MapProvider> | null = null;

function detectProvider(): Promise<MapProvider> {
  if (providerPromise) return providerPromise;
  providerPromise = new Promise<MapProvider>((resolve) => {
    if (!GKEY) return resolve("esri");
    const img = new Image();
    const timer = setTimeout(() => resolve("esri"), 4000);
    img.onload = () => {
      clearTimeout(timer);
      resolve("google");
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve("esri");
    };
    img.src = `https://maps.googleapis.com/maps/api/staticmap?center=0,0&zoom=1&size=1x1&key=${encodeURIComponent(GKEY)}`;
  }).then(
    (p) =>
      p === "esri"
        ? p
        : new Promise<MapProvider>((resolve) => {
            const w = window as unknown as Record<string, unknown>;
            if ((w.google as { maps?: unknown } | undefined)?.maps) return resolve("google");
            w.gm_authFailure = () => resolve("esri");
            w.__praesidiumGmReady = () => resolve("google");
            const s = document.createElement("script");
            s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GKEY)}&callback=__praesidiumGmReady&v=weekly`;
            s.async = true;
            s.onerror = () => resolve("esri");
            document.head.appendChild(s);
            setTimeout(() => resolve("esri"), 8000);
          })
  );
  return providerPromise;
}

export default function MapPicker({ focus, bbox, onBbox, onProvider }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [provider, setProvider] = useState<MapProvider | null>(null);
  const api = useRef<{ fly: (f: NonNullable<Props["focus"]>) => void; setRect: (b: Bbox) => void } | null>(null);
  const onBboxRef = useRef(onBbox);
  onBboxRef.current = onBbox;
  const initial = useRef({ focus, bbox });

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    detectProvider().then(async (p) => {
      if (cancelled || !el.current) return;
      setProvider(p);
      onProvider?.(p);
      const init = initial.current;
      const start = init.bbox ?? init.focus?.bbox ?? null;
      if (p === "google") cleanup = mountGoogle(el.current, start, (b) => onBboxRef.current(b), api);
      else cleanup = await mountLeaflet(el.current, start, (b) => onBboxRef.current(b), api);
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (focus && api.current) api.current.fly(focus);
  }, [focus]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-md border border-[#dcd6c8] bg-[#2a2f36]">
      <div ref={el} className="absolute inset-0" />
      {!provider && <div className="absolute inset-0 grid place-items-center text-xs text-[#c9c3b6]">Loading satellite map…</div>}
      {provider && (
        <div className="pointer-events-none absolute bottom-1 left-1 z-[500] rounded bg-black/55 px-1.5 py-0.5 text-[9px] text-white/80">
          {provider === "google" ? "Google Maps" : "Leaflet · Esri World Imagery"}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function mountGoogle(
  host: HTMLDivElement,
  start: Bbox | null,
  onBbox: (b: Bbox) => void,
  api: React.MutableRefObject<{ fly: (f: NonNullable<Props["focus"]>) => void; setRect: (b: Bbox) => void } | null>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = (window as any).google.maps;
  const b0 = start ?? DEFAULT_BBOX;
  const map = new g.Map(host, {
    center: { lat: (b0[0] + b0[1]) / 2, lng: (b0[2] + b0[3]) / 2 },
    zoom: 17,
    mapTypeId: "satellite",
    tilt: 0,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
  });
  const rect = new g.Rectangle({
    map,
    bounds: { south: b0[0], north: b0[1], west: b0[2], east: b0[3] },
    editable: true,
    draggable: true,
    strokeColor: "#f5c24b",
    strokeWeight: 2,
    fillColor: "#f5c24b",
    fillOpacity: 0.08,
  });
  const emit = () => {
    const b = rect.getBounds();
    onBbox([b.getSouthWest().lat(), b.getNorthEast().lat(), b.getSouthWest().lng(), b.getNorthEast().lng()]);
  };
  rect.addListener("bounds_changed", emit);
  map.fitBounds({ south: b0[0], north: b0[1], west: b0[2], east: b0[3] }, 30);
  if (start) emit();
  api.current = {
    fly: (f) => {
      rect.setBounds({ south: f.bbox[0], north: f.bbox[1], west: f.bbox[2], east: f.bbox[3] });
      map.fitBounds({ south: f.bbox[0], north: f.bbox[1], west: f.bbox[2], east: f.bbox[3] }, 30);
    },
    setRect: (b) => rect.setBounds({ south: b[0], north: b[1], west: b[2], east: b[3] }),
  };
  return () => {
    rect.setMap(null);
    api.current = null;
  };
}

async function mountLeaflet(
  host: HTMLDivElement,
  start: Bbox | null,
  onBbox: (b: Bbox) => void,
  api: React.MutableRefObject<{ fly: (f: NonNullable<Props["focus"]>) => void; setRect: (b: Bbox) => void } | null>
) {
  const L = (await import("leaflet")).default;
  const b0: Bbox = start ?? DEFAULT_BBOX;
  const map = L.map(host, { zoomControl: true, attributionControl: true, maxZoom: 19 });
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
  }).addTo(map);
  // faint labels overlay for orientation
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    opacity: 0.7,
  }).addTo(map);

  let cur: Bbox = b0;
  const rect = L.rectangle(
    [
      [b0[0], b0[2]],
      [b0[1], b0[3]],
    ],
    { color: "#f5c24b", weight: 2, fillOpacity: 0.08, interactive: false }
  ).addTo(map);
  const handleIcon = L.divIcon({
    className: "",
    html: '<div style="width:12px;height:12px;margin:-6px 0 0 -6px;background:#fff;border:2px solid #f5c24b;border-radius:2px;box-shadow:0 0 3px #000a"></div>',
    iconSize: [0, 0],
  });
  const moveIcon = L.divIcon({
    className: "",
    html: '<div style="width:22px;height:22px;margin:-11px 0 0 -11px;background:#f5c24bcc;border:2px solid #fff;border-radius:50%;box-shadow:0 0 3px #000a;cursor:move;display:grid;place-items:center;font:bold 12px sans-serif;color:#1d2430">✥</div>',
    iconSize: [0, 0],
  });
  // corners: 0 = SW, 1 = NW, 2 = NE, 3 = SE
  const cornerPos = (b: Bbox, i: number): [number, number] =>
    [
      [b[0], b[2]],
      [b[1], b[2]],
      [b[1], b[3]],
      [b[0], b[3]],
    ][i] as [number, number];
  const corners = [0, 1, 2, 3].map((i) => L.marker(cornerPos(b0, i), { icon: handleIcon, draggable: true }).addTo(map));
  const center = L.marker([(b0[0] + b0[1]) / 2, (b0[2] + b0[3]) / 2], { icon: moveIcon, draggable: true }).addTo(map);

  const apply = (b: Bbox, emit = true, skip?: L.Marker) => {
    cur = b;
    rect.setBounds([
      [b[0], b[2]],
      [b[1], b[3]],
    ]);
    corners.forEach((m, i) => m !== skip && m.setLatLng(cornerPos(b, i)));
    if (center !== skip) center.setLatLng([(b[0] + b[1]) / 2, (b[2] + b[3]) / 2]);
    if (emit) onBbox(b);
  };
  corners.forEach((m, i) =>
    m.on("drag", () => {
      const p = m.getLatLng();
      const opp = cornerPos(cur, (i + 2) % 4);
      apply([Math.min(p.lat, opp[0]), Math.max(p.lat, opp[0]), Math.min(p.lng, opp[1]), Math.max(p.lng, opp[1])], true, m);
    })
  );
  corners.forEach((m) => m.on("dragend", () => apply(cur)));
  center.on("drag", () => {
    const p = center.getLatLng();
    const hl = (cur[1] - cur[0]) / 2;
    const hw = (cur[3] - cur[2]) / 2;
    apply([p.lat - hl, p.lat + hl, p.lng - hw, p.lng + hw], true, center);
  });

  map.fitBounds(
    [
      [b0[0], b0[2]],
      [b0[1], b0[3]],
    ],
    { padding: [30, 30] }
  );
  if (start) onBbox(b0);
  api.current = {
    fly: (f) => {
      apply(f.bbox);
      map.fitBounds(
        [
          [f.bbox[0], f.bbox[2]],
          [f.bbox[1], f.bbox[3]],
        ],
        { padding: [30, 30] }
      );
    },
    setRect: (b) => apply(b, false),
  };
  // dialogs animate in — fix the size once layout settles
  const t = setTimeout(() => map.invalidateSize(), 250);
  const ro = new ResizeObserver(() => map.invalidateSize());
  ro.observe(host);
  return () => {
    clearTimeout(t);
    ro.disconnect();
    api.current = null;
    map.remove();
  };
}
