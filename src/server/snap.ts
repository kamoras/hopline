import type { Trip } from "@/domain/trip";
import { pointAlong, project, type Polyline } from "@/lib/polyline";

/** A raw GPS fix this close to known track is the train on that track; further away we don't guess. */
export const SNAP_MAX_M = 120;

/**
 * Pulls GPS-reported positions onto the known track. Raw fixes drift a few tens of meters and a
 * train can't leave its rails, so a fix near the track is drawn on it. Estimated positions are
 * already on the track and are left alone, as is anything not near any track.
 */
export function snapToTrack(trips: readonly Trip[], track: readonly Polyline[], maxMeters = SNAP_MAX_M): Trip[] {
  if (track.length === 0) return [...trips];
  return trips.map((trip) => {
    const pos = trip.position;
    if (!pos || pos.source !== "reported") return trip;
    let best: { line: Polyline; along: number; off: number } | undefined;
    for (const line of track) {
      const p = project(line, pos);
      if (p.offMeters <= maxMeters && (!best || p.offMeters < best.off)) best = { line, along: p.along, off: p.offMeters };
    }
    if (!best) return trip;
    const on = pointAlong(best.line, best.along);
    // The track has one direction; face whichever way is closer to the heading the train reported.
    let heading = pos.heading;
    if (heading !== undefined) {
      const diff = Math.abs(((on.heading - heading + 540) % 360) - 180);
      heading = diff <= 90 ? on.heading : (on.heading + 180) % 360;
    }
    return { ...trip, position: { ...pos, lat: on.lat, lon: on.lon, heading: heading ?? on.heading } };
  });
}
