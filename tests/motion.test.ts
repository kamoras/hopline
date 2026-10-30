import { describe, expect, it } from "vitest";
import { compileLegs, positionAt } from "@/lib/motion";
import { createPolyline, polylineLength, slicePolyline } from "@/lib/polyline";

// Two legs along a straight east-west line: A -> B (1000..2000 ms), dwell, B -> C (3000..4000 ms).
const A = [41.0, -73.0];
const B = [41.0, -72.99];
const C = [41.0, -72.98];
const legs = compileLegs([
  { t0: 3000, t1: 4000, path: [...B, ...C] },
  { t0: 1000, t1: 2000, path: [...A, ...B] },
]);

describe("positionAt", () => {
  it("sits at the start before the first leg", () => {
    expect(positionAt(legs, 0)!.lon).toBeCloseTo(-73.0, 5);
  });
  it("moves linearly along a leg", () => {
    expect(positionAt(legs, 1500)!.lon).toBeCloseTo(-72.995, 5);
    expect(positionAt(legs, 3250)!.lon).toBeCloseTo(-72.9875, 5);
  });
  it("dwells at the stop between legs", () => {
    expect(positionAt(legs, 2500)!.lon).toBeCloseTo(-72.99, 5);
  });
  it("stays at the end rather than guessing beyond the last leg", () => {
    expect(positionAt(legs, 9999)!.lon).toBeCloseTo(-72.98, 5);
  });
  it("has nothing to say without legs", () => {
    expect(positionAt([], 1000)).toBeUndefined();
  });
  it("reports the heading of travel", () => {
    expect(positionAt(legs, 1500)!.heading).toBeCloseTo(90, 0);
  });
});

describe("slicePolyline", () => {
  const line = createPolyline([41.3, -72.9, 41.31, -72.9, 41.31, -72.884]); // north, then east
  const total = polylineLength(line);

  it("cuts the stretch between two distances, keeping the bend", () => {
    const part = slicePolyline(line, 500, 2000);
    expect(part.length).toBeGreaterThanOrEqual(6); // start, the corner, end
    expect(part.slice(0, 2)[0]).toBeGreaterThan(41.3);
  });

  it("walks backwards when from is after to", () => {
    const fwd = slicePolyline(line, 500, 2000);
    const back = slicePolyline(line, 2000, 500);
    expect([back[0], back[1]]).toEqual([fwd.at(-2), fwd.at(-1)]);
    expect([back.at(-2), back.at(-1)]).toEqual([fwd[0], fwd[1]]);
  });

  it("clamps to the line", () => {
    const all = slicePolyline(line, -100, total + 100);
    expect(all.slice(0, 2)).toEqual([41.3, -72.9]);
  });
});
