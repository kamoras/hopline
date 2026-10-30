import routes from "../../../data/mnr/routes.json";
import stops from "../../../data/mnr/stops.json";
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
}

export interface StaticTrip {
  number: string;
  routeId: string;
  headsign: string;
  direction: number;
  stopTimes: StaticStopTime[];
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
}

type RawTrips = Record<string, [string, string, string, number, string]>;

export function parseStopTimes(encoded: string): StaticStopTime[] {
  return encoded.split(";").map((part) => {
    const [stopId = "", times = ""] = part.split("@");
    const [arr = "0", dep = arr] = times.split("-");
    return { stopId, arrivalMin: Number(arr), departureMin: Number(dep) };
  });
}

export function createStaticData(raw: {
  stops: Record<string, [string, number, number]>;
  routes: Record<string, StaticRoute>;
  trips: RawTrips;
}): MnrStaticData {
  const stops: Record<string, StaticStop> = {};
  for (const [id, [name, lat, lon]] of Object.entries(raw.stops)) stops[id] = { name, lat, lon };
  const cache = new Map<string, StaticTrip>();

  return {
    stops,
    routes: raw.routes,
    tripIds: () => Object.keys(raw.trips),
    trip(tripId) {
      const hit = cache.get(tripId);
      if (hit) return hit;
      const t = raw.trips[tripId];
      if (!t) return undefined;
      const trip: StaticTrip = {
        number: t[0],
        routeId: t[1],
        headsign: t[2],
        direction: t[3],
        stopTimes: parseStopTimes(t[4]),
      };
      cache.set(tripId, trip);
      return trip;
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
  });
  return loaded;
}
