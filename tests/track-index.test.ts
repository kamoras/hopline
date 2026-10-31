import { describe, expect, it } from "vitest";
import { createPolyline, project } from "@/lib/polyline";
import { TrackIndex } from "@/lib/track-index";

let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

/** A wandering track of `n` points starting somewhere in the eastern US. */
function wander(n: number) {
  let lat = 38 + rand() * 4;
  let lon = -78 + rand() * 6;
  const flat: number[] = [];
  for (let i = 0; i < n; i++) {
    flat.push(lat, lon);
    lat += (rand() - 0.45) * 0.01;
    lon += (rand() - 0.45) * 0.012;
  }
  return createPolyline(flat);
}

describe("TrackIndex", () => {
  const lines = Array.from({ length: 30 }, () => wander(200));
  const index = new TrackIndex(lines, 120);

  it("agrees with checking every segment of every line", () => {
    for (let k = 0; k < 600; k++) {
      const line = lines[k % lines.length]!;
      const base = line.pts[Math.floor(rand() * line.pts.length)]!;
      // Points from right on the track to a few hundred meters off it.
      const p = { lat: base.lat + (rand() - 0.5) * 0.006, lon: base.lon + (rand() - 0.5) * 0.006 };

      let expected: { off: number; along: number } | undefined;
      for (const l of lines) {
        const hit = project(l, p);
        if (hit.offMeters <= 120 && (!expected || hit.offMeters < expected.off)) expected = { off: hit.offMeters, along: hit.along };
      }
      const got = index.nearest(p);
      if (!expected) {
        expect(got).toBeUndefined();
      } else {
        expect(got?.off).toBeCloseTo(expected.off, 6);
        expect(got?.along).toBeCloseTo(expected.along, 6);
      }
    }
  });

  it("finds nothing far from any track", () => {
    expect(index.nearest({ lat: 10, lon: 10 })).toBeUndefined();
  });

  it("looks up a point on a long network quickly", () => {
    const big = new TrackIndex(Array.from({ length: 400 }, () => wander(500)), 120);
    const start = performance.now();
    for (let i = 0; i < 5000; i++) big.nearest({ lat: 38 + rand() * 4, lon: -78 + rand() * 6 });
    expect(performance.now() - start).toBeLessThan(500);
  });
});
