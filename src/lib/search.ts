import { isDelayed } from "@/domain/delay";
import type { DelayStatus, StopCall, Trip } from "@/domain/trip";
import { expandTerm, nameMatches, parseIntent, type Aliases } from "./query";

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
  /** Which leg of a journey this belongs to (0 outbound, 1 return). */
  leg?: number;
}

export interface SearchContext {
  /** Region place aliases, so "new york" finds Grand Central and Penn Station. */
  aliases?: Aliases;
  /** Clock for "right now" style queries. */
  now?: number;
}

const SEVERITY: Record<DelayStatus, number> = { major: 0, canceled: 1, minor: 2, "on-time": 3, unknown: 4 };


function nextTime(s: StopCall | undefined): number {
  return s?.arrival ?? s?.departure ?? Number.MAX_SAFE_INTEGER;
}

const MIN_MS = 60_000;

/**
 * Filters and orders trips. Understands plain language (see parseIntent):
 *  - "A to B" (also "round trip"): trips that call at A and later at B, A still ahead;
 *  - "right now" / "in the next 30 minutes": only departures inside that window;
 *  - a trip number, a station (trip must still be due there), or a line/destination name.
 * Station and route matches sort by time at the rider's stop, which answers
 * "when's my trip at my stop?" directly.
 */
export function searchTrips(trips: readonly Trip[], filters: Filters, ctx: SearchContext = {}): Match[] {
  const intent = parseIntent(filters.query);
  const q = intent.rest;
  const stationTerms = q ? expandTerm(q, ctx.aliases) : [];
  const horizon = intent.soonMinutes !== undefined && ctx.now !== undefined ? ctx.now + intent.soonMinutes * MIN_MS : undefined;
  const dueSoon = (s: StopCall | undefined) => horizon === undefined || nextTime(s) <= horizon;
  let matches: Match[] = [];

  for (const trip of trips) {
    if (filters.operator !== "all" && trip.operatorId !== filters.operator) continue;
    if (filters.delayedOnly && !isDelayed(trip)) continue;
    if (trip.state === "completed") continue;

    if (intent.legs.length) {
      intent.legs.forEach((leg, i) => {
        const fromTerms = expandTerm(leg.from, ctx.aliases);
        const toTerms = expandTerm(leg.to, ctx.aliases);
        const fromIdx = trip.stops.findIndex((x) => x.state !== "departed" && nameMatches(x.name, fromTerms));
        const from = trip.stops[fromIdx];
        const to = fromIdx < 0 ? undefined : trip.stops.slice(fromIdx + 1).find((x) => nameMatches(x.name, toTerms));
        if (from && to && dueSoon(from)) matches.push({ trip, stop: from, to, leg: i });
      });
      continue;
    }
    if (!q) {
      if (dueSoon(trip.nextStop)) matches.push({ trip });
      continue;
    }
    if (/^\d+$/.test(q)) {
      if (trip.number.startsWith(q)) matches.push({ trip });
      continue;
    }
    const stop = trip.stops.find((s) => s.state !== "departed" && nameMatches(s.name, stationTerms));
    if (stop) {
      if (dueSoon(stop)) matches.push({ trip, stop });
      continue;
    }
    if (nameMatches(`${trip.routeName} ${trip.destination}`, stationTerms)) matches.push({ trip });
  }

  const byStop = matches.some((m) => m.stop);
  matches = matches.sort((a, b) => {
    if (byStop) return (a.leg ?? 0) - (b.leg ?? 0) || nextTime(a.stop) - nextTime(b.stop);
    const sev = SEVERITY[a.trip.delayStatus] - SEVERITY[b.trip.delayStatus];
    return sev || nextTime(a.trip.nextStop) - nextTime(b.trip.nextStop);
  });
  return matches;
}

/** Stable key for "my trip": the public number survives across days, trip ids don't. */
export function pinKey(t: Pick<Trip, "operatorId" | "number">): string {
  return `${t.operatorId}:${t.number}`;
}
