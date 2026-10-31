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
  diag?: Diagnostics;
}

/**
 * Trips from the timetable alone: where each train should be right now. There is no delay information, so
 * their status is "unknown" and nothing is claimed about lateness. Midnight-crossing trips of yesterday's
 * service day are included.
 */
export function buildScheduledTrips({ id, name, staticData, region, now, diag }: ScheduledInput): Trip[] {
  const trips: Trip[] = [];
  let considered = 0;
  for (const date of [dateInZone(now - DAY, region.timeZone), dateInZone(now, region.timeZone)]) {
    const dayStart = serviceDayStart(date, region.timeZone);
    for (const { id: scheduleId, trip } of staticData.tripsOn(date)) {
      considered++;
      if (trip.stopTimes.length === 0) continue;
      const stops = buildStops(trip, staticData.stops, dayStart, new Map(), now);
      const first = stops[0]!;
      const last = stops.at(-1)!;
      if (first.departure! - now > LOOKAHEAD_MS || now - last.arrival! > LINGER_MS) continue;

      const position = estimatePosition(stops, staticData.stops, now, trip.shape);
      if (position && !inBounds(region, position.lat, position.lon)) continue;

      const route = staticData.routes[trip.routeId];
      trips.push(
        finalizeTrip({
          id: `${id}:${scheduleId}`,
          operatorId: id,
          mode: "rail",
          number: trip.number,
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
export function staticLinesAndPlaces(staticData: () => GtfsStaticData): Pick<TransitProvider, "fetchLines" | "fetchPlaces"> {
  return {
    async fetchLines() {
      return staticData().lines();
    },
    async fetchPlaces({ region }) {
      return Object.values(staticData().stops)
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
  staticData(): GtfsStaticData;
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
      return buildScheduledTrips({ id, name, staticData: staticData(), region, now, diag });
    },
    ...staticLinesAndPlaces(staticData),
  };
}
