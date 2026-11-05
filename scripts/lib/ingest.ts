/**
 * The decisions the ingestion job makes about a candidate agency, kept pure so they are tested: what modes a schedule holds,
 * whether it is in service, whether its live feed really matches it, and how to build each part.
 */
import type { Row } from "./catalog";

export type IngestMode = "bus" | "subway" | "rail" | "ferry";

/** GTFS route types to the mode a rider would look for them under (cable cars and funiculars are left out). */
export function modeOfRouteType(type: string): IngestMode | undefined {
  const t = Number(type);
  if (t === 3 || t === 11 || (t >= 700 && t < 800) || (t >= 800 && t < 900)) return "bus";
  if (t === 0 || t === 1 || t === 12 || (t >= 400 && t < 500) || (t >= 900 && t < 1000)) return "subway";
  if (t === 2 || (t >= 100 && t < 200)) return "rail";
  if (t === 4 || (t >= 1000 && t < 1100)) return "ferry";
  return undefined;
}

/** Which modes a schedule's routes hold, with the route type values of each (the build filters on them). */
export function modesIn(routes: readonly Row[]): Map<IngestMode, string[]> {
  const out = new Map<IngestMode, Set<string>>();
  for (const r of routes) {
    const mode = modeOfRouteType(r.route_type ?? "");
    if (mode) out.set(mode, (out.get(mode) ?? new Set()).add(r.route_type!));
  }
  return new Map([...out].map(([m, types]) => [m, [...types]]));
}

/** Is the schedule in service from `today` on? (a calendar that ends before it, or no dates at all, is a dead feed) */
export function inService(calendar: readonly Row[], calendarDates: readonly Row[], today: string): boolean {
  return calendar.some((c) => (c.end_date ?? "") >= today) || calendarDates.some((d) => (d.date ?? "") >= today && d.exception_type === "1");
}

export interface LiveCheck {
  vehicles: number;
  /** Vehicles whose route (or, failing that, trip) is in the schedule. */
  matched: number;
  /** Vehicles that name their route at all (a feed that names only the trip needs the schedule's trips kept). */
  withRoute: number;
}

/** A live feed is usable when most of its vehicles can be tied to the schedule it came with. */
export const liveWorks = ({ vehicles, matched }: LiveCheck) => vehicles >= 1 && matched / vehicles >= 0.6;
export const namesRoutes = ({ vehicles, withRoute }: LiveCheck) => vehicles > 0 && withRoute / vehicles >= 0.8;

/** Matches vehicles (their route and trip ids) against a schedule's. */
export function checkLive(vehicles: readonly { routeId?: string | null; tripId?: string | null }[], routeIds: ReadonlySet<string>, tripIds: ReadonlySet<string>): LiveCheck {
  let matched = 0;
  let withRoute = 0;
  for (const v of vehicles) {
    if (v.routeId) withRoute++;
    if (v.routeId ? routeIds.has(v.routeId) : v.tripId ? tripIds.has(v.tripId) : false) matched++;
  }
  return { vehicles: vehicles.length, matched, withRoute };
}

export interface Plan {
  mode: IngestMode;
  kind: "live" | "timetable";
  routeTypes: string[];
  /** The options for `build-rail-gtfs.ts` (the same shape as an entry in its table). */
  options: Record<string, unknown>;
}

/**
 * What to serve for one mode of a schedule. A live feed that matches gets a live provider (buses only ever live: a
 * timetable-only bus map is noise); without one, trains, metro and ferries are served from the timetable.
 */
export function planFor(mode: IngestMode, routeTypes: string[], live: LiveCheck | undefined): Plan | undefined {
  const base = { routeTypes, shortFromFeed: true, routeTextColor: true };
  if (live && liveWorks(live)) {
    const keepTrips = !namesRoutes(live); // the live feed names only the trip: the schedule's trips say which route
    const options =
      mode === "bus"
        ? { ...base, realtimeOnly: !keepTrips, scanStops: !keepTrips, coarseGapM: 1e9 }
        : { ...base, realtimeOnly: !keepTrips, platformStops: mode === "subway", coarseGapM: mode === "ferry" ? 1e9 : 5_000 };
    return { mode, kind: "live", routeTypes, options };
  }
  if (mode === "bus") return undefined;
  return { mode, kind: "timetable", routeTypes, options: { ...base, platformStops: mode === "subway", coarseGapM: mode === "ferry" ? 1e9 : 5_000 } };
}

/** The data key for one mode of an agency (an agency with several modes gets one key each). */
export const keyFor = (id: string, mode: IngestMode, modeCount: number) => (modeCount > 1 ? `${id}-${mode}` : id);

export interface Report<S extends { key: string }, R extends { id: string }> {
  served: S[];
  rejected: R[];
}

/** Joins the reports of parallel batches (each a slice of the catalog) into one, sorted, with an agency counted once. */
export function mergeReports<S extends { key: string }, R extends { id: string }>(parts: readonly Report<S, R>[]): Report<S, R> {
  const served = new Map<string, S>();
  const rejected = new Map<string, R>();
  for (const part of parts) {
    for (const s of part.served) served.set(s.key, s);
    for (const r of part.rejected) rejected.set(r.id, r);
  }
  return {
    served: [...served.values()].sort((a, b) => a.key.localeCompare(b.key)),
    rejected: [...rejected.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** The served agencies whose published files are not in hand: kept from the host that already has them. */
export const missingKeys = (served: readonly { key: string }[], have: ReadonlySet<string>) => served.map((s) => s.key).filter((k) => !have.has(k));
