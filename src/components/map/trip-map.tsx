"use client";

import { LngLatBounds, type ExpressionSpecification, type GeoJSONSource, type Map as MapLibreMap, type MapLayerMouseEvent } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Line } from "@/domain/line";
import type { Place } from "@/domain/place";
import type { Region } from "@/domain/region";
import type { DelayStatus, Trip } from "@/domain/trip";
import { REFRESH_MS } from "@/hooks/use-trips";
import { bearing, lerpLatLon, type LatLon } from "@/lib/geo";
import { compileLegs, locate as locateOnLeg, positionAt, type CompiledLeg } from "@/lib/motion";
import { project } from "@/lib/polyline";
import { BaseMap } from "./base-map";
import { groupStacks, type Stack } from "./stacking";
import { installTrainIcons, vehicleIconId } from "./train-icon";
import { useLocate } from "./use-locate";

/** Frame rate of marker updates (~25 fps keeps it smooth without taxing the map). */
const FRAME_MS = 40;
/** How far past the screen edge (as a fraction of its size) trains are still moved, so they are ready when panned in. */
const VIEW_MARGIN = 0.25;
/** Time constant for blending out a correction when fresh data arrives. */
const CORRECTION_MS = 700;
/** A drawn train further than this from the new path is snapped to it instead of slid along it. */
const SLIDE_MAX_OFF_M = 120;
/** Below this zoom, crowds of on-time trains collapse into counted stacks. */
const STACK_MAX_ZOOM = 11.5;
const STACK_RADIUS_PX = 16;
/** Zoom at which trains switch from tiny dots to oriented train glyphs, and get number labels. */
const GLYPH_MIN_ZOOM = 9;
const LABEL_MIN_ZOOM = 11.5;

/**
 * Trains that are fine wear their line's color and stay quiet; problems take a status color and a
 * glow, so trouble stands out in a crowd.
 */
const PROBLEM_COLOR: Record<Exclude<DelayStatus, "on-time">, string> = {
  minor: "#e08a00",
  major: "#d93025",
  canceled: "#7a1f1a",
  unknown: "#6b7482",
};
/** On time, or no delay information at all: nothing to flag, so the train stays quiet in its line color. */
const isQuiet = (t: Trip) => t.delayStatus === "on-time" || t.delayStatus === "unknown";
const tripColor = (t: Trip) => (isQuiet(t) ? t.routeColor : PROBLEM_COLOR[t.delayStatus as keyof typeof PROBLEM_COLOR]);
const isProblem = (t: Trip) => !isQuiet(t);

interface Props {
  region: Region;
  trips: readonly Trip[];
  places: readonly Place[];
  lines: readonly Line[];
  /** Frame the trains on first data (default). A big network leaves the camera alone: the person chose where to look. */
  frameTrips?: boolean;
  /** When this changes, frame all the lines on screen (a route was just chosen). */
  fitLinesKey?: string;
  /** Reports where the map is looking (after each pan or zoom): other modes open the same place, big networks load that part. */
  onViewChange?(view: MapView): void;
  /** Whether this mode reports lateness; if not, there is no late/on-time legend. */
  showDelays?: boolean;
  selectedTripId?: string;
  selectedPlaceId?: string;
  onSelectTrip(id: string): void;
  onSelectPlace(id: string): void;
}

type Placed = LatLon & { heading: number };

interface Motion {
  /** Schedule-based path; when present the train follows it by the clock. */
  legs?: CompiledLeg[];
  /** Otherwise: glide from `from` to `to` over `duration` ms starting at `start`. */
  from: LatLon;
  to: LatLon;
  start: number;
  duration: number;
  /**
   * How far (meters) along its track the train was drawn from where the new data says it is, decaying to
   * zero. Measured along the track so easing toward corrected data never leaves the rails.
   */
  shift: number;
  /** When the correction started, for decay. */
  shiftAt: number;
  /** Heading to use when the path gives none. */
  heading: number;
}

function motionPosition(m: Motion, now: number): Placed {
  if (m.legs) {
    const k = Math.exp(-(now - m.shiftAt) / CORRECTION_MS);
    return positionAt(m.legs, now, m.shift * k) ?? { ...m.to, heading: m.heading };
  }
  const p = lerpLatLon(m.from, m.to, m.duration > 0 ? (now - m.start) / m.duration : 1);
  const moved = Math.hypot(m.to.lat - m.from.lat, m.to.lon - m.from.lon) > 1e-4; // ~10 m
  return { ...p, heading: moved ? bearing(m.from, m.to) : m.heading };
}

/** What part of the world the map is showing. */
export interface MapView {
  center: LatLon;
  /** [west, south, east, north]. */
  bbox: [number, number, number, number];
  zoom: number;
}

const empty: FeatureCollection = { type: "FeatureCollection", features: [] };
const byZoom = (a: number, b: number, c: number, z = [6, 9, 12]): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], z[0]!, a, z[1]!, b, z[2]!, c];

function tripFeatures(trips: readonly Trip[], at: Map<string, Placed>, stacked: ReadonlySet<string>, pulse: number): FeatureCollection {
  const features: Feature[] = [];
  for (const t of trips) {
    const p = at.get(t.id);
    if (!p || stacked.has(t.id)) continue;
    const color = tripColor(t);
    const problem = isProblem(t);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: {
        id: t.id,
        number: t.number,
        status: t.delayStatus,
        color,
        icon: vehicleIconId(t.mode, color, problem),
        heading: p.heading,
        scale: problem ? 1.25 : 0.95,
        pulse: problem ? pulse : 0,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

function stackFeatures(stacks: readonly Stack[], at: Map<string, Placed>): FeatureCollection {
  const features: Feature[] = [];
  for (const s of stacks) {
    const pts = s.ids.map((id) => at.get(id)).filter((p): p is Placed => !!p);
    if (!pts.length) continue;
    const lat = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
    const lon = pts.reduce((a, p) => a + p.lon, 0) / pts.length;
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { count: pts.length } });
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

/** Quiet the basemap so the network is the focus, like a transit diagram. Runs before our layers are added. */
function mutedBasemap(map: MapLibreMap) {
  for (const layer of map.getStyle().layers) {
    try {
      if (layer.type === "fill") map.setPaintProperty(layer.id, "fill-opacity", 0.55);
      else if (layer.type === "line") map.setPaintProperty(layer.id, "line-opacity", 0.45);
      else if (layer.type === "symbol") {
        map.setPaintProperty(layer.id, "text-opacity", 0.7);
        map.setPaintProperty(layer.id, "icon-opacity", 0.55);
      }
    } catch {
      // A layer whose paint can't be changed is simply left as it is.
    }
  }
}

export default function TripMap({ region, trips, places, lines, fitLinesKey, frameTrips = true, onViewChange, showDelays = true, selectedTripId, selectedPlaceId, onSelectTrip, onSelectPlace }: Props) {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const shown = useRef(new Map<string, Placed>());
  const motions = useRef(new Map<string, Motion>());
  const stacks = useRef<Stack[]>([]);
  const stacked = useRef(new Set<string>());
  const selectedRef = useRef(selectedTripId);
  const raf = useRef(0);
  const fitted = useRef(false);
  const handlers = useRef({ onSelectTrip, onSelectPlace });
  const locate = useLocate(map);

  useEffect(() => {
    handlers.current = { onSelectTrip, onSelectPlace };
    selectedRef.current = selectedTripId;
  }, [onSelectTrip, onSelectPlace, selectedTripId]);

  const setup = useCallback((m: MapLibreMap) => {
    mutedBasemap(m);
    installTrainIcons(m);
    for (const id of ["lines", "places", "trips", "stacks"]) m.addSource(id, { type: "geojson", data: empty });

    // The network: a white casing under a thick colored line, like a transit diagram.
    m.addLayer({
      id: "rail-casing",
      type: "line",
      source: "lines",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": byZoom(4, 7, 11, [6, 10, 13]), "line-opacity": 0.95 },
    });
    m.addLayer({
      id: "rail-lines",
      type: "line",
      source: "lines",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": ["get", "color"], "line-width": byZoom(2.2, 4.5, 7.5, [6, 10, 13]) },
    });
    // Stations: white rings with a dark outline.
    m.addLayer({
      id: "place-dots",
      type: "circle",
      source: "places",
      paint: {
        "circle-radius": byZoom(2.2, 4.2, 6.5, [7, 10, 13]),
        "circle-color": "#ffffff",
        "circle-stroke-color": "#1b2a41",
        "circle-stroke-width": byZoom(1, 1.6, 2.2, [7, 10, 13]),
      },
    });
    m.addLayer({
      id: "place-labels",
      type: "symbol",
      source: "places",
      minzoom: 10,
      layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.2], "text-anchor": "top" },
      paint: { "text-color": "#1b2a41", "text-halo-color": "#ffffff", "text-halo-width": 1.6 },
    });
    // Problems glow and pulse beneath everything else on the trains.
    m.addLayer({
      id: "trip-glow",
      type: "circle",
      source: "trips",
      filter: ["in", ["get", "status"], ["literal", ["minor", "major", "canceled"]]],
      paint: {
        "circle-color": ["get", "color"],
        "circle-blur": 0.9,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, ["+", 6, ["*", 3, ["get", "pulse"]]], 12, ["+", 16, ["*", 7, ["get", "pulse"]]]],
        "circle-opacity": ["*", 0.6, ["-", 1, ["*", 0.6, ["get", "pulse"]]]],
      },
    });
    m.addLayer({
      id: "selected-ring",
      type: "circle",
      source: "trips",
      filter: ["==", ["get", "id"], ""],
      paint: { "circle-radius": byZoom(9, 14, 20), "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#1f6feb", "circle-stroke-width": 3 },
    });
    // Zoomed out: tiny dots. Closer: oriented train glyphs. Quiet when fine, larger when not.
    m.addLayer({
      id: "trip-dots",
      type: "circle",
      source: "trips",
      maxzoom: GLYPH_MIN_ZOOM,
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, ["*", 2.4, ["get", "scale"]], 9, ["*", 3.6, ["get", "scale"]]],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.2,
      },
    });
    m.addLayer({
      id: "trip-icons",
      type: "symbol",
      source: "trips",
      minzoom: GLYPH_MIN_ZOOM,
      layout: {
        "icon-image": ["get", "icon"],
        "icon-rotate": ["-", ["get", "heading"], 90], // the sprite points east
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-size": [
          "interpolate", ["linear"], ["zoom"],
          GLYPH_MIN_ZOOM, ["*", 0.5, ["get", "scale"]],
          12, ["*", 0.85, ["get", "scale"]],
          15, ["*", 1.3, ["get", "scale"]],
        ],
      },
    });
    m.addLayer({
      id: "trip-labels",
      type: "symbol",
      source: "trips",
      minzoom: LABEL_MIN_ZOOM,
      layout: { "text-field": ["get", "number"], "text-font": ["Noto Sans Bold"], "text-size": 10.5, "text-offset": [0, -1.5], "text-allow-overlap": true, "text-ignore-placement": true },
      paint: { "text-color": "#1b2a41", "text-halo-color": "#ffffff", "text-halo-width": 1.8 },
    });
    // Crowds of on-time trains collapse into counted stacks until you zoom in.
    m.addLayer({
      id: "stack-dots",
      type: "circle",
      source: "stacks",
      paint: { "circle-radius": 12, "circle-color": "#ffffff", "circle-stroke-color": "#1b2a41", "circle-stroke-width": 2 },
    });
    m.addLayer({
      id: "stack-labels",
      type: "symbol",
      source: "stacks",
      layout: { "text-field": ["to-string", ["get", "count"]], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-allow-overlap": true },
      paint: { "text-color": "#1b2a41" },
    });

    const interactive = (layers: string[], onClick: (e: MapLayerMouseEvent) => void) => {
      for (const layer of layers) {
        m.on("click", layer, onClick);
        m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
      }
    };
    const pickId = (e: MapLayerMouseEvent) => e.features?.[0]?.properties?.id as string | undefined;
    interactive(["trip-dots", "trip-icons", "trip-labels"], (e) => {
      const id = pickId(e);
      if (id) handlers.current.onSelectTrip(id);
    });
    interactive(["place-dots", "place-labels"], (e) => {
      const id = pickId(e);
      if (id) handlers.current.onSelectPlace(id);
    });
    interactive(["stack-dots", "stack-labels"], (e) => m.easeTo({ center: e.lngLat, zoom: Math.min(m.getZoom() + 1.8, 13), duration: 600 }));
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
    const tripsSource = map?.getSource("trips") as GeoJSONSource | undefined;
    const stacksSource = map?.getSource("stacks") as GeoJSONSource | undefined;
    if (!map || !tripsSource || !stacksSource) return;
    const t = Date.now();
    const next = new Map<string, Motion>();
    for (const trip of trips) {
      if (!trip.position) continue;
      const prev = shown.current.get(trip.id);
      const at: LatLon = { lat: trip.position.lat, lon: trip.position.lon };
      const heading = trip.position.heading ?? prev?.heading ?? 0;
      const legs = trip.motion?.length ? compileLegs(trip.motion) : undefined;
      if (legs) {
        // Ease from where the train was drawn to where the new data puts it, along the track. If it was
        // drawn nowhere near the new path (a different trip, a big revision), snap rather than slide across land.
        const target = locateOnLeg(legs, t);
        let shift = 0;
        if (prev && target) {
          const onPath = project(target.leg.line, prev);
          if (onPath.offMeters <= SLIDE_MAX_OFF_M) shift = onPath.along - target.along;
        }
        next.set(trip.id, { legs, from: at, to: at, start: t, duration: 0, shift, shiftAt: t, heading });
      } else {
        next.set(trip.id, { from: prev ?? at, to: at, start: t, duration: REFRESH_MS, shift: 0, shiftAt: t, heading });
      }
    }
    motions.current = next;

    if (!fitted.current && next.size > 0 && frameTrips) {
      // Frame the action once, on first data; after that the user is in control.
      fitted.current = true;
      const b = new LngLatBounds();
      next.forEach((m) => b.extend([m.to.lon, m.to.lat]));
      map.fitBounds(b, { padding: 56, maxZoom: 10, duration: 0 });
    }

    // Stacks are decided when data or zoom changes, not every frame, so membership never flickers.
    const regroup = () => {
      if (map.getZoom() >= STACK_MAX_ZOOM) {
        stacks.current = [];
        stacked.current = new Set();
        return;
      }
      const points = trips.flatMap((trip) => {
        const p = shown.current.get(trip.id);
        if (!p) return [];
        const px = map.project([p.lon, p.lat]);
        return [{ id: trip.id, x: px.x, y: px.y, pinned: isProblem(trip) || trip.id === selectedRef.current }];
      });
      stacks.current = groupStacks(points, STACK_RADIUS_PX);
      stacked.current = new Set(stacks.current.flatMap((s) => s.ids));
    };

    // Only trains on (or near) screen are moved and drawn each frame, so a continent of trains costs what the
    // visible part of it costs. The selected train is always kept.
    const visible = () => {
      const b = map.getBounds();
      const [dw, dh] = [(b.getEast() - b.getWest()) * VIEW_MARGIN, (b.getNorth() - b.getSouth()) * VIEW_MARGIN];
      return new LngLatBounds([b.getWest() - dw, b.getSouth() - dh], [b.getEast() + dw, b.getNorth() + dh]);
    };

    const draw = () => {
      const now = Date.now();
      const placed = new Map<string, Placed>();
      const view = visible();
      for (const [id, m] of motions.current) {
        if (id === selectedRef.current || view.contains([m.to.lon, m.to.lat])) placed.set(id, motionPosition(m, now));
      }
      shown.current = placed;
      tripsSource.setData(tripFeatures(trips, placed, stacked.current, (Math.sin(now / 450) + 1) / 2));
      stacksSource.setData(stackFeatures(stacks.current, placed));
    };

    shown.current = new Map([...next].map(([id, m]) => [id, motionPosition(m, t)]));
    // Panning or zooming brings other trains into view and changes how they stack.
    const refresh = () => {
      draw();
      regroup();
      draw();
    };
    refresh();
    map.on("moveend", refresh);
    const stop = () => {
      cancelAnimationFrame(raf.current);
      map.off("moveend", refresh);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return stop;
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last >= FRAME_MS) {
        last = ts;
        draw();
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return stop;
  }, [map, trips, frameTrips]);

  const fitted_ = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!map || !fitLinesKey || lines.length === 0 || fitted_.current === fitLinesKey) return;
    fitted_.current = fitLinesKey;
    const b = new LngLatBounds();
    for (const l of lines) for (const c of l.coords) b.extend(c);
    map.fitBounds(b, { padding: 64, maxZoom: 14, duration: 600 });
  }, [map, lines, fitLinesKey]);

  useEffect(() => {
    if (!map || !onViewChange) return;
    const report = () => {
      const b = map.getBounds();
      onViewChange({ center: { lat: map.getCenter().lat, lon: map.getCenter().lng }, bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], zoom: map.getZoom() });
    };
    report();
    map.on("moveend", report);
    return () => {
      map.off("moveend", report);
    };
  }, [map, onViewChange]);

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
        className={`absolute bottom-6 left-3 rounded-full border border-line px-4 py-2 text-sm font-semibold shadow-lg ${locate.state === "on" ? "bg-accent text-on-accent" : "bg-surface"}`}
        title="Your location stays on this device"
      >
        {locate.label}
      </button>
      {showDelays && <Legend />}
    </BaseMap>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["Late", PROBLEM_COLOR.minor],
    ["15+ min", PROBLEM_COLOR.major],
  ];
  return (
    <div className="absolute top-3 left-3 flex gap-3 rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs font-medium shadow">
      <span className="text-muted">On time: line color</span>
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}
