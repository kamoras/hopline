import type { StaticRoute } from "../gtfs/static";
import { createStaticData, type GtfsStaticData, type RawTrips } from "../gtfs/static";
import routes from "../../../data/mbta-subway/routes.json";
import services from "../../../data/mbta-subway/services.json";
import shapes from "../../../data/mbta-subway/shapes.json";
import stops from "../../../data/mbta-subway/stops.json";
import trips from "../../../data/mbta-subway/trips.json";

export const MBTA_SUBWAY_ID = "mbta-subway";

/** A station as riders know it: one name, with a platform stop id per track or direction behind it. */
export interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
  platforms: string[];
}

export interface LineInfo extends StaticRoute {
  /** Badge text ("RL", "B"). */
  short: string;
}

export interface MbtaSubwayStatic {
  data: GtfsStaticData;
  stations: Station[];
  lines: Record<string, LineInfo>;
  stationOfPlatform(platformId: string): Station | undefined;
}

/** Groups the schedule's per-track platforms into stations by name (the feed names each after its station). */
export function createMbtaSubwayStatic(data: GtfsStaticData): MbtaSubwayStatic {
  const byName = new Map<string, { name: string; lat: number[]; lon: number[]; platforms: string[] }>();
  for (const [id, s] of Object.entries(data.stops)) {
    const group = byName.get(s.name) ?? { name: s.name, lat: [], lon: [], platforms: [] };
    group.lat.push(s.lat);
    group.lon.push(s.lon);
    group.platforms.push(id);
    byName.set(s.name, group);
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const stations = [...byName.values()].map((g): Station => ({ id: g.platforms[0]!, name: g.name, lat: mean(g.lat), lon: mean(g.lon), platforms: g.platforms }));
  const byPlatform = new Map(stations.flatMap((s) => s.platforms.map((p) => [p, s] as const)));
  const lines = Object.fromEntries(Object.entries(data.routes).map(([id, r]) => [id, { ...r, short: (r as Partial<LineInfo>).short ?? id }]));
  return { data, stations, lines, stationOfPlatform: (id) => byPlatform.get(id) };
}

let loaded: MbtaSubwayStatic | undefined;

export function loadMbtaSubwayStatic(): MbtaSubwayStatic {
  loaded ??= createMbtaSubwayStatic(
    createStaticData(
      { stops: stops as unknown as Record<string, [string, number, number]>, routes, trips: trips as unknown as RawTrips, services, shapes },
      { id: MBTA_SUBWAY_ID, name: "MBTA Subway" },
    ),
  );
  return loaded;
}
