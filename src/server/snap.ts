import type { Trip } from "@/domain/trip";
import { pointAlong, type Polyline } from "@/lib/polyline";
import { TrackIndex } from "@/lib/track-index";

/** A raw GPS fix this close to known track is the train on that track; further away we don't guess. */
export const SNAP_MAX_M = 120;

/** Builds the lookup for a board's track; build it once and reuse it for every request. */
export const indexTrack = (track: readonly Polyline[], maxMeters = SNAP_MAX_M) => new TrackIndex(track, maxMeters);

/**
 * Pulls GPS-reported positions onto the known track. Raw fixes drift a few tens of meters and a
 * train can't leave its rails, so a fix near the track is drawn on it. Estimated positions are
 * already on the track and are left alone, as is anything not near any track.
 */
export function snapToTrack(trips: readonly Trip[], track: TrackIndex | readonly Polyline[], maxMeters = SNAP_MAX_M): Trip[] {
  const index = track instanceof TrackIndex ? track : indexTrack(track, maxMeters);
  if (index.lines.length === 0) return [...trips];
  return trips.map((trip) => {
    const pos = trip.position;
    if (!pos || pos.source !== "reported") return trip;
    const best = index.nearest(pos);
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
