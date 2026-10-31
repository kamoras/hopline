import { transit_realtime as rt } from "gtfs-realtime-bindings";
import { inBounds, type Region } from "@/domain/region";
import type { Diagnostics, Position, Trip } from "@/domain/trip";
import { dateInZone, serviceDayStart } from "@/lib/time";
import { deriveState, finalizeTrip } from "../finalize";
import type { AlertIndex } from "./alerts";
import type { FeedMessage } from "./feed";
import { buildLegs, buildStops, estimatePosition, type StopUpdate } from "./stops";
import type { GtfsStaticData, StaticTrip, StaticTripRef } from "./static";

/** What differs between railroads that publish a GTFS-Realtime feed. */
export interface RealtimeConfig {
  /** Provider id; prefixes trip ids and is the trip's `operatorId`. */
  id: string;
  /** Used for trips whose route is missing from the schedule. */
  name: string;
  /** Turns a schedule route name into the display name ("New Haven" -> "New Haven Line"). */
  routeLabel?(routeName: string): string;
}

const MIN = 60_000;
/** Show trips that depart within this window; the feed rarely lists further out. */
const LOOKAHEAD_MS = 90 * MIN;
/** Keep a finished trip visible briefly so it doesn't vanish mid-glance. */
const LINGER_MS = 3 * MIN;

/** GTFS-RT timestamps are seconds, possibly 64-bit `Long`s. */
function toMs(t: number | { toNumber(): number } | null | undefined): number | undefined {
  return t == null ? undefined : Number(t) * 1000;
}

/**
 * protobuf decoding exposes absent numeric fields as 0 via the prototype, which
 * would read as "on time at the epoch". Only trust fields set on the message.
 */
function updateFor(u: rt.TripUpdate.IStopTimeUpdate): StopUpdate {
  const ev = u.arrival ?? u.departure;
  if (!ev) return {};
  const time = Object.hasOwn(ev, "time") && Number(ev.time) > 0 ? toMs(ev.time) : undefined;
  const delaySec = Object.hasOwn(ev, "delay") ? (ev.delay ?? undefined) : undefined;
  return { time, delaySec };
}

/** Resolve the service date for a trip, tolerating feeds that omit start_date. */
function serviceStart(startDate: string | null | undefined, trip: StaticTrip, now: number, tz: string): number {
  if (startDate) return serviceDayStart(startDate, tz);
  // Fall back to whichever of today/yesterday puts the trip closest to "now".
  const today = serviceDayStart(dateInZone(now, tz), tz);
  const yesterday = today - 24 * 60 * MIN;
  const mid = (trip.stopTimes[0]!.departureMin + trip.stopTimes.at(-1)!.arrivalMin) / 2;
  return Math.abs(today + mid * MIN - now) <= Math.abs(yesterday + mid * MIN - now) ? today : yesterday;
}

interface Resolved {
  /** Schedule trip id (stable, unique). */
  id: string;
  trip: StaticTrip;
  /** Service date (YYYYMMDD) the trip was matched on, if the feed didn't state one. */
  startDate?: string;
  via: "tripId" | "trainNumber";
}

/**
 * Public train numbers a feed entity might carry. Metro-North puts the number in the entity id
 * (and vehicle label); its `trip_id` is opaque and does not match the static schedule.
 */
function numberCandidates(entity: rt.IFeedEntity, tu: rt.ITripUpdate): string[] {
  const raw = [entity.id, tu.vehicle?.label, tu.vehicle?.id, tu.trip.tripId];
  // Numbers can carry letters ("EB1997"); trip ids are far longer and contain "+".
  return [...new Set(raw.filter((x): x is string => !!x && /^[A-Za-z]{0,3}\d+$/.test(x)))];
}

const startMinute = (hms: string | null | undefined) => {
  const [h, m] = (hms ?? "").split(":").map(Number);
  return h === undefined || m === undefined || Number.isNaN(h + m) ? undefined : h * 60 + m;
};

/** Of several schedule trips sharing a number and date, pick the one the update is about. */
function pickCandidate(cands: StaticTripRef[], tu: rt.ITripUpdate, date: string, now: number, tz: string): StaticTripRef {
  if (cands.length === 1) return cands[0]!;
  const wanted = startMinute(tu.trip.startTime);
  const byTime = wanted === undefined ? undefined : cands.find((c) => c.trip.stopTimes[0]?.departureMin === wanted);
  if (byTime) return byTime;
  const byRoute = tu.trip.routeId ? cands.find((c) => c.trip.routeId === tu.trip.routeId) : undefined;
  if (byRoute) return byRoute;
  // Otherwise the trip whose scheduled span is closest to now.
  const start = serviceDayStart(date, tz);
  const gap = (c: StaticTripRef) => {
    const mid = (c.trip.stopTimes[0]!.departureMin + c.trip.stopTimes.at(-1)!.arrivalMin) / 2;
    return Math.abs(start + mid * MIN - now);
  };
  return [...cands].sort((a, b) => gap(a) - gap(b))[0]!;
}

function resolveTrip(entity: rt.IFeedEntity, tu: rt.ITripUpdate, staticData: GtfsStaticData, now: number, tz: string): Resolved | undefined {
  const tripId = tu.trip.tripId;
  const exact = tripId ? staticData.trip(tripId) : undefined;
  if (tripId && exact) return { id: tripId, trip: exact, via: "tripId" };

  const dates = tu.trip.startDate
    ? [tu.trip.startDate]
    : [dateInZone(now, tz), dateInZone(now - 24 * 60 * MIN, tz)];
  for (const number of numberCandidates(entity, tu)) {
    for (const date of dates) {
      const cands = staticData.tripsByNumber(number, date);
      if (cands.length) {
        const pick = pickCandidate(cands, tu, date, now, tz);
        return { id: pick.id, trip: pick.trip, startDate: date, via: "trainNumber" };
      }
    }
  }
  return undefined;
}

export interface RealtimeInput {
  config: RealtimeConfig;
  staticData: GtfsStaticData;
  realtime: FeedMessage;
  alerts: AlertIndex;
  region: Region;
  now: number;
  /** Optional counters describing what was kept and why the rest was dropped. */
  diag?: Diagnostics;
}

const bump = (d: Diagnostics | undefined, key: string) => {
  if (d) d[key] = Number(d[key] ?? 0) + 1;
};

export function buildRealtimeTrips({ config, staticData, realtime, alerts, region, now, diag }: RealtimeInput): Trip[] {
  const tz = region.timeZone;
  // Vehicle positions are keyed by every identifier they carry, since trip ids don't line up.
  const vehicles = new Map<string, rt.IVehiclePosition>();
  for (const e of realtime.entity) {
    if (!e.vehicle?.position) continue;
    for (const key of [e.vehicle.trip?.tripId, e.vehicle.vehicle?.label, e.vehicle.vehicle?.id, e.id]) {
      if (key) vehicles.set(key, e.vehicle);
    }
  }

  if (diag) {
    diag.feedEntities = realtime.entity.length;
    diag.feedVehicles = vehicles.size;
    const ts = Number(realtime.header.timestamp);
    diag.feedTimestamp = ts > 0 ? new Date(ts * 1000).toISOString() : "none";
    // How stale the source's own data is: the floor on how real-time anything we show can be.
    if (ts > 0) diag.feedAgeSeconds = Math.max(0, Math.round(now / 1000 - ts));
  }

  const trips: Trip[] = [];
  const unmatched: string[] = [];
  for (const entity of realtime.entity) {
    const tu = entity.tripUpdate;
    if (!tu?.trip) continue;
    bump(diag, "tripUpdates");
    const resolved = resolveTrip(entity, tu, staticData, now, tz);
    if (!resolved || resolved.trip.stopTimes.length === 0) {
      bump(diag, "unknownTrip");
      if (unmatched.length < 3) {
        unmatched.push(`id=${entity.id} trip=${tu.trip.tripId} date=${tu.trip.startDate} time=${tu.trip.startTime}`);
      }
      continue;
    }
    bump(diag, resolved.via === "tripId" ? "matchedByTripId" : "matchedByTrainNumber");
    const { trip } = resolved;
    const tripId = tu.trip.tripId ?? "";

    const canceled = tu.trip.scheduleRelationship === rt.TripDescriptor.ScheduleRelationship.CANCELED;
    const updates = new Map<string, StopUpdate>();
    for (const u of tu.stopTimeUpdate ?? []) if (u.stopId) updates.set(u.stopId, updateFor(u));

    const start = serviceStart(tu.trip.startDate || resolved.startDate, trip, now, tz);
    const stops = buildStops(trip, staticData.stops, start, updates, now);
    const first = stops[0]!;
    const last = stops.at(-1)!;
    if (first.departure! - now > LOOKAHEAD_MS || now - last.arrival! > LINGER_MS) {
      bump(diag, "outsideTimeWindow");
      continue;
    }

    const vehicle = [tripId, entity.id, ...numberCandidates(entity, tu)].map((k) => (k ? vehicles.get(k) : undefined)).find(Boolean);
    const reported = vehicle?.position
      ? ({
          lat: vehicle.position.latitude,
          lon: vehicle.position.longitude,
          heading: vehicle.position.bearing ?? undefined,
          speedMph: vehicle.position.speed ? vehicle.position.speed * 2.23694 : undefined,
          source: "reported",
        } satisfies Position)
      : undefined;
    const position = reported ?? estimatePosition(stops, staticData.stops, now, trip.shape);
    if (position && !inBounds(region, position.lat, position.lon)) {
      bump(diag, "outsideRegion");
      continue;
    }

    const route = staticData.routes[trip.routeId];
    const reason = alerts.byTrip.get(tripId) ?? alerts.byTrip.get(resolved.id) ?? alerts.byRoute.get(trip.routeId);

    trips.push(
      finalizeTrip({
        id: `${config.id}:${resolved.id}`,
        operatorId: config.id,
        mode: "rail",
        number: trip.number,
        routeName: route ? (config.routeLabel?.(route.name) ?? route.name) : config.name,
        routeColor: route?.color ?? "#0b5ea8",
        origin: first.name,
        destination: trip.headsign || last.name,
        state: deriveState(stops, canceled),
        position,
        motion: buildLegs(stops, staticData.stops, trip.shape),
        stops,
        delayReason: reason,
        updatedAt: toMs(vehicle?.timestamp ?? tu.timestamp ?? realtime.header.timestamp) ?? now,
      }),
    );
  }
  if (diag) {
    diag.kept = trips.length;
    if (unmatched.length) {
      diag.unmatchedFeedSamples = unmatched.join(" ; ");
      diag.exampleScheduleTripId = staticData.tripIds()[0] ?? "none";
    }
  }
  return trips;
}
