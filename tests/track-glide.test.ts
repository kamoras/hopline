import { describe, expect, it } from "vitest";
import { compileLegs, positionAt } from "@/lib/motion";
import { createPolyline } from "@/lib/polyline";
import { TrackIndex } from "@/lib/track-index";
import { glideOnTrack } from "@/lib/track-glide";
import { distanceMiles } from "@/lib/geo";

// An L: 0.02° north, then 0.02° east. A straight glide between the ends would cut the corner.
const corner = createPolyline([40.0, -74.0, 40.02, -74.0, 40.02, -73.98]);
const index = new TrackIndex([corner], 80);
const from = { lat: 40.0, lon: -74.0 };
const to = { lat: 40.02, lon: -73.98 };

describe("glideOnTrack", () => {
  it("follows the track around a bend instead of cutting across it", () => {
    const leg = glideOnTrack(index, from, to, 0, 10_000)!;
    expect(leg).toBeDefined();
    const mid = positionAt(compileLegs([leg]), 5_000, 0)!;
    // Halfway in time is halfway along the track, which is the corner; the chord's midpoint is a mile off the rails.
    expect(distanceMiles(mid, { lat: 40.02, lon: -74.0 })).toBeLessThan(0.2);
    const chord = { lat: 40.01, lon: -73.99 };
    expect(distanceMiles(mid, chord)).toBeGreaterThan(0.5);
  });

  it("does nothing without track, off track, or when the vehicle has not moved", () => {
    expect(glideOnTrack(undefined, from, to, 0, 1000)).toBeUndefined();
    expect(glideOnTrack(index, from, { lat: 40.5, lon: -73.0 }, 0, 1000)).toBeUndefined(); // no track there
    expect(glideOnTrack(index, { lat: 40.01, lon: -73.9 }, to, 0, 1000)).toBeUndefined(); // came from elsewhere
    expect(glideOnTrack(index, to, to, 0, 1000)).toBeUndefined();
  });
});
