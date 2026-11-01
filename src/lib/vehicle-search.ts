import { normalizeName } from "@/domain/place";
import type { Trip } from "@/domain/trip";

const LIMIT = 12;

/** The best rank a query earns against a vehicle (lower is better), or nothing if it does not match. */
function rank(trip: Trip, q: string): number | undefined {
  // "ICE 689" and "ice689" are the same callsign.
  const number = normalizeName(trip.number).replaceAll(" ", "");
  const squashed = q.replaceAll(" ", "");
  if (number === squashed) return 0;
  if (number.startsWith(squashed)) return 1;
  if (normalizeName(trip.routeName).includes(q)) return 2;
  if (normalizeName(`${trip.destination} ${trip.origin}`).includes(q)) return 3;
  if (trip.stops.some((s) => s.state !== "departed" && normalizeName(s.name).includes(q))) return 4;
  return undefined;
}

/**
 * The vehicles running right now that a search means: a number or callsign ("ICE689", "2150"), a route or line ("Acela",
 * "Red"), a destination ("Orlando"), or a station it is still headed for. Best match first, then soonest to its next stop.
 */
export function searchVehicles(trips: readonly Trip[], query: string, limit = LIMIT): Trip[] {
  const q = normalizeName(query);
  if (!q) return [];
  return trips
    .flatMap((t) => {
      const r = t.state === "completed" ? undefined : rank(t, q);
      return r === undefined ? [] : [{ t, r }];
    })
    .sort((a, b) => a.r - b.r || (a.t.nextStop?.arrival ?? Infinity) - (b.t.nextStop?.arrival ?? Infinity) || a.t.number.localeCompare(b.t.number, undefined, { numeric: true }))
    .slice(0, limit)
    .map(({ t }) => t);
}
