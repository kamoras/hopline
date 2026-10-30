import type { Position, StopCall, StopState } from "@/domain/trip";
import { bearing, lerpLatLon, type LatLon } from "@/lib/geo";
import type { MotionLeg } from "@/lib/motion";
import { pointAlong, polylineLength, project, slicePolyline, type Polyline } from "@/lib/polyline";
import type { GtfsStaticData, StaticTrip } from "./static";

const MIN = 60_000;

export interface StopUpdate {
  /** Absolute predicted time (ms) when the feed gives one. */
  time?: number;
  delaySec?: number;
}

/** Minutes late at a stop, from the feed's absolute time or its delay field. */
export function delayMinutes(u: StopUpdate | undefined, scheduledArrival: number): number | undefined {
  if (u?.time !== undefined) return (u.time - scheduledArrival) / MIN;
  if (u?.delaySec !== undefined) return u.delaySec / 60;
  return undefined;
}

export function buildStops(
  trip: StaticTrip,
  stopsById: GtfsStaticData["stops"],
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
      platform: st.track,
    });
  }
  return calls;
}

export function coords(stopsById: GtfsStaticData["stops"], id: string): LatLon | undefined {
  const s = stopsById[id];
  return s ? { lat: s.lat, lon: s.lon } : undefined;
}

/** Place the trip along the straight line between the stops it is travelling between. */
/** A stop further than this from the track means the geometry isn't for this trip; don't trust it. */
const MAX_OFF_TRACK_M = 400;

/** Distances along the track of two stops, or nothing if the geometry doesn't fit them. */
function alongPair(prev: LatLon, next: LatLon, shape: Polyline | undefined): { a: number; b: number } | undefined {
  if (!shape) return undefined;
  const a = project(shape, prev);
  const b = project(shape, next);
  return a.offMeters <= MAX_OFF_TRACK_M && b.offMeters <= MAX_OFF_TRACK_M && a.along !== b.along ? { a: a.along, b: b.along } : undefined;
}

/** The route between two stops as a flat [lat, lon, ...] path: along the track if known, else straight. */
function pathBetween(prev: LatLon, next: LatLon, shape: Polyline | undefined): number[] {
  const on = alongPair(prev, next, shape);
  return on && shape ? slicePolyline(shape, on.a, on.b) : [prev.lat, prev.lon, next.lat, next.lon];
}

/**
 * Where the train will be until the next data refresh: the stretch it is on, ending at the stop it is
 * heading for. The map moves the train along it continuously, so it keeps rolling between refreshes.
 *
 * Deliberately only ONE stretch: the train must never be drawn past the stop it is heading for. If the
 * real train is running behind our prediction it waits at that stop until fresh data says it has left,
 * instead of gliding on through the station.
 */
export function buildLegs(stops: StopCall[], stopsById: GtfsStaticData["stops"], shape: Polyline | undefined): MotionLeg[] | undefined {
  const nextIdx = stops.findIndex((s) => s.state !== "departed");
  if (nextIdx === -1) return undefined;
  const from = stops[nextIdx]!.state === "at" || nextIdx === 0 ? nextIdx : nextIdx - 1;
  const legs: MotionLeg[] = [];
  for (let i = from; i < Math.min(stops.length - 1, from + 1); i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    const pa = coords(stopsById, a.id);
    const pb = coords(stopsById, b.id);
    if (pa && pb && a.departure !== undefined && b.arrival !== undefined) {
      legs.push({ t0: a.departure, t1: b.arrival, path: pathBetween(pa, pb, shape) });
    }
  }
  return legs.length ? legs : undefined;
}

/** Position between two stops, following the track when its geometry is known. */
function betweenStops(prev: LatLon, next: LatLon, t: number, shape: Polyline | undefined): Omit<Position, "source"> {
  if (shape) {
    const on = alongPair(prev, next, shape);
    if (on) {
      const along = on.a + (on.b - on.a) * Math.max(0, Math.min(1, t));
      const p = pointAlong(shape, Math.min(polylineLength(shape), along));
      // The polyline has one direction; the train may be travelling the other way along it.
      const heading = on.b >= on.a ? p.heading : (p.heading + 180) % 360;
      return { lat: p.lat, lon: p.lon, heading };
    }
  }
  return { ...lerpLatLon(prev, next, t), heading: bearing(prev, next) };
}

export function estimatePosition(stops: StopCall[], stopsById: GtfsStaticData["stops"], now: number, shape?: Polyline): Position | undefined {
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
  return { ...betweenStops(prevPos, nextPos, t, shape), source: "estimated" };
}
