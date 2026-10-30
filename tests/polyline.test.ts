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
