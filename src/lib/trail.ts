import { distanceMiles, lerpLatLon, type LatLon } from "./geo";

/** A path behind a moving vehicle, kept on this device only: nothing here is ever sent anywhere. */
export interface Sample extends LatLon {
  at: number;
}

/** How often a point is kept, and how many (so a trail covers about two minutes). */
export const TRAIL_STEP_MS = 3_000;
export const TRAIL_POINTS = 40;

/** Adds `p` to a vehicle's history when enough time has passed since the last kept point. Returns the new history. */
export function extendTrail(history: readonly Sample[] | undefined, p: LatLon, now: number, max = TRAIL_POINTS): Sample[] {
  const h = history ?? [];
  const last = h[h.length - 1];
  if (last && now - last.at < TRAIL_STEP_MS) return h as Sample[];
  return [...h, { lat: p.lat, lon: p.lon, at: now }].slice(-max);
}

/** The trail as short segments that fade toward the tail, ending at the vehicle's current position. */
export function trailSegments(history: readonly Sample[], head: LatLon): { from: LatLon; to: LatLon; a: number }[] {
  const pts: LatLon[] = [...history, head];
  const n = pts.length - 1;
  return pts.slice(0, -1).map((from, i) => ({ from, to: pts[i + 1]!, a: (i + 1) / Math.max(1, n) }));
}

/** A heading line stops this far from the plane: past that it is a direction to look, not a path across the country. */
export const LEAD_MAX_MILES = 120;

/** Where a heading line toward `to` ends: at `to` if it is near, else the point `LEAD_MAX_MILES` along the way. */
export function leadEnd(from: LatLon, to: LatLon | undefined): LatLon | undefined {
  if (!to) return undefined;
  const miles = distanceMiles(from, to);
  return miles <= LEAD_MAX_MILES ? to : lerpLatLon(from, to, LEAD_MAX_MILES / miles);
}
