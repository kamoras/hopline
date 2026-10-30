"use client";

import { LngLatBounds, type ExpressionSpecification, type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Line } from "@/domain/line";
import type { Place } from "@/domain/place";
import type { Region } from "@/domain/region";
import type { DelayStatus, Trip } from "@/domain/trip";
import { lerpLatLon, type LatLon } from "@/lib/geo";
import { compileLegs, positionAt, type CompiledLeg } from "@/lib/motion";
import { REFRESH_MS } from "@/hooks/use-trips";
import { BaseMap } from "./base-map";
import { useLocate } from "./use-locate";

/** Frame rate of marker updates (~25 fps keeps it smooth without taxing the map). */
const FRAME_MS = 40;
/** Time constant for blending out a correction when fresh data arrives. */
const CORRECTION_MS = 700;

const STATUS_COLOR: Record<DelayStatus, string> = {
  "on-time": "#138a4b",
  minor: "#d98200",
  major: "#d93025",
  canceled: "#7a1f1a",
  unknown: "#6b7482",
};

interface Props {
  region: Region;
  trips: readonly Trip[];
  places: readonly Place[];
  lines: readonly Line[];
  selectedTripId?: string;
  selectedPlaceId?: string;
  onSelectTrip(id: string): void;
  onSelectPlace(id: string): void;
}

interface Motion {
  /** Schedule-based path; when present the train follows it by the clock. */
  legs?: CompiledLeg[];
  /** Otherwise: glide from `from` to `to` over `duration` ms starting at `start`. */
  from: LatLon;
  to: LatLon;
  start: number;
  duration: number;
  /** Offset between where it was drawn and where the new data says, decaying to zero. */
  corr: LatLon;
  corrAt: number;
}

function motionPosition(m: Motion, now: number): LatLon {
  if (m.legs) {
    const base = positionAt(m.legs, now) ?? m.to;
    const k = Math.exp(-(now - m.corrAt) / CORRECTION_MS);
    return { lat: base.lat + m.corr.lat * k, lon: base.lon + m.corr.lon * k };
  }
  return lerpLatLon(m.from, m.to, m.duration > 0 ? (now - m.start) / m.duration : 1);
}

const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
const byZoom = (a: number, b: number, c: number): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], 6, a, 9, b, 12, c];

function tripFeatures(trips: readonly Trip[], at: Map<string, LatLon>): FeatureCollection {
  const features: Feature[] = [];
  for (const t of trips) {
    const p = at.get(t.id);
    if (p) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: { id: t.id, number: t.number, status: t.delayStatus },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

function lineFeatures(lines: readonly Line[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: lines.map((l) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: l.coords },
      properties: { name: l.name, color: l.color },
    })),
  };
}

function placeFeatures(places: readonly Place[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { id: p.id, name: p.name },
    })),
  };
}

export default function TripMap({ region, trips, places, lines, selectedTripId, selectedPlaceId, onSelectTrip, onSelectPlace }: Props) {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const shown = useRef(new Map<string, LatLon>());
  const motions = useRef(new Map<string, Motion>());
  const raf = useRef(0);
  const fitted = useRef(false);
  const handlers = useRef({ onSelectTrip, onSelectPlace });
  const locate = useLocate(map);

  useEffect(() => {
    handlers.current = { onSelectTrip, onSelectPlace };
  }, [onSelectTrip, onSelectPlace]);

  const setup = useCallback((m: MapLibreMap) => {
    m.addSource("lines", { type: "geojson", data: empty });
    m.addSource("places", { type: "geojson", data: empty });
    m.addSource("trips", { type: "geojson", data: empty });
    // Track geometry sits underneath everything, in each line's own color.
    m.addLayer({
      id: "rail-lines",
      type: "line",
      source: "lines",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-width": byZoom(1.5, 3, 5), "line-opacity": 0.7 },
    });
    m.addLayer({
      id: "place-dots",
      type: "circle",
      source: "places",
      paint: {
        "circle-radius": byZoom(2.5, 4.5, 6),
        "circle-color": "#ffffff",
        "circle-stroke-color": "#1f6feb",
        "circle-stroke-width": 1.5,
      },
    });
    m.addLayer({
      id: "place-labels",
      type: "symbol",
      source: "places",
      minzoom: 9.5,
      layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top" },
      paint: { "text-color": "#33405a", "text-halo-color": "#ffffff", "text-halo-width": 1.4 },
    });
    m.addLayer({
      id: "selected-ring",
      type: "circle",
      source: "trips",
      filter: ["==", ["get", "id"], ""],
      paint: { "circle-radius": byZoom(10, 15, 21), "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#1f6feb", "circle-stroke-width": 3 },
    });
    m.addLayer({
      id: "trip-dots",
      type: "circle",
      source: "trips",
      paint: {
        "circle-radius": byZoom(5, 10, 14),
        "circle-color": ["match", ["get", "status"], ...Object.entries(STATUS_COLOR).flat(), STATUS_COLOR.unknown] as unknown as ExpressionSpecification,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2.5,
      },
    });
    m.addLayer({
      id: "trip-labels",
      type: "symbol",
      source: "trips",
      minzoom: 9, // numbers only fit once dots are large enough
      layout: { "text-field": ["get", "number"], "text-font": ["Noto Sans Bold"], "text-size": 10.5, "text-allow-overlap": true, "text-ignore-placement": true },
      paint: { "text-color": "#ffffff" },
    });

    const click = (layers: string[], pick: (id: string) => void) => {
      for (const layer of layers) {
        m.on("click", layer, (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (typeof id === "string") pick(id);
        });
        m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
      }
    };
    click(["trip-dots", "trip-labels"], (id) => handlers.current.onSelectTrip(id));
    click(["place-dots", "place-labels"], (id) => handlers.current.onSelectPlace(id));
    setMap(m);
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  useEffect(() => {
    (map?.getSource("places") as GeoJSONSource | undefined)?.setData(placeFeatures(places));
  }, [map, places]);

  useEffect(() => {
    (map?.getSource("lines") as GeoJSONSource | undefined)?.setData(lineFeatures(lines));
  }, [map, lines]);

  // Keep every train moving between data refreshes. Trains with a schedule-based path follow it by
  // the clock; point-only trains (GPS) glide toward their latest report over the refresh interval.
  // When fresh data disagrees with where a train is drawn, the difference is blended out over a
  // moment rather than snapped, so nothing visibly jumps.
  useEffect(() => {
    const source = map?.getSource("trips") as GeoJSONSource | undefined;
    if (!map || !source) return;
    const t = Date.now();
    const next = new Map<string, Motion>();
    for (const trip of trips) {
      if (!trip.position) continue;
      const prev = shown.current.get(trip.id);
      const at: LatLon = { lat: trip.position.lat, lon: trip.position.lon };
      const legs = trip.motion?.length ? compileLegs(trip.motion) : undefined;
      if (legs) {
        const target = positionAt(legs, t) ?? at;
        next.set(trip.id, { legs, from: at, to: at, start: t, duration: 0, corr: prev ? { lat: prev.lat - target.lat, lon: prev.lon - target.lon } : { lat: 0, lon: 0 }, corrAt: t });
      } else {
        next.set(trip.id, { from: prev ?? at, to: at, start: t, duration: REFRESH_MS, corr: { lat: 0, lon: 0 }, corrAt: t });
      }
    }
    motions.current = next;

    if (!fitted.current && next.size > 0) {
      // Frame the action once, on first data; after that the user is in control.
      fitted.current = true;
      const b = new LngLatBounds();
      next.forEach((m) => b.extend([m.to.lon, m.to.lat]));
      map.fitBounds(b, { padding: 56, maxZoom: 10, duration: 0 });
    }

    const draw = () => {
      const now = Date.now();
      const current = new Map<string, LatLon>();
      for (const [id, m] of motions.current) current.set(id, motionPosition(m, now));
      shown.current = current;
      source.setData(tripFeatures(trips, current));
    };

    draw();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last >= FRAME_MS) {
        last = ts;
        draw();
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [map, trips]);

  // Fly to a newly selected trip or station; not on every data refresh.
  useEffect(() => {
    if (!map) return;
    map.setFilter("selected-ring", ["==", ["get", "id"], selectedTripId ?? ""]);
    const pos = trips.find((t) => t.id === selectedTripId)?.position;
    if (pos) map.easeTo({ center: [pos.lon, pos.lat], zoom: Math.max(map.getZoom(), 10), duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedTripId]);

  useEffect(() => {
    const p = places.find((x) => x.id === selectedPlaceId);
    if (map && p) map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 11), duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedPlaceId]);

  return (
    <BaseMap bounds={region.bounds} onReady={setup}>
      <button
        type="button"
        onClick={locate.toggle}
        className={`absolute bottom-6 left-3 rounded-full border border-line px-4 py-2 text-sm font-semibold shadow-lg ${locate.state === "on" ? "bg-accent text-white" : "bg-surface"}`}
        title="Your location stays on this device"
      >
        {locate.label}
      </button>
      <Legend />
    </BaseMap>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["On time", STATUS_COLOR["on-time"]],
    ["Late", STATUS_COLOR.minor],
    ["15+ min", STATUS_COLOR.major],
  ];
  return (
    <div className="absolute top-3 left-3 flex gap-3 rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs font-medium shadow">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}
