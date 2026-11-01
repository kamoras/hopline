import type { Trip } from "@/domain/trip";
import { aliasesOfAll } from "./aliases";
import { routeKey, type Route } from "./query";
import { searchTrips } from "./search";

/** Trips that call at `from` and then `to` (a saved commute), the soonest first, with the stop at each end. */
export function commuteMatches(trips: readonly Trip[], route: Route, now: number) {
  return searchTrips(trips, { query: routeKey(route), operator: "all", delayedOnly: false }, { aliases: aliasesOfAll(), now }).flatMap((m) =>
    m.stop && m.to ? [{ trip: m.trip, from: m.stop, to: m.to }] : [],
  );
}
