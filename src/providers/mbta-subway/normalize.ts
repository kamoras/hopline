import { transit_realtime as rt } from "gtfs-realtime-bindings";
import type { Arrival } from "@/domain/arrival";
import type { Diagnostics, Position, StopCall, Trip } from "@/domain/trip";
import { finalizeTrip } from "../finalize";
import type { FeedMessage } from "../gtfs/feed";
import { MBTA_SUBWAY_ID, type MbtaSubwayStatic } from "./static";

/** Stops sent per trip: the next few and the destination. Station arrivals are served separately. */
const STOPS_KEPT = 3;
/** Updates this far in the past are stops already served. */
const PASSED_GRACE_MS = 30_000;
/** How far ahead arrivals are listed. Beyond this a station board is just noise. */
const ARRIVALS_HORIZON_MS = 45 * 60_000;
const ARRIVALS_MAX = 60;
const TEXT = "#FFFFFF"; // the T's rapid transit lines all use white text

/** Feed times are seconds and the field exists only when set (absent numbers decode as 0). */
function timeMs(ev: rt.TripUpdate.IStopTimeEvent | null | undefined): number | undefined {
  return ev && Object.hasOwn(ev, "time") && Number(ev.time) > 0 ? Number(ev.time) * 1000 : undefined;
}

const bump = (d: Diagnostics | undefined, key: string) => {
  if (d) d[key] = Number(d[key] ?? 0) + 1;
};

interface Upcoming {
  platform: string;
  at: number;
}

function upcomingStops(tu: rt.ITripUpdate | null | undefined, data: MbtaSubwayStatic, now: number): Upcoming[] {
  return (tu?.stopTimeUpdate ?? []).flatMap((u) => {
    const at = timeMs(u.arrival) ?? timeMs(u.departure);
    return at !== undefined && u.stopId && data.stationOfPlatform(u.stopId) && at >= now - PASSED_GRACE_MS ? [{ platform: u.stopId, at }] : [];
  });
}

export interface MbtaSubwayInput {
  staticData: MbtaSubwayStatic;
  tripUpdates: FeedMessage;
  vehicles: FeedMessage;
  now: number;
  diag?: Diagnostics;
}

/**
 * Subway trips from the MBTA's feeds. Unlike the NYC subway, every train reports a GPS position, so
 * the map shows where it is; trip updates add the stops it is heading for.
 */
export function buildMbtaSubwayTrips({ staticData, tripUpdates, vehicles, now, diag }: MbtaSubwayInput): Trip[] {
  const updates = new Map<string, rt.ITripUpdate>();
  for (const e of tripUpdates.entity) if (e.tripUpdate?.trip.tripId) updates.set(e.tripUpdate.trip.tripId, e.tripUpdate);

  const trips: Trip[] = [];
  for (const entity of vehicles.entity) {
    const v = entity.vehicle;
    const routeId = v?.trip?.routeId;
    const line = routeId ? staticData.lines[routeId] : undefined;
    if (!v || !line) continue; // buses, commuter rail and ferries share the feed
    bump(diag, "vehicles");
    if (!v.position) {
      bump(diag, "noPosition");
      continue;
    }
    const tripId = v.trip?.tripId ?? entity.id;
    const upcoming = upcomingStops(updates.get(tripId), staticData, now);
    const last = upcoming.at(-1);
    const stoppedAt = v.currentStatus === rt.VehiclePosition.VehicleStopStatus.STOPPED_AT;
    const stationOf = (platform: string) => staticData.stationOfPlatform(platform)!;

    const stops: StopCall[] = [...upcoming.slice(0, STOPS_KEPT), ...(last && upcoming.length > STOPS_KEPT ? [last] : [])].map((u, i) => ({
      id: stationOf(u.platform).id,
      name: stationOf(u.platform).name,
      state: i === 0 && stoppedAt && v.stopId === u.platform ? "at" : "upcoming",
      arrival: u.at,
      departure: u.at,
    }));

    const position: Position = {
      lat: v.position.latitude,
      lon: v.position.longitude,
      heading: v.position.bearing ?? undefined,
      speedMph: v.position.speed ? v.position.speed * 2.23694 : undefined,
      source: "reported",
    };

    bump(diag, "kept");
    trips.push(
      finalizeTrip({
        id: `${MBTA_SUBWAY_ID}:${tripId}`,
        operatorId: MBTA_SUBWAY_ID,
        mode: "subway",
        number: line.short,
        routeName: line.name,
        routeColor: line.color,
        origin: "",
        destination: last ? stationOf(last.platform).name : line.name,
        state: stoppedAt ? "at-station" : "enroute",
        position,
        stops,
        updatedAt: Number(v.timestamp ?? 0) * 1000 || now,
      }),
    );
  }
  return trips;
}

/** Trains due at a station (any of its platforms): when each arrives and where it is going. */
export function buildMbtaSubwayArrivals({
  staticData,
  tripUpdates,
  platforms,
  now,
}: {
  staticData: MbtaSubwayStatic;
  tripUpdates: FeedMessage;
  platforms: readonly string[];
  now: number;
}): Arrival[] {
  const wanted = new Set(platforms);
  const out: Arrival[] = [];
  for (const entity of tripUpdates.entity) {
    const tu = entity.tripUpdate;
    const tripId = tu?.trip.tripId;
    const line = tu?.trip.routeId ? staticData.lines[tu.trip.routeId] : undefined;
    if (!tu || !tripId || !line) continue;
    const stops = upcomingStops(tu, staticData, 0); // keep the whole list: the destination is its last stop
    const headsign = (stops.at(-1) && staticData.stationOfPlatform(stops.at(-1)!.platform)?.name) || line.name;
    for (const u of stops) {
      if (!wanted.has(u.platform) || u.at < now - PASSED_GRACE_MS || u.at > now + ARRIVALS_HORIZON_MS) continue;
      out.push({ tripId, route: line.short, color: line.color, textColor: TEXT, headsign, at: u.at, platform: u.platform });
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, ARRIVALS_MAX);
}
