import type { Trip } from "@/domain/trip";

/** A vehicle that has just pulled into a station: where, and in what color, so the map can ripple there. */
export interface Arrival {
  id: string;
  lat: number;
  lon: number;
  color: string;
}

/**
 * Vehicles that are at a station now but were not at the last refresh. `before` is the set from the last call
 * (nothing on the first call, so opening the page does not ripple everywhere at once). The caller keeps `now`
 * for the next refresh.
 */
export function newArrivals(before: ReadonlySet<string> | undefined, trips: readonly Trip[]): { arrivals: Arrival[]; now: Set<string> } {
  const now = new Set<string>();
  const arrivals: Arrival[] = [];
  for (const t of trips) {
    if (t.state !== "at-station" || !t.position) continue;
    now.add(t.id);
    if (before && !before.has(t.id)) arrivals.push({ id: t.id, lat: t.position.lat, lon: t.position.lon, color: t.routeColor });
  }
  return { arrivals, now };
}
