import type { Line } from "@/domain/line";
import { createPolyline, type Polyline } from "@/lib/polyline";
import routes from "../../../data/mnr/routes.json";
import services from "../../../data/mnr/services.json";
import stops from "../../../data/mnr/stops.json";
import shapes from "../../../data/mnr/shapes.json";
import trips from "../../../data/mnr/trips.json";

/** Schedule data produced by `npm run data:mnr` (scripts/build-mnr-gtfs.ts). */
export interface StaticStop {
  name: string;
  lat: number;
  lon: number;
}

export interface StaticStopTime {
  stopId: string;
  /** Minutes after the start of the service day (may exceed 1440). */
  arrivalMin: number;
  departureMin: number;
  /** Scheduled track, when the schedule names one. */
  track?: string;
}

export interface StaticTrip {
  number: string;
  routeId: string;
  headsign: string;
  direction: number;
  stopTimes: StaticStopTime[];
  /** The track this trip runs on, if the schedule has geometry for it. */
  shape?: Polyline;
}

/** A schedule trip together with its schedule id. */
export interface StaticTripRef {
  id: string;
  trip: StaticTrip;
}

export interface StaticRoute {
  name: string;
  color: string;
}

export interface MnrStaticData {
  stops: Record<string, StaticStop>;
  routes: Record<string, StaticRoute>;
  trip(tripId: string): StaticTrip | undefined;
  tripIds(): string[];
  /**
   * Trips with this public train number that run on `date` (YYYYMMDD). The realtime feed's own
   * trip ids don't match the schedule's, but train number + service date identifies a trip.
   */
  tripsByNumber(number: string, date: string): StaticTripRef[];
  /** Every distinct track, for drawing on the map. */
  lines(): Line[];
}

/** [trainNumber, routeId, headsign, direction, encodedStopTimes, serviceIndex, shapeIndex (-1 = none)] */
type RawTrips = Record<string, [string, string, string, number, string, number, number]>;

/** Simplified track geometry: flat [lat, lon, ...] per shape. */
export interface RawShape {
  routeId: string;
  pts: number[];
  /** Built from station positions, not real track geometry. */
  coarse?: boolean;
}

export function parseStopTimes(encoded: string): StaticStopTime[] {
  return encoded.split(";").map((part) => {
    const [stopId = "", rest = ""] = part.split("@");
    const [times = "", track] = rest.split("#");
    const [arr = "0", dep = arr] = times.split("-");
    return { stopId, arrivalMin: Number(arr), departureMin: Number(dep), ...(track ? { track } : {}) };
  });
}

export function createStaticData(raw: {
  stops: Record<string, [string, number, number]>;
  routes: Record<string, StaticRoute>;
  trips: RawTrips;
  /** Per service index, the comma-separated dates (YYYYMMDD) it runs on. */
  services: string[];
  shapes: RawShape[];
}): MnrStaticData {
  const stopsById: Record<string, StaticStop> = {};
  for (const [id, [name, lat, lon]] of Object.entries(raw.stops)) stopsById[id] = { name, lat, lon };

  const serviceDates = raw.services.map((d) => new Set(d.split(",")));
  const cache = new Map<string, StaticTrip>();
  const polylines = raw.shapes.map((s) => createPolyline(s.pts));

  const decode = (id: string): StaticTrip | undefined => {
    const hit = cache.get(id);
    if (hit) return hit;
    const t = raw.trips[id];
    if (!t) return undefined;
    const trip: StaticTrip = {
      number: t[0],
      routeId: t[1],
      headsign: t[2],
      direction: t[3],
      stopTimes: parseStopTimes(t[4]),
      shape: polylines[t[6]],
    };
    cache.set(id, trip);
    return trip;
  };

  // train number -> schedule trip ids, built on first use
  let byNumber: Map<string, string[]> | undefined;
  const numberIndex = () => {
    if (!byNumber) {
      byNumber = new Map();
      for (const [id, t] of Object.entries(raw.trips)) byNumber.set(t[0], [...(byNumber.get(t[0]) ?? []), id]);
    }
    return byNumber;
  };

  return {
    stops: stopsById,
    routes: raw.routes,
    tripIds: () => Object.keys(raw.trips),
    trip: decode,
    lines() {
      // Inbound and outbound often share one geometry; draw each distinct track once.
      const seen = new Set<string>();
      // Station-to-station fallbacks are only drawn for a route that has no real track geometry at all.
      const detailed = new Set(raw.shapes.filter((s) => !s.coarse).map((s) => s.routeId));
      return raw.shapes.flatMap((s, i) => {
        if (s.coarse && detailed.has(s.routeId)) return [];
        const pts = polylines[i]!.pts;
        const ends = [pts[0], pts.at(-1)].map((p) => `${p?.lat},${p?.lon}`).sort().join("|");
        const key = `${s.routeId}:${pts.length}:${ends}`;
        if (pts.length < 2 || seen.has(key)) return [];
        seen.add(key);
        return [
          {
            id: `mnr-${i}`,
            name: raw.routes[s.routeId]?.name ? `${raw.routes[s.routeId]!.name} Line` : "Metro-North",
            color: raw.routes[s.routeId]?.color ?? "#0b5ea8",
            coords: pts.map((p) => [p.lon, p.lat] as [number, number]),
          },
        ];
      });
    },
    tripsByNumber(number, date) {
      return (numberIndex().get(number) ?? [])
        .filter((id) => serviceDates[raw.trips[id]![5]]?.has(date))
        .flatMap((id) => {
          const trip = decode(id);
          return trip ? [{ id, trip }] : [];
        });
    },
  };
}

let loaded: MnrStaticData | undefined;

/**
 * Builds the lookup once per server instance. The JSON is bundled with the
 * server code (never sent to browsers) so there is no filesystem access at runtime.
 */
export function loadStaticData(): MnrStaticData {
  loaded ??= createStaticData({
    stops: stops as unknown as Record<string, [string, number, number]>,
    routes,
    trips: trips as unknown as RawTrips,
    services,
    shapes,
  });
  return loaded;
}
