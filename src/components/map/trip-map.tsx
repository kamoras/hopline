"use client";

import { LngLatBounds, type ExpressionSpecification, type GeoJSONSource, type Map as MapLibreMap, type MapLayerMouseEvent } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Line } from "@/domain/line";
import type { Place } from "@/domain/place";
import type { Region } from "@/domain/region";
import type { DelayStatus, Trip } from "@/domain/trip";
import { REFRESH_MS } from "@/hooks/use-trips";
import { assignDetailZoom, DETAIL_MAX_ZOOM, DETAIL_MIN_ZOOM } from "@/lib/declutter";
import { bearing, lerpLatLon, type LatLon } from "@/lib/geo";
import { placeImportance } from "@/lib/importance";
import { newArrivals, type Arrival } from "@/lib/ripples";
import { nightFactor, sunAltitudeDeg } from "@/lib/sun";
import { compileLegs, locate as locateOnLeg, positionAt, type CompiledLeg } from "@/lib/motion";
import { createPolyline, project } from "@/lib/polyline";
import { glideOnTrack } from "@/lib/track-glide";
import { TrackIndex } from "@/lib/track-index";
import { BaseMap, prefersDark } from "./base-map";
import { groupStacks, type Stack } from "./stacking";
import { installTrainIcons, vehicleIconId } from "./train-icon";
import { extendTrail, leadEnd, TRAIL_STEP_MS, trailSegments, type Sample } from "@/lib/trail";
import { useLocate } from "./use-locate";

/** Station names appear from this zoom, and only where they fit. */
const LABEL_PLACE_MIN_ZOOM = 10;
const PLACE_LAYERS = Array.from({ length: DETAIL_MAX_ZOOM - DETAIL_MIN_ZOOM + 1 }, (_, i) => [`place-dots-${DETAIL_MIN_ZOOM + i}`, `place-labels-${DETAIL_MIN_ZOOM + i}`]).flat();

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
/** Wider than a badge (24 px), so two stack badges never overlap each other. */
const STACK_RADIUS_PX = 26;
/** Zoom at which trains switch from tiny dots to oriented train glyphs, and get number labels. */
const GLYPH_MIN_ZOOM = 9;
const LABEL_MIN_ZOOM = 11.5;
/** Trains and buses (living model only) show a short wake from this zoom; a wake lasts about 30 s. */
const WAKE_MIN_ZOOM = 9;
const WAKE_MS = 30_000;

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
  /** Frame this track (a route was just chosen); changes with `key`, once its lines have arrived. */
  fitTo?: { key: string; lines: readonly Line[] };
  /** Reports where the map is looking (after each pan or zoom): other modes open the same place, big networks load that part. */
  onViewChange?(view: MapView): void;
  /** Whether this mode reports lateness; if not, there is no late/on-time legend. */
  showDelays?: boolean;
  /**
   * A living model: the basemap dims at night by the real sun at the map's center, a ring ripples out where a vehicle
   * pulls into a station, and the basemap is calmer so the network is what you see.
   */
  living?: boolean;
  /** Where the late/on-time legend sits (default top left). */
  legendClassName?: string;
  /** Where the zoom buttons sit (default top right). */
  controlsPosition?: "top-right" | "bottom-right";
  selectedTripId?: string;
  selectedPlaceId?: string;
  /**
   * Lock the camera onto this vehicle and follow it as it moves. Panning or zooming by hand lets go (`onFollowEnd`);
   * setting it again locks on again.
   */
  followTripId?: string;
  onFollowEnd?(): void;
  /** Look here (a station, a search result): changes with `key`, not on every render. */
  focus?: { lat: number; lon: number; zoom: number; key: string };
  /** Room taken by a panel over the map, so what is looked at stays centered in what is left. */
  padding?: { top: number; right: number; bottom: number; left: number };
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

/** Aircraft are drawn larger than trains: they are few, fast and easy to lose against the map. */
const PLANE_SCALE = 1.5;

/** There are many buses, so each is drawn small (their boxy shape still tells them from trains). */
const BUS_SCALE = 0.7;

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
        mode: t.mode,
        status: t.delayStatus,
        color,
        icon: vehicleIconId(t.mode, color, problem),
        heading: p.heading,
        scale: (problem ? 1.25 : 0.95) * (t.mode === "flights" ? PLANE_SCALE : t.mode === "bus" ? BUS_SCALE : 1),
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

/** How dark the basemap goes at full night (0 to 1): enough to feel like evening, never so much the map is hard to read. */
const NIGHT_DIM = 0.42;

/** How long a ring takes to spread and fade, and how far (px) it grows. */
const RIPPLE_MS = 2_600;
const RIPPLE_PX = 36;

/** Updates the rings on the map for this frame; sends nothing when there are none (and once more when the last one ends). */
function drawRipples(map: MapLibreMap, rings: { current: (Arrival & { start: number })[] }, hadRings: { current: boolean }, now: number) {
  rings.current = rings.current.filter((r) => now - r.start < RIPPLE_MS);
  if (rings.current.length === 0 && !hadRings.current) return;
  hadRings.current = rings.current.length > 0;
  const features: Feature[] = rings.current.map((r) => {
    const t = (now - r.start) / RIPPLE_MS;
    const eased = 1 - (1 - t) ** 3;
    return { type: "Feature", geometry: { type: "Point", coordinates: [r.lon, r.lat] }, properties: { color: r.color, r: 5 + eased * RIPPLE_PX, a: 0.85 * (1 - t) } };
  });
  (map.getSource("ripples") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
}

/** `dz` is the zoom a station first appears at (see `assignDetailZoom`): crowded stations thin out when zoomed out. */
function placeFeatures(places: readonly Place[], detail: ReadonlyMap<string, number>): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { id: p.id, name: p.name, dz: detail.get(p.id) ?? DETAIL_MAX_ZOOM },
    })),
  };
}

/** The grid over the drawn lines, rebuilt only when the set of lines changes (not each time their data is re-delivered). */
function indexOfLines(cache: { current: { key: string; index: TrackIndex } | undefined }, lines: readonly Line[]): TrackIndex | undefined {
  if (lines.length === 0) return undefined;
  const key = lines.map((l) => `${l.id}:${l.coords.length}`).join("|");
  if (cache.current?.key !== key) {
    cache.current = { key, index: new TrackIndex(lines.map((l) => createPolyline(l.coords.flatMap(([lon, lat]) => [lat!, lon!]))), 80) };
  }
  return cache.current.index;
}

/** Quiet the basemap so the network is the focus, like a transit diagram. Runs before our layers are added. */
function mutedBasemap(map: MapLibreMap, calm: boolean) {
  for (const layer of map.getStyle().layers) {
    try {
      if (layer.type === "fill") map.setPaintProperty(layer.id, "fill-opacity", calm ? 0.45 : 0.55);
      else if (layer.type === "line") map.setPaintProperty(layer.id, "line-opacity", calm ? 0.3 : 0.45);
      else if (layer.type === "symbol") {
        map.setPaintProperty(layer.id, "text-opacity", calm ? 0.5 : 0.7);
        map.setPaintProperty(layer.id, "icon-opacity", calm ? 0.4 : 0.55);
      }
    } catch {
      // A layer whose paint can't be changed is simply left as it is.
    }
  }
}

export default function TripMap({ region, trips, places, lines, fitLinesKey, fitTo, frameTrips = true, onViewChange, showDelays = true, legendClassName = "top-3 left-3", controlsPosition, living = false, selectedTripId, selectedPlaceId, followTripId, onFollowEnd, focus, padding, onSelectTrip, onSelectPlace }: Props) {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const shown = useRef(new Map<string, Placed>());
  const motions = useRef(new Map<string, Motion>());
  const stacks = useRef<Stack[]>([]);
  const stacked = useRef(new Set<string>());
  const selectedRef = useRef(selectedTripId);
  const raf = useRef(0);
  const fitted = useRef(false);
  /** Rings spreading from stations, and who was at a station at the last refresh. */
  const ripples = useRef<(Arrival & { start: number })[]>([]);
  const atStation = useRef<Set<string> | undefined>(undefined);
  const hadRipples = useRef(false);
  /** Where each aircraft has been (kept in memory only), for its trail. */
  const history = useRef(new Map<string, Sample[]>());
  const trackCache = useRef<{ key: string; index: TrackIndex }>(undefined);
  const lastTrail = useRef(0);
  const airport = useMemo(() => {
    const byCode = new Map<string, LatLon>();
    for (const p of places) for (const c of [p.id, ...(p.codes ?? [])]) byCode.set(c, p);
    return byCode;
  }, [places]);
  const handlers = useRef({ onSelectTrip, onSelectPlace, onFollowEnd });
  /** The camera is locked onto the followed vehicle (after the move to it has finished). */
  const locked = useRef(false);
  const lastRefresh = useRef(0);
  const lastReport = useRef(0);
  const followRef = useRef<string | undefined>(undefined);
  const locate = useLocate(map);

  useEffect(() => {
    handlers.current = { onSelectTrip, onSelectPlace, onFollowEnd };
    selectedRef.current = selectedTripId;
  }, [onSelectTrip, onSelectPlace, onFollowEnd, selectedTripId]);

  const setup = useCallback((m: MapLibreMap) => {
    const dark = prefersDark();
    const ink = dark ? "#f2f5fa" : "#1b2a41"; // labels on the map: light on the dark basemap
    const halo = dark ? "#0f1620" : "#ffffff";
    mutedBasemap(m, living);
    installTrainIcons(m);
    for (const id of ["lines", "places", "trips", "stacks", "trails", "leads", "wakes"]) m.addSource(id, { type: "geojson", data: empty });
    if (living) {
      m.addSource("ripples", { type: "geojson", data: empty });
      // Night is a navy sheet over the basemap only (it sits under the network, so lines and trains stay bright).
      m.addLayer({ id: "night", type: "background", paint: { "background-color": "#0a1830", "background-opacity": 0 } });
    }

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
    // Stations: white rings with a dark outline. A station is drawn from the zoom its `dz` says (the crowded ones
    // wait until there is room), by one layer per zoom with a plain filter, so no hidden marker takes up space.
    for (let z = DETAIL_MIN_ZOOM; z <= DETAIL_MAX_ZOOM; z++) {
      m.addLayer({
        id: `place-dots-${z}`,
        type: "circle",
        source: "places",
        minzoom: z,
        filter: ["==", ["get", "dz"], z],
        paint: {
          "circle-radius": byZoom(2.6, 4.2, 6.5, [7, 10, 13]),
          "circle-color": "#ffffff",
          "circle-stroke-color": "#1b2a41",
          "circle-stroke-width": byZoom(1, 1.6, 2.2, [7, 10, 13]),
        },
      });
    }
    // Labels are placed most important first (layers are added in that order), and the map drops any that collide.
    for (let z = DETAIL_MIN_ZOOM; z <= DETAIL_MAX_ZOOM; z++) {
      m.addLayer({
        id: `place-labels-${z}`,
        type: "symbol",
        source: "places",
        minzoom: Math.max(z, LABEL_PLACE_MIN_ZOOM),
        filter: ["==", ["get", "dz"], z],
        layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-offset": [0, 1.2], "text-anchor": "top" },
        paint: { "text-color": ink, "text-halo-color": halo, "text-halo-width": 1.6 },
      });
    }
    // A chosen station always shows, however crowded.
    m.addLayer({
      id: "place-selected",
      type: "circle",
      source: "places",
      filter: ["==", ["get", "id"], ""],
      paint: { "circle-radius": 8, "circle-color": "#ffffff", "circle-stroke-color": "#1f6feb", "circle-stroke-width": 3 },
    });
    // A ring that spreads from a station when a vehicle pulls in (each ring carries its own radius and fade).
    if (living) {
      m.addLayer({
        id: "ripple-rings",
        type: "circle",
        source: "ripples",
        paint: {
          "circle-radius": ["get", "r"],
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": 2.5,
          "circle-stroke-opacity": ["get", "a"],
          "circle-pitch-alignment": "map",
        },
      });
    }
    // Aircraft have no track, so each shows where it has been (a fading trail) and where it is headed (a dashed line to
    // its airport), and a soft halo that keeps it findable on any basemap, light or dark.
    m.addLayer({
      id: "lead-lines",
      type: "line",
      source: "leads",
      layout: { "line-cap": "round" },
      paint: { "line-color": "#8ab4ff", "line-width": 1.6, "line-dasharray": [1, 2.2], "line-opacity": ["get", "a"] },
    });
    m.addLayer({
      id: "trail-lines",
      type: "line",
      source: "trails",
      layout: { "line-cap": "round" },
      paint: { "line-color": "#cfe2ff", "line-width": byZoom(1.6, 2.6, 3.6), "line-opacity": ["*", 0.8, ["get", "a"]] },
    });
    // Trains and buses on the living model leave a short wake in their own color, from where they have just been.
    m.addLayer({
      id: "wake-lines",
      type: "line",
      source: "wakes",
      minzoom: WAKE_MIN_ZOOM,
      layout: { "line-cap": "round" },
      paint: { "line-color": ["get", "color"], "line-width": byZoom(1.6, 2.4, 3.2, [9, 12, 15]), "line-opacity": ["*", 0.6, ["get", "a"]] },
    });
    m.addLayer({
      id: "plane-glow",
      type: "circle",
      source: "trips",
      filter: ["==", ["get", "mode"], "flights"],
      paint: { "circle-color": "#7cb3ff", "circle-blur": 0.8, "circle-opacity": 0.5, "circle-radius": byZoom(9, 13, 18) },
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
      paint: { "text-color": ink, "text-halo-color": halo, "text-halo-width": 1.8 },
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
    interactive([...PLACE_LAYERS, "place-selected"], (e) => {
      const id = pickId(e);
      if (id) handlers.current.onSelectPlace(id);
    });
    interactive(["stack-dots", "stack-labels"], (e) => m.easeTo({ center: e.lngLat, zoom: Math.min(m.getZoom() + 1.8, 13), duration: 600 }));
    setMap(m);
  }, [living]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Night follows the real sun where the map is looking (and is skipped in the dark theme, which already dims the map).
  useEffect(() => {
    if (!map || !living) return;
    const dark = prefersDark();
    const apply = () => {
      if (!map.getLayer("night")) return;
      const c = map.getCenter();
      map.setPaintProperty("night", "background-opacity", dark ? 0 : nightFactor(sunAltitudeDeg(c.lat, c.lng, new Date())) * NIGHT_DIM);
    };
    apply();
    map.on("moveend", apply);
    const timer = setInterval(apply, 60_000);
    return () => {
      clearInterval(timer);
      map.off("moveend", apply);
    };
  }, [map, living]);

  // Which stations to show at which zoom: the interchanges and termini first, the rest as there is room.
  const detail = useMemo(() => {
    const importance = placeImportance(places, lines);
    return assignDetailZoom(places.map((p) => ({ id: p.id, lat: p.lat, lon: p.lon, importance: importance.get(p.id) ?? 1 })));
  }, [places, lines]);

  useEffect(() => {
    (map?.getSource("places") as GeoJSONSource | undefined)?.setData(placeFeatures(places, detail));
  }, [map, places, detail]);

  useEffect(() => {
    map?.setFilter("place-selected", ["==", ["get", "id"], selectedPlaceId ?? ""]);
  }, [map, selectedPlaceId]);

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
    const trailsSource = map?.getSource("trails") as GeoJSONSource | undefined;
    const leadsSource = map?.getSource("leads") as GeoJSONSource | undefined;
    if (!map || !tripsSource || !stacksSource || !trailsSource || !leadsSource) return;
    const wakesSource = map?.getSource("wakes") as GeoJSONSource | undefined;
    const planes = trips.filter((t) => t.mode === "flights");
    const wakers = living ? trips.filter((t) => t.mode !== "flights") : [];
    const known = new Set(trips.map((t) => t.id));
    for (const id of history.current.keys()) if (!known.has(id)) history.current.delete(id);
    let wakeFeatures: Feature[] = [];
    const t = Date.now();
    const next = new Map<string, Motion>();
    const trackIndex = () => indexOfLines(trackCache, lines);
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
        // A train reported by GPS glides along its track to its new fix (not straight across the bend); a bus has no track.
        const along = trip.mode === "bus" ? undefined : glideOnTrack(trackIndex(), prev ?? at, at, t, REFRESH_MS);
        if (along) next.set(trip.id, { legs: compileLegs([along]), from: at, to: at, start: t, duration: 0, shift: 0, shiftAt: t, heading });
        else next.set(trip.id, { from: prev ?? at, to: at, start: t, duration: REFRESH_MS, shift: 0, shiftAt: t, heading });
      }
    }
    motions.current = next;

    if (living && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const { arrivals, now: at } = newArrivals(atStation.current, trips);
      atStation.current = at;
      const started = Date.now();
      ripples.current = [...ripples.current, ...arrivals.slice(0, 40).map((a) => ({ ...a, start: started }))].slice(-80);
    }

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
      const followed = followRef.current && locked.current ? placed.get(followRef.current) : undefined;
      if (followed) map.jumpTo({ center: [followed.lon, followed.lat] }, { follow: true });
      tripsSource.setData(tripFeatures(trips, placed, stacked.current, (Math.sin(now / 450) + 1) / 2));
      stacksSource.setData(stackFeatures(stacks.current, placed));
      if (planes.length || wakers.length) drawPaths(now, placed);
      if (living) drawRipples(map, ripples, hadRipples, now);
    };

    // Each aircraft's trail (where it has been) and heading line (to its airport, when known); the chosen one stands out.
    const drawPaths = (now: number, placed: Map<string, Placed>) => {
      const trail: Feature[] = [];
      const lead: Feature[] = [];
      const keep = now - lastTrail.current >= TRAIL_STEP_MS;
      if (keep) lastTrail.current = now;
      const wakesOn = wakesSource && wakers.length > 0 && map.getZoom() >= WAKE_MIN_ZOOM;
      if (keep && wakesSource) {
        // Wakes are rebuilt once per step (not every frame): there are many more trains than planes.
        wakeFeatures = [];
        if (wakesOn) {
          for (const t of wakers) {
            const p = placed.get(t.id);
            if (!p || stacked.current.has(t.id)) continue;
            const h = extendTrail(history.current.get(t.id), p, now, 12, WAKE_MS);
            history.current.set(t.id, h);
            for (const s of trailSegments(h, p, now, WAKE_MS)) {
              wakeFeatures.push({ type: "Feature", geometry: { type: "LineString", coordinates: [[s.from.lon, s.from.lat], [s.to.lon, s.to.lat]] }, properties: { a: s.a, color: tripColor(t) } });
            }
          }
        }
        wakesSource.setData({ type: "FeatureCollection", features: wakeFeatures });
      }
      for (const t of planes) {
        const p = placed.get(t.id);
        if (!p) continue;
        const selected = t.id === selectedRef.current;
        if (keep) history.current.set(t.id, extendTrail(history.current.get(t.id), p, now));
        for (const s of trailSegments(history.current.get(t.id) ?? [], p, now)) {
          trail.push({ type: "Feature", geometry: { type: "LineString", coordinates: [[s.from.lon, s.from.lat], [s.to.lon, s.to.lat]] }, properties: { a: selected ? Math.min(1, s.a + 0.3) : s.a } });
        }
        const to = leadEnd(p, t.destinationAt ?? (t.stops[0] && airport.get(t.stops[0].id)));
        if (to) lead.push({ type: "Feature", geometry: { type: "LineString", coordinates: [[p.lon, p.lat], [to.lon, to.lat]] }, properties: { a: selected ? 0.95 : 0.45 } });
      }
      trailsSource.setData({ type: "FeatureCollection", features: trail });
      leadsSource.setData({ type: "FeatureCollection", features: lead });
    };

    shown.current = new Map([...next].map(([id, m]) => [id, motionPosition(m, t)]));
    // Panning or zooming brings other trains into view and changes how they stack.
    const refresh = (e?: object) => {
      // Following a vehicle moves the camera every frame; the heavy parts (stacking, what to fetch) run about once a second then.
      if ((e as { follow?: boolean } | undefined)?.follow && Date.now() - lastRefresh.current < 1_000) return;
      lastRefresh.current = Date.now();
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
  }, [map, trips, frameTrips, living, airport, lines]);

  const fitted_ = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!map || !fitLinesKey || lines.length === 0 || fitted_.current === fitLinesKey) return;
    fitted_.current = fitLinesKey;
    const b = new LngLatBounds();
    for (const l of lines) for (const c of l.coords) b.extend(c);
    map.fitBounds(b, { padding: 64, maxZoom: 14, duration: 600 });
  }, [map, lines, fitLinesKey]);

  const fittedTo = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!map || !fitTo || fitTo.lines.length === 0 || fittedTo.current === fitTo.key) return;
    fittedTo.current = fitTo.key;
    const b = new LngLatBounds();
    for (const l of fitTo.lines) for (const c of l.coords) b.extend(c);
    map.fitBounds(b, { padding: 48, maxZoom: 14, duration: 700 });
  }, [map, fitTo]);

  useEffect(() => {
    if (!map || !onViewChange) return;
    const report = (e?: object) => {
      if ((e as { follow?: boolean } | undefined)?.follow && Date.now() - lastReport.current < 1_000) return;
      lastReport.current = Date.now();
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
    if (pos && !followTripId) map.easeTo({ center: [pos.lon, pos.lat], zoom: Math.max(map.getZoom(), 10), duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedTripId]);

  // Lock onto a vehicle: move to it, then keep it in the middle as it goes. Letting go is the person's choice (a drag).
  useEffect(() => {
    followRef.current = followTripId;
    locked.current = false;
    if (!map || !followTripId) return;
    const at = shown.current.get(followTripId) ?? trips.find((t) => t.id === followTripId)?.position;
    if (!at) return;
    map.easeTo({ center: [at.lon, at.lat], zoom: Math.max(map.getZoom(), 12.5), duration: 800 });
    map.once("moveend", () => {
      if (followRef.current === followTripId) locked.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, followTripId]);

  useEffect(() => {
    if (!map) return;
    const letGo = (e: object) => {
      if (!(e as { originalEvent?: unknown }).originalEvent || !followRef.current) return;
      followRef.current = undefined;
      locked.current = false;
      handlers.current.onFollowEnd?.();
    };
    map.on("dragstart", letGo);
    return () => {
      map.off("dragstart", letGo);
    };
  }, [map]);

  useEffect(() => {
    if (map && padding) map.setPadding(padding);
  }, [map, padding?.top, padding?.right, padding?.bottom, padding?.left]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (map && focus) map.easeTo({ center: [focus.lon, focus.lat], zoom: Math.max(map.getZoom(), focus.zoom), duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, focus?.key]);

  useEffect(() => {
    const p = places.find((x) => x.id === selectedPlaceId);
    if (map && p) map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 11), duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedPlaceId]);

  return (
    <BaseMap bounds={region.bounds} onReady={setup} controlsPosition={controlsPosition}>
      <button
        type="button"
        onClick={locate.toggle}
        className={`absolute bottom-6 left-3 rounded-full border border-line px-4 py-2 text-sm font-semibold shadow-lg ${locate.state === "on" ? "bg-accent text-on-accent" : "bg-surface"}`}
        title="Your location stays on this device"
      >
        {locate.label}
      </button>
      {showDelays && <Legend className={legendClassName} />}
    </BaseMap>
  );
}

function Legend({ className }: { className: string }) {
  const items: [string, string][] = [
    ["Late", PROBLEM_COLOR.minor],
    ["15+ min", PROBLEM_COLOR.major],
  ];
  return (
    <div className={`absolute flex gap-3 rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs font-medium shadow ${className}`}>
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
