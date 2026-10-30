import { transit_realtime as rt } from "gtfs-realtime-bindings";
import { inBounds, type Region } from "@/domain/region";
import type { Diagnostics, Position, StopCall, StopState, Trip } from "@/domain/trip";
import { bearing, lerpLatLon, type LatLon } from "@/lib/geo";
import { dateInZone, serviceDayStart } from "@/lib/time";
import { deriveState, finalizeTrip } from "../finalize";
import type { AlertIndex } from "./alerts";
import type { FeedMessage } from "./realtime";
import type { MnrStaticData, StaticTrip, StaticTripRef } from "./static";

export const MNR_ID = "mnr";
export const MNR_TIMEZONE = "America/New_York";

const MIN = 60_000;
/** Show trips that depart within this window; the feed rarely lists further out. */
const LOOKAHEAD_MS = 90 * MIN;
/** Keep a finished trip visible briefly so it doesn't vanish mid-glance. */
const LINGER_MS = 3 * MIN;

interface StopUpdate {
  /** Absolute predicted time (ms) when the feed gives one. */
  time?: number;
  delaySec?: number;
}

/** GTFS-RT timestamps are seconds, possibly 64-bit `Long`s. */
function toMs(t: number | { toNumber(): number } | null | undefined): number | undefined {
  return t == null ? undefined : Number(t) * 1000;
}

/** Minutes late at a stop, from the feed's absolute time or its delay field. */
function delayMinutes(u: StopUpdate | undefined, scheduledArrival: number): number | undefined {
  if (u?.time !== undefined) return (u.time - scheduledArrival) / MIN;
  if (u?.delaySec !== undefined) return u.delaySec / 60;
  return undefined;
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
function serviceStart(startDate: string | null | undefined, trip: StaticTrip, now: number): number {
  if (startDate) return serviceDayStart(startDate, MNR_TIMEZONE);
  // Fall back to whichever of today/yesterday puts the trip closest to "now".
  const today = serviceDayStart(dateInZone(now, MNR_TIMEZONE), MNR_TIMEZONE);
  const yesterday = today - 24 * 60 * MIN;
  const mid = (trip.stopTimes[0]!.departureMin + trip.stopTimes.at(-1)!.arrivalMin) / 2;
  return Math.abs(today + mid * MIN - now) <= Math.abs(yesterday + mid * MIN - now) ? today : yesterday;
}

function buildStops(
  trip: StaticTrip,
  stopsById: MnrStaticData["stops"],
  start: number,
  updates: Map<string, StopUpdate>,
  now: number,
): StopCall[] {
  const calls: StopCall[] = [];
  let carried: number | undefined; // delay in minutes carried forward, per GTFS-RT semantics

  // Stops before the first update inherit that first update's delay once we know it.
  const firstKnown = trip.stopTimes
    .map((st) => delayMinutes(updates.get(st.stopId), start + st.arrivalMin * MIN))
    .find((d) => d !== undefined);

  for (const st of trip.stopTimes) {
    const scheduledArrival = start + st.arrivalMin * MIN;
    const scheduledDeparture = start + st.departureMin * MIN;
    const u = updates.get(st.stopId);
    const delay = delayMinutes(u, scheduledArrival) ?? carried;
    carried = delay;

    const effective = delay ?? firstKnown;
    const shift = (effective ?? 0) * MIN;
    const arrival = scheduledArrival + shift;
    const departure = Math.max(scheduledDeparture + shift, arrival);
    const state: StopState = now >= departure ? "departed" : now >= arrival ? "at" : "upcoming";

    calls.push({
      id: st.stopId,
      name: stopsById[st.stopId]?.name ?? st.stopId,
      state,
      scheduledArrival,
      scheduledDeparture,
      arrival,
      departure,
      delayMinutes: delay === undefined ? undefined : Math.round(delay),
    });
  }
  return calls;
}

function coords(stopsById: MnrStaticData["stops"], id: string): LatLon | undefined {
  const s = stopsById[id];
  return s ? { lat: s.lat, lon: s.lon } : undefined;
}

/** Place the trip along the straight line between the stops it is travelling between. */
function estimatePosition(stops: StopCall[], stopsById: MnrStaticData["stops"], now: number): Position | undefined {
  const nextIdx = stops.findIndex((s) => s.state !== "departed");
  if (nextIdx === -1) return undefined;
  const next = stops[nextIdx]!;
  const nextPos = coords(stopsById, next.id);
  if (!nextPos) return undefined;

  const prev = stops[nextIdx - 1];
  if (next.state === "at" || !prev) return { ...nextPos, source: "estimated" };

  const prevPos = coords(stopsById, prev.id);
  if (!prevPos) return { ...nextPos, source: "estimated" };
  const span = next.arrival! - prev.departure!;
  const t = span > 0 ? (now - prev.departure!) / span : 1;
  return { ...lerpLatLon(prevPos, nextPos, t), heading: bearing(prevPos, nextPos), source: "estimated" };
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
function pickCandidate(cands: StaticTripRef[], tu: rt.ITripUpdate, date: string, now: number): StaticTripRef {
  if (cands.length === 1) return cands[0]!;
  const wanted = startMinute(tu.trip.startTime);
  const byTime = wanted === undefined ? undefined : cands.find((c) => c.trip.stopTimes[0]?.departureMin === wanted);
  if (byTime) return byTime;
  const byRoute = tu.trip.routeId ? cands.find((c) => c.trip.routeId === tu.trip.routeId) : undefined;
  if (byRoute) return byRoute;
  // Otherwise the trip whose scheduled span is closest to now.
  const start = serviceDayStart(date, MNR_TIMEZONE);
  const gap = (c: StaticTripRef) => {
    const mid = (c.trip.stopTimes[0]!.departureMin + c.trip.stopTimes.at(-1)!.arrivalMin) / 2;
    return Math.abs(start + mid * MIN - now);
  };
  return [...cands].sort((a, b) => gap(a) - gap(b))[0]!;
}

function resolveTrip(entity: rt.IFeedEntity, tu: rt.ITripUpdate, staticData: MnrStaticData, now: number): Resolved | undefined {
  const tripId = tu.trip.tripId;
  const exact = tripId ? staticData.trip(tripId) : undefined;
  if (tripId && exact) return { id: tripId, trip: exact, via: "tripId" };

  const dates = tu.trip.startDate
    ? [tu.trip.startDate]
    : [dateInZone(now, MNR_TIMEZONE), dateInZone(now - 24 * 60 * MIN, MNR_TIMEZONE)];
  for (const number of numberCandidates(entity, tu)) {
    for (const date of dates) {
      const cands = staticData.tripsByNumber(number, date);
      if (cands.length) {
        const pick = pickCandidate(cands, tu, date, now);
        return { id: pick.id, trip: pick.trip, startDate: date, via: "trainNumber" };
      }
    }
  }
  return undefined;
}

export interface MnrInput {
  staticData: MnrStaticData;
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

export function buildMnrTrips({ staticData, realtime, alerts, region, now, diag }: MnrInput): Trip[] {
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
    diag.feedTimestamp = Number(realtime.header.timestamp) > 0 ? new Date(Number(realtime.header.timestamp) * 1000).toISOString() : "none";
  }

  const trips: Trip[] = [];
  const unmatched: string[] = [];
  for (const entity of realtime.entity) {
    const tu = entity.tripUpdate;
    if (!tu?.trip) continue;
    bump(diag, "tripUpdates");
    const resolved = resolveTrip(entity, tu, staticData, now);
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

    const start = serviceStart(tu.trip.startDate || resolved.startDate, trip, now);
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
    const position = reported ?? estimatePosition(stops, staticData.stops, now);
    if (position && !inBounds(region, position.lat, position.lon)) {
      bump(diag, "outsideRegion");
      continue;
    }

    const route = staticData.routes[trip.routeId];
    const reason = alerts.byTrip.get(tripId) ?? alerts.byTrip.get(resolved.id) ?? alerts.byRoute.get(trip.routeId);

    trips.push(
      finalizeTrip({
        id: `${MNR_ID}:${resolved.id}`,
        operatorId: MNR_ID,
        mode: "rail",
        number: trip.number,
        routeName: route ? `${route.name} Line` : "Metro-North",
        routeColor: route?.color ?? "#0b5ea8",
        origin: first.name,
        destination: trip.headsign || last.name,
        state: deriveState(stops, canceled),
        position,
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
