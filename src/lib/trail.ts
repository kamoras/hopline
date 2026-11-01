import { distanceMiles, lerpLatLon, type LatLon } from "./geo";

/** A path behind a moving vehicle, kept on this device only: nothing here is ever sent anywhere. */
export interface Sample extends LatLon {
  at: number;
}

/** How often a point is kept, how many at most, and how long a point lives (a trail is a short memory, never a history). */
export const TRAIL_STEP_MS = 3_000;
export const TRAIL_POINTS = 40;
export const TRAIL_TTL_MS = 60_000;

/**
 * Adds `p` to a vehicle's history when enough time has passed since the last kept point, and forgets points older than
 * `ttlMs`. Returns the new history. A vehicle that stops adds nothing, so its trail fades away.
 */
export function extendTrail(history: readonly Sample[] | undefined, p: LatLon, now: number, max = TRAIL_POINTS, ttlMs = TRAIL_TTL_MS): Sample[] {
  const fresh = (history ?? []).filter((s) => now - s.at < ttlMs);
  const last = fresh[fresh.length - 1];
  if (last && now - last.at < TRAIL_STEP_MS) return fresh;
  return [...fresh, { lat: p.lat, lon: p.lon, at: now }].slice(-max);
}

/**
 * The trail as short segments ending at the vehicle's current position. Each fades with its age, from solid at the
 * vehicle to nothing at `ttlMs`, so a trail dies away on its own, and a vehicle that stands still leaves none.
 */
export function trailSegments(history: readonly Sample[], head: LatLon, now: number, ttlMs = TRAIL_TTL_MS): { from: LatLon; to: LatLon; a: number }[] {
  const pts: (LatLon & { at: number })[] = [...history.filter((s) => now - s.at < ttlMs), { ...head, at: now }];
  return pts.slice(0, -1).map((from, i) => ({ from, to: pts[i + 1]!, a: Math.max(0, 1 - (now - pts[i + 1]!.at) / ttlMs) }));
}

/** A heading line stops this far from the plane: past that it is a direction to look, not a path across the country. */
export const LEAD_MAX_MILES = 120;

/** Where a heading line toward `to` ends: at `to` if it is near, else the point `LEAD_MAX_MILES` along the way. */
export function leadEnd(from: LatLon, to: LatLon | undefined): LatLon | undefined {
  if (!to) return undefined;
  const miles = distanceMiles(from, to);
  return miles <= LEAD_MAX_MILES ? to : lerpLatLon(from, to, LEAD_MAX_MILES / miles);
}
