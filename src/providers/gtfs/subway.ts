import { transit_realtime as rt } from "gtfs-realtime-bindings";
import type { Arrival } from "@/domain/arrival";
import type { Place } from "@/domain/place";
import { placeSlug } from "@/domain/place";
import type { Diagnostics, Position, StopCall, Trip } from "@/domain/trip";
import { finalizeTrip } from "../finalize";
import type { FeedMessage } from "./feed";
import type { GtfsStaticData, StaticRoute } from "./static";

/**
 * Subway boards built from an operator's GTFS-Realtime trip updates and vehicle positions, shared by
 * the Boston and Washington subways. Each operator supplies only its bundled stations and lines.
 */

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
  /** Badge text color; white unless the line's color needs dark text (Yellow). */
  text?: string;
}

export interface SubwayStatic {
  data: GtfsStaticData;
  stations: Station[];
  lines: Record<string, LineInfo>;
  stationOfPlatform(platformId: string): Station | undefined;
}

/** Groups the schedule's per-track platforms into stations by name (the feed names each after its station). */
export function createSubwayStatic(data: GtfsStaticData): SubwayStatic {
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

/** Stops sent per trip: the next few and the destination. Station arrivals are served separately. */
const STOPS_KEPT = 3;
/** Updates this far in the past are stops already served. */
const PASSED_GRACE_MS = 30_000;
/** How far ahead arrivals are listed. Beyond this a station board is just noise. */
const ARRIVALS_HORIZON_MS = 45 * 60_000;
const ARRIVALS_MAX = 60;
const DEFAULT_TEXT = "#FFFFFF";

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

function upcomingStops(tu: rt.ITripUpdate | null | undefined, data: SubwayStatic, now: number): Upcoming[] {
  return (tu?.stopTimeUpdate ?? []).flatMap((u) => {
    const at = timeMs(u.arrival) ?? timeMs(u.departure);
    return at !== undefined && u.stopId && data.stationOfPlatform(u.stopId) && at >= now - PASSED_GRACE_MS ? [{ platform: u.stopId, at }] : [];
  });
}

export interface SubwayTripsInput {
  /** The operator id, which prefixes trip ids and is the trip's operator. */
  operatorId: string;
  staticData: SubwayStatic;
  tripUpdates: FeedMessage;
  vehicles: FeedMessage;
  now: number;
  diag?: Diagnostics;
}

/**
 * Subway trips from an operator's feeds. Unlike the NYC subway, every train reports a GPS position, so
 * the map shows where it is; trip updates add the stops it is heading for.
 */
export function buildSubwayTrips({ operatorId, staticData, tripUpdates, vehicles, now, diag }: SubwayTripsInput): Trip[] {
  const updates = new Map<string, rt.ITripUpdate>();
  for (const e of tripUpdates.entity) if (e.tripUpdate?.trip.tripId) updates.set(e.tripUpdate.trip.tripId, e.tripUpdate);

  const trips: Trip[] = [];
  for (const entity of vehicles.entity) {
    const v = entity.vehicle;
    const routeId = v?.trip?.routeId;
    const line = routeId ? staticData.lines[routeId] : undefined;
    if (!v || !line) continue; // the MBTA shares its feed with buses, commuter rail and ferries; WMATA lists trains with no trip
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
        id: `${operatorId}:${tripId}`,
        operatorId,
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

/** Every station as a searchable place; its platform ids are the `codes` that arrivals are matched on. */
export const subwayPlaces = ({ stations }: SubwayStatic, regionId: string): (Omit<Place, "id"> & { id: string })[] =>
  stations.map((s) => ({ id: placeSlug(s.name), name: s.name, lat: s.lat, lon: s.lon, mode: "subway", regionId, codes: s.platforms }));

/** Trains due at a station (any of its platforms): when each arrives and where it is going. */
export function buildSubwayArrivals({
  staticData,
  tripUpdates,
  platforms,
  now,
}: {
  staticData: SubwayStatic;
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
      out.push({ tripId, route: line.short, color: line.color, textColor: line.text ?? DEFAULT_TEXT, headsign, at: u.at, platform: u.platform });
    }
  }
  return out.sort((a, b) => a.at - b.at).slice(0, ARRIVALS_MAX);
}
