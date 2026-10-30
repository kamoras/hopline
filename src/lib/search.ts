import { isDelayed } from "@/domain/delay";
import { normalizeName } from "@/domain/place";
import type { DelayStatus, StopCall, Trip } from "@/domain/trip";

export type OperatorFilter = "all" | string;

export interface Filters {
  query: string;
  operator: OperatorFilter;
  delayedOnly: boolean;
}

export interface Match {
  trip: Trip;
  /** Set when the query matched a station: the stop the commuter cares about. */
  stop?: StopCall;
  /** Set for "A to B" queries: where the rider gets off. */
  to?: StopCall;
}

export interface Route {
  from: string;
  to: string;
}

/** "stamford to grand central", "stamford → grand central", "stamford > grand central". */
export function parseRoute(query: string): Route | undefined {
  const m = query.match(/^\s*(.+?)\s*(?:\bto\b|->|→|>)\s*(.+?)\s*$/i);
  const from = normalizeName(m?.[1] ?? "");
  const to = normalizeName(m?.[2] ?? "");
  return from && to ? { from, to } : undefined;
}

export const routeKey = (r: Route) => `${r.from} to ${r.to}`;

const SEVERITY: Record<DelayStatus, number> = { major: 0, canceled: 1, minor: 2, "on-time": 3, unknown: 4 };


function nextTime(s: StopCall | undefined): number {
  return s?.arrival ?? s?.departure ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Filters and orders trips. A query that looks like a trip number matches by
 * number; otherwise it matches stations (the trip must still be due there)
 * and route/destination names. Station matches sort by arrival at that station,
 * which answers "when's my trip at my stop?" directly.
 */
export function searchTrips(trips: readonly Trip[], filters: Filters): Match[] {
  const route = parseRoute(filters.query);
  const q = normalizeName(filters.query);
  let matches: Match[] = [];

  for (const trip of trips) {
    if (filters.operator !== "all" && trip.operatorId !== filters.operator) continue;
    if (filters.delayedOnly && !isDelayed(trip)) continue;
    if (trip.state === "completed") continue;

    if (route) {
      const fromIdx = trip.stops.findIndex((x) => x.state !== "departed" && normalizeName(x.name).includes(route.from));
      const to = fromIdx < 0 ? undefined : trip.stops.slice(fromIdx + 1).find((x) => normalizeName(x.name).includes(route.to));
      if (to) matches.push({ trip, stop: trip.stops[fromIdx], to });
      continue;
    }
    if (!q) {
      matches.push({ trip });
      continue;
    }
    if (/^\d+$/.test(q)) {
      if (trip.number.startsWith(q)) matches.push({ trip });
      continue;
    }
    const stop = trip.stops.find((s) => s.state !== "departed" && normalizeName(s.name).includes(q));
    if (stop) {
      matches.push({ trip, stop });
      continue;
    }
    if (normalizeName(`${trip.routeName} ${trip.destination}`).includes(q)) matches.push({ trip });
  }

  const byStop = matches.some((m) => m.stop);
  matches = matches.sort((a, b) => {
    if (byStop) return nextTime(a.stop) - nextTime(b.stop);
    const sev = SEVERITY[a.trip.delayStatus] - SEVERITY[b.trip.delayStatus];
    return sev || nextTime(a.trip.nextStop) - nextTime(b.trip.nextStop);
  });
  return matches;
}

/** Stable key for "my trip": the public number survives across days, trip ids don't. */
export function pinKey(t: Pick<Trip, "operatorId" | "number">): string {
  return `${t.operatorId}:${t.number}`;
}
