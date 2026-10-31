import { describe, expect, it } from "vitest";
import { createPolyline, pointAlong, polylineLength, project } from "@/lib/polyline";

// Roughly 1.11 km north, then 1.4 km east, near New Haven.
const line = createPolyline([41.3, -72.9, 41.31, -72.9, 41.31, -72.884]);

describe("polyline", () => {
  it("measures length in meters", () => {
    expect(polylineLength(line)).toBeGreaterThan(2400);
    expect(polylineLength(line)).toBeLessThan(2600);
  });

  it("projects a point onto the nearest part of the track", () => {
    const { along, offMeters } = project(line, { lat: 41.305, lon: -72.9005 }); // beside the first leg
    expect(offMeters).toBeLessThan(60);
    expect(along).toBeGreaterThan(500);
    expect(along).toBeLessThan(600);
  });

  it("returns points and headings along the path", () => {
    const north = pointAlong(line, 300);
    expect(north.heading).toBeCloseTo(0, 0);
    expect(north.lat).toBeGreaterThan(41.3);
    const east = pointAlong(line, 2000);
    expect(east.heading).toBeCloseTo(90, 0);
  });

  it("clamps to the ends", () => {
    expect(pointAlong(line, -50)).toMatchObject({ lat: 41.3, lon: -72.9 });
    expect(pointAlong(line, 1e9).lon).toBeCloseTo(-72.884, 4);
  });
});

describe("pointAlong on a long line", () => {
  it("finds the same point as a linear scan", () => {
    const flat = Array.from({ length: 5000 }, (_, i) => (i % 2 === 0 ? 40 + (i / 2) * 0.0003 : -74 + ((i - 1) / 2) * 0.0002 + Math.sin(i / 50) * 0.001));
    const line = createPolyline(flat);
    for (const s of [0, 1, 123.4, 5000, polylineLength(line) / 2, polylineLength(line) - 0.5, polylineLength(line), polylineLength(line) + 10]) {
      const clamped = Math.max(0, Math.min(polylineLength(line), s));
      let i = 1;
      while (i < line.pts.length - 1 && line.cum[i]! < clamped) i++;
      const a = line.pts[i - 1]!;
      const b = line.pts[i]!;
      const seg = line.cum[i]! - line.cum[i - 1]!;
      const t = seg ? (clamped - line.cum[i - 1]!) / seg : 0;
      const got = pointAlong(line, s);
      expect(got.lat).toBeCloseTo(a.lat + (b.lat - a.lat) * t, 9);
      expect(got.lon).toBeCloseTo(a.lon + (b.lon - a.lon) * t, 9);
    }
  });
});
