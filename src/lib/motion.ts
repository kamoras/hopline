import type { LatLon } from "./geo";
import { createPolyline, pointAlong, polylineLength, type Polyline } from "./polyline";

/**
 * One stretch of a trip: the train is at the start of `path` at `t0` and the end at `t1`,
 * moving along it in between. `path` is a flat [lat, lon, lat, lon, ...] array.
 */
export interface MotionLeg {
  t0: number;
  t1: number;
  path: number[];
}

export interface CompiledLeg {
  t0: number;
  t1: number;
  line: Polyline;
}

/** Done once per snapshot so the per-frame work is just arithmetic. */
export function compileLegs(legs: readonly MotionLeg[]): CompiledLeg[] {
  return legs.map((l) => ({ t0: l.t0, t1: l.t1, line: createPolyline(l.path) })).sort((a, b) => a.t0 - b.t0);
}

/**
 * Where the train is at `now`, from the schedule: moving along the leg in progress, waiting at the
 * end of the last finished leg (dwelling at a station), or at the start of the first one.
 * Beyond the last leg it stays put rather than guessing.
 */
export function positionAt(legs: readonly CompiledLeg[], now: number): (LatLon & { heading: number }) | undefined {
  const first = legs[0];
  if (!first) return undefined;
  if (now <= first.t0) return pointAlong(first.line, 0);
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!;
    if (now <= leg.t1) {
      const span = leg.t1 - leg.t0;
      const f = span > 0 ? (now - leg.t0) / span : 1;
      return pointAlong(leg.line, polylineLength(leg.line) * Math.max(0, Math.min(1, f)));
    }
    const next = legs[i + 1];
    if (!next || now < next.t0) return pointAlong(leg.line, polylineLength(leg.line)); // dwelling
  }
  return undefined;
}
