import type { LatLon } from "./geo";

/**
 * A track (or any path) as a polyline, with distances in meters. Uses a local
 * flat-earth projection, accurate to well under a meter over a rail corridor.
 */
export interface Polyline {
  pts: LatLon[];
  /** Cumulative distance in meters at each point. */
  cum: number[];
  kx: number;
  ky: number;
}

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LON_EQ = 111_320;

/** From a flat [lat, lon, lat, lon, ...] array, the format used in bundled schedule data. */
export function createPolyline(flat: readonly number[]): Polyline {
  const pts: LatLon[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) pts.push({ lat: flat[i]!, lon: flat[i + 1]! });
  const lat0 = pts[0]?.lat ?? 0;
  const kx = M_PER_DEG_LON_EQ * Math.cos((lat0 * Math.PI) / 180);
  const ky = M_PER_DEG_LAT;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1]! + Math.hypot((pts[i]!.lon - pts[i - 1]!.lon) * kx, (pts[i]!.lat - pts[i - 1]!.lat) * ky));
  }
  return { pts, cum, kx, ky };
}

export const polylineLength = (line: Polyline) => line.cum.at(-1) ?? 0;

/** Where along the line (meters from its start) the point is closest, and how far off the line it is. */
export function project(line: Polyline, p: LatLon): { along: number; offMeters: number } {
  let best = { along: 0, offMeters: Infinity };
  for (let i = 1; i < line.pts.length; i++) {
    const a = line.pts[i - 1]!;
    const b = line.pts[i]!;
    const ax = a.lon * line.kx;
    const ay = a.lat * line.ky;
    const dx = b.lon * line.kx - ax;
    const dy = b.lat * line.ky - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.lon * line.kx - ax) * dx + (p.lat * line.ky - ay) * dy) / len2)) : 0;
    const off = Math.hypot(p.lon * line.kx - (ax + t * dx), p.lat * line.ky - (ay + t * dy));
    if (off < best.offMeters) best = { along: line.cum[i - 1]! + t * Math.sqrt(len2), offMeters: off };
  }
  return best;
}

/** The point `along` meters from the start, with the bearing of the track there (degrees from north). */
export function pointAlong(line: Polyline, along: number): LatLon & { heading: number } {
  const s = Math.max(0, Math.min(polylineLength(line), along));
  let i = 1;
  while (i < line.pts.length - 1 && line.cum[i]! < s) i++;
  const a = line.pts[i - 1]!;
  const b = line.pts[i]!;
  const seg = line.cum[i]! - line.cum[i - 1]!;
  const t = seg ? (s - line.cum[i - 1]!) / seg : 0;
  const heading = ((Math.atan2((b.lon - a.lon) * line.kx, (b.lat - a.lat) * line.ky) * 180) / Math.PI + 360) % 360;
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, heading };
}

/**
 * The part of the line between two distances along it, as a flat [lat, lon, ...] array with
 * exact (interpolated) ends. Direction is preserved: from > to walks the line backwards.
 */
export function slicePolyline(line: Polyline, from: number, to: number): number[] {
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(polylineLength(line), Math.max(from, to));
  const out: number[] = [];
  const a = pointAlong(line, lo);
  out.push(a.lat, a.lon);
  for (let i = 1; i < line.pts.length - 1; i++) {
    if (line.cum[i]! > lo && line.cum[i]! < hi) out.push(line.pts[i]!.lat, line.pts[i]!.lon);
  }
  const b = pointAlong(line, hi);
  out.push(b.lat, b.lon);
  if (from > to) {
    const rev: number[] = [];
    for (let i = out.length - 2; i >= 0; i -= 2) rev.push(out[i]!, out[i + 1]!);
    return rev;
  }
  return out;
}
