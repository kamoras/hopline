import routes from "../../../data/mnr/routes.json";
import services from "../../../data/mnr/services.json";
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
}

/** [trainNumber, routeId, headsign, direction, encodedStopTimes, serviceIndex] */
type RawTrips = Record<string, [string, string, string, number, string, number]>;

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
  /** Per service index, the comma-separated dates (YYYYMMDD) it runs on. */
  services: string[];
}): MnrStaticData {
  const stopsById: Record<string, StaticStop> = {};
  for (const [id, [name, lat, lon]] of Object.entries(raw.stops)) stopsById[id] = { name, lat, lon };

  const serviceDates = raw.services.map((d) => new Set(d.split(",")));
  const cache = new Map<string, StaticTrip>();

  const decode = (id: string): StaticTrip | undefined => {
    const hit = cache.get(id);
    if (hit) return hit;
    const t = raw.trips[id];
    if (!t) return undefined;
    const trip: StaticTrip = { number: t[0], routeId: t[1], headsign: t[2], direction: t[3], stopTimes: parseStopTimes(t[4]) };
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
  });
  return loaded;
}
