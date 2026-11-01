import type { Arrival } from "@/domain/arrival";
import type { Mode } from "@/domain/modes";
import { inBounds, type Region } from "@/domain/region";
import type { Attribution, Diagnostics, Trip } from "@/domain/trip";
import { dateInZone, serviceDayStart } from "@/lib/time";
import { deriveState, finalizeTrip } from "../finalize";
import type { TransitProvider } from "../types";
import { buildLegs, buildStops, estimatePosition } from "./stops";
import type { GtfsStaticData } from "./static";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
/** Show trips that depart within this window, like the realtime providers do. */
const LOOKAHEAD_MS = 90 * MIN;
/** Keep a finished trip visible briefly so it doesn't vanish mid-glance. */
const LINGER_MS = 3 * MIN;

export interface ScheduledInput {
  id: string;
  /** Used for trips whose route is missing from the schedule. */
  name: string;
  staticData: GtfsStaticData;
  region: Region;
  now: number;
  /** Defaults to rail. */
  mode?: Mode;
  diag?: Diagnostics;
}

/**
 * Trips from the timetable alone: where each train should be right now. There is no delay information, so
 * their status is "unknown" and nothing is claimed about lateness. Midnight-crossing trips of yesterday's
 * service day are included.
 */
export function buildScheduledTrips({ id, name, staticData, region, now, mode = "rail", diag }: ScheduledInput): Trip[] {
  const trips: Trip[] = [];
  let considered = 0;
  for (const date of [dateInZone(now - DAY, region.timeZone), dateInZone(now, region.timeZone)]) {
    const dayStart = serviceDayStart(date, region.timeZone);
    for (const { id: scheduleId, trip } of staticData.tripsOn(date)) {
      considered++;
      if (trip.stopTimes.length === 0) continue;
      // Decide from the timetable's first and last times, so only the few trips in the window are built out.
      const departs = dayStart + trip.stopTimes[0]!.departureMin * MIN;
      const arrives = dayStart + trip.stopTimes.at(-1)!.arrivalMin * MIN;
      if (departs - now > LOOKAHEAD_MS || now - arrives > LINGER_MS) continue;
      const stops = buildStops(trip, staticData.stops, dayStart, new Map(), now);
      const first = stops[0]!;
      const last = stops.at(-1)!;

      const position = estimatePosition(stops, staticData.stops, now, trip.shape);
      if (position && !inBounds(region, position.lat, position.lon)) continue;

      const route = staticData.routes[trip.routeId];
      trips.push(
        finalizeTrip({
          id: `${id}:${scheduleId}`,
          operatorId: id,
          mode,
          number: trip.number || (route as { short?: string } | undefined)?.short || trip.routeId, // a timetable with no train numbers (a ferry): the route stands in
          routeName: route?.name ?? name,
          routeColor: route?.color ?? "#0b5ea8",
          origin: first.name,
          destination: trip.headsign || last.name,
          state: deriveState(stops, false),
          position,
          motion: buildLegs(stops, staticData.stops, trip.shape),
          stops,
          updatedAt: now,
        }),
      );
    }
  }
  if (diag) {
    diag.scheduleTrips = considered;
    diag.kept = trips.length;
  }
  return trips;
}

/** The map lines and stations every GTFS-backed rail provider serves from its bundled schedule. */
export function staticLinesAndPlaces(staticData: () => Promise<GtfsStaticData>): Pick<TransitProvider, "fetchLines" | "fetchPlaces"> {
  return {
    async fetchLines() {
      return (await staticData()).lines();
    },
    async fetchPlaces({ region }) {
      return Object.values((await staticData()).stops)
        .filter((s) => inBounds(region, s.lat, s.lon))
        .map((s) => ({ name: s.name, lat: s.lat, lon: s.lon, mode: "rail" as const, regionId: region.id }));
    },
  };
}

export interface ScheduledProviderConfig {
  id: string;
  name: string;
  attribution: Attribution;
  regionIds: readonly string[];
  staticData(): Promise<GtfsStaticData>;
}

/** A provider that serves the bundled timetable only. Add real-time later by swapping `fetchTrips`. */
export function createScheduledProvider({ id, name, attribution, regionIds, staticData }: ScheduledProviderConfig): TransitProvider {
  return {
    id,
    name,
    attribution,
    mode: "rail",
    regionIds,
    async fetchTrips({ region, now, diag }) {
      return buildScheduledTrips({ id, name, staticData: await staticData(), region, now, diag });
    },
    ...staticLinesAndPlaces(staticData),
  };
}

/** How far ahead a station lists scheduled trains. */
const ARRIVALS_HORIZON_MS = 45 * MIN;
const ARRIVALS_MAX = 60;

/**
 * Trains the timetable says call at a station (any of its platforms) soon. There is no live data behind them, so
 * these are scheduled times, nothing more.
 */
export function buildScheduledArrivals({
  staticData,
  lineOf,
  region,
  platforms,
  now,
}: {
  staticData: GtfsStaticData;
  /** The public line (badge text and colors) of a route id. */
  lineOf(routeId: string): { route: string; color: string; textColor: string } | undefined;
  region: Region;
  platforms: readonly string[];
  now: number;
}): Arrival[] {
  const wanted = new Set(platforms);
  const out: Arrival[] = [];
  for (const date of [dateInZone(now - DAY, region.timeZone), dateInZone(now, region.timeZone)]) {
    const dayStart = serviceDayStart(date, region.timeZone);
    for (const { id, trip } of staticData.tripsOn(date)) {
      const line = lineOf(trip.routeId);
      if (!line) continue;
      for (const st of trip.stopTimes) {
        if (!wanted.has(st.stopId)) continue;
        const at = dayStart + st.departureMin * MIN;
        if (at >= now && at - now <= ARRIVALS_HORIZON_MS) out.push({ tripId: id, ...line, headsign: trip.headsign || staticData.stops[trip.stopTimes.at(-1)!.stopId]?.name || "", at, platform: st.stopId });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, ARRIVALS_MAX);
}
