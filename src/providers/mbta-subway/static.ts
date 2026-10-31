import { lazy, lazyStaticData } from "../gtfs/dataset";
import type { GtfsStaticData, StaticRoute } from "../gtfs/static";

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

const subwayData = lazyStaticData(MBTA_SUBWAY_ID, { id: MBTA_SUBWAY_ID, name: "MBTA Subway" });

/** The T's stations, lines and track, loaded on first use. */
export const loadMbtaSubwayStatic = lazy(async () => createMbtaSubwayStatic(await subwayData()));
