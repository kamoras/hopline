import type { LatLon } from "@/lib/geo";
import { bearing } from "@/lib/geo";

/**
 * Where an airline flight is going. ADS-B says where a plane is, not where it is headed, so the flight's route is looked
 * up by callsign in adsb.lol's public route data (keyless static files). Routes barely change, so each is kept for hours;
 * a callsign with no route (a charter, a cargo flight) is remembered too and not asked about again.
 */
export interface RouteAirport extends LatLon {
  iata: string;
  name: string;
  city: string;
}

export type KnownRoute = readonly RouteAirport[];

const ROUTES_URL = process.env.ADSB_ROUTES_URL || "https://vrs-standing-data.adsb.lol/routes";
const KEEP_MS = 6 * 60 * 60_000;
/** Callsigns asked about per refresh, so a busy sky fills in over a few refreshes instead of all at once. */
const PER_REFRESH = 40;
const FETCH_TIMEOUT_MS = 4_000;
/** How long a refresh waits for lookups before showing what it has; the rest finish for the next one. */
const WAIT_MS = 1_500;

const cache = new Map<string, { at: number; route: KnownRoute | null }>();
const inflight = new Set<string>();

/** The cached route for a callsign, if one is known (null: known to have none). */
export const cachedRoute = (callsign: string, now: number): KnownRoute | null | undefined => {
  const hit = cache.get(callsign);
  return hit && now - hit.at < KEEP_MS ? hit.route : undefined;
};

async function lookup(callsign: string, now: number): Promise<void> {
  try {
    const res = await fetch(`${ROUTES_URL}/${callsign.slice(0, 2)}/${callsign}.json`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.status === 404) return void cache.set(callsign, { at: now, route: null });
    if (!res.ok) return; // try again next refresh
    const body = (await res.json()) as { _airports?: { iata?: string; name?: string; location?: string; lat?: number; lon?: number }[] };
    const airports = (body._airports ?? []).flatMap((a): RouteAirport[] =>
      a.iata && typeof a.lat === "number" && typeof a.lon === "number" ? [{ iata: a.iata, name: a.name ?? a.iata, city: a.location ?? a.name ?? a.iata, lat: a.lat, lon: a.lon }] : [],
    );
    cache.set(callsign, { at: now, route: airports.length >= 2 ? airports : null });
  } catch {
    // A failed lookup just leaves the flight without a destination for now.
  }
}

/** Starts looking up the callsigns not yet known and waits briefly for them. Never throws. */
export async function warmRoutes(callsigns: readonly string[], now: number): Promise<void> {
  const wanted = callsigns.filter((c) => cachedRoute(c, now) === undefined && !inflight.has(c)).slice(0, PER_REFRESH);
  const jobs = wanted.map((c) => {
    inflight.add(c);
    return lookup(c, now).finally(() => inflight.delete(c));
  });
  if (jobs.length) await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, WAIT_MS))]);
}

/** Which end of a route a plane is heading for: the airport its track points at best. The other end is where it came from. */
export function routeEnds(route: KnownRoute, at: LatLon, track: number): { from: RouteAirport; to: RouteAirport } {
  const off = (a: RouteAirport) => {
    const d = Math.abs(((bearing(at, a) - track + 540) % 360) - 180);
    return d;
  };
  const ranked = [...route].sort((a, b) => off(a) - off(b));
  return { to: ranked[0]!, from: ranked.at(-1)! };
}

/** Test hook: forget everything. */
export const clearRoutes = () => {
  cache.clear();
  inflight.clear();
};

/** Test hook: seed a route without the network. */
export const seedRoute = (callsign: string, route: KnownRoute | null, now: number) => void cache.set(callsign, { at: now, route });
