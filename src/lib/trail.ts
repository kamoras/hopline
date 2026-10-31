import type { LatLon } from "./geo";

/** A path behind a moving vehicle, kept on this device only: nothing here is ever sent anywhere. */
export interface Sample extends LatLon {
  at: number;
}

/** How often a point is kept, and how many (so a trail covers about two minutes). */
export const TRAIL_STEP_MS = 3_000;
export const TRAIL_POINTS = 40;

/** Adds `p` to a vehicle's history when enough time has passed since the last kept point. Returns the new history. */
export function extendTrail(history: readonly Sample[] | undefined, p: LatLon, now: number): Sample[] {
  const h = history ?? [];
  const last = h[h.length - 1];
  if (last && now - last.at < TRAIL_STEP_MS) return h as Sample[];
  return [...h, { lat: p.lat, lon: p.lon, at: now }].slice(-TRAIL_POINTS);
}

/** The trail as short segments that fade toward the tail, ending at the vehicle's current position. */
export function trailSegments(history: readonly Sample[], head: LatLon): { from: LatLon; to: LatLon; a: number }[] {
  const pts: LatLon[] = [...history, head];
  const n = pts.length - 1;
  return pts.slice(0, -1).map((from, i) => ({ from, to: pts[i + 1]!, a: (i + 1) / Math.max(1, n) }));
}
