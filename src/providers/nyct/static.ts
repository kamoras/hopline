import type { Line } from "@/domain/line";
import { createPolyline, type Polyline } from "@/lib/polyline";
import { lazy, loadDataFile, type DataFiles } from "../gtfs/dataset";

const files: DataFiles = (name) => import(`../../../data/subway/${name}.json`);

/** A station as riders know it: one name, possibly several stations and platforms behind it. */
export interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Platform stop ids ending in N or S, as used by the realtime feeds. */
  platforms: string[];
}

export interface RouteInfo {
  short: string;
  long: string;
  color: string;
  text: string;
}

/** Output of scripts/build-subway-gtfs.ts. */
export interface RawSubway {
  stations: [id: string, name: string, lat: number, lon: number, platforms: string[]][];
  routes: Record<string, RouteInfo>;
  shapes: { shapes: { route: string; pts: number[] }[]; byId: Record<string, number>; fallback: Record<string, number> };
}

export type Direction = "N" | "S";

export interface NyctStatic {
  stations: Station[];
  routes: Record<string, RouteInfo>;
  stationOfPlatform(platformId: string): Station | undefined;
  /**
   * The track a trip runs on. Realtime trip ids end in the schedule's shape id ("..._1..S03R");
   * failing that, the most common track for the route and direction.
   */
  shapeFor(tripId: string, routeId: string, direction: Direction): Polyline | undefined;
  lines(): Line[];
}

export function createNyctStatic(raw: RawSubway): NyctStatic {
  const all: Station[] = raw.stations.map(([id, name, lat, lon, platforms]) => ({ id, name, lat, lon, platforms }));
  const byPlatform = new Map<string, Station>();
  for (const s of all) for (const p of s.platforms) byPlatform.set(p, s);

  const polylines = new Map<number, Polyline>();
  const polyline = (idx: number | undefined) => {
    if (idx === undefined || !raw.shapes.shapes[idx]) return undefined;
    let p = polylines.get(idx);
    if (!p) polylines.set(idx, (p = createPolyline(raw.shapes.shapes[idx]!.pts)));
    return p;
  };

  return {
    stations: all,
    routes: raw.routes,
    stationOfPlatform: (id) => byPlatform.get(id),
    shapeFor(tripId, routeId, direction) {
      const suffix = tripId.includes("_") ? tripId.slice(tripId.indexOf("_") + 1) : tripId;
      return polyline(raw.shapes.byId[suffix] ?? raw.shapes.fallback[`${routeId}:${direction === "N" ? 0 : 1}`]);
    },
    lines() {
      // North- and southbound shapes share their track; draw each distinct track once.
      const seen = new Set<string>();
      return raw.shapes.shapes.flatMap((s, i) => {
        const p = polyline(i)!;
        const ends = [p.pts[0], p.pts.at(-1)].map((q) => `${q?.lat},${q?.lon}`).sort().join("|");
        const key = `${s.route}:${p.pts.length}:${ends}`;
        if (p.pts.length < 2 || seen.has(key)) return [];
        seen.add(key);
        const r = raw.routes[s.route];
        return [{ id: `nyct-${i}`, name: r ? `${r.short} train` : "Subway", color: r?.color ?? "#808183", coords: p.pts.map((q) => [q.lon, q.lat] as [number, number]) }];
      });
    },
  };
}

/** The NYC subway's stations, lines and track, loaded on first use. */
export const loadNyctStatic = lazy(async () => {
  const [stations, routes, shapes] = await Promise.all([
    loadDataFile<RawSubway["stations"]>(files, "stations"),
    loadDataFile<RawSubway["routes"]>(files, "routes"),
    loadDataFile<RawSubway["shapes"]>(files, "shapes"),
  ]);
  return createNyctStatic({ stations, routes, shapes });
});
