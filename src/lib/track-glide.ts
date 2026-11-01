import type { LatLon } from "./geo";
import type { MotionLeg } from "./motion";
import { project, slicePolyline } from "./polyline";
import type { TrackIndex } from "./track-index";

/** A vehicle that was this far from the track it is now on was not on it: it changed track, so it is not slid along it. */
const MAX_OFF_M = 80;

/**
 * A train's GPS fixes are points; drawn straight from one to the next it cuts across every curve and leaves its
 * rails. This makes the glide between two fixes follow the track instead: a leg along the line the new fix is on, from
 * where the train was drawn. Nothing when there is no track under it (or it moved to a different one), and the caller
 * glides in a straight line as before.
 */
export function glideOnTrack(index: TrackIndex | undefined, from: LatLon, to: LatLon, start: number, durationMs: number): MotionLeg | undefined {
  if (!index) return undefined;
  const end = index.nearest(to);
  if (!end) return undefined;
  const begin = project(end.line, from);
  if (begin.offMeters > MAX_OFF_M || Math.abs(begin.along - end.along) < 1) return undefined;
  return { t0: start, t1: start + durationMs, path: slicePolyline(end.line, begin.along, end.along) };
}
