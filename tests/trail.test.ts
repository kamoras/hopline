import { describe, expect, it } from "vitest";
import { extendTrail, TRAIL_POINTS, TRAIL_STEP_MS, trailSegments } from "@/lib/trail";

describe("trail", () => {
  it("keeps a point only once per step", () => {
    let h = extendTrail(undefined, { lat: 1, lon: 1 }, 0);
    h = extendTrail(h, { lat: 2, lon: 2 }, TRAIL_STEP_MS - 1);
    expect(h).toHaveLength(1);
    h = extendTrail(h, { lat: 2, lon: 2 }, TRAIL_STEP_MS);
    expect(h).toHaveLength(2);
  });

  it("is bounded", () => {
    let h = extendTrail(undefined, { lat: 0, lon: 0 }, 0);
    for (let i = 1; i < TRAIL_POINTS * 2; i++) h = extendTrail(h, { lat: i, lon: 0 }, i * TRAIL_STEP_MS);
    expect(h).toHaveLength(TRAIL_POINTS);
    expect(h[h.length - 1]!.lat).toBe(TRAIL_POINTS * 2 - 1);
  });

  it("can keep a shorter history", () => {
    let h = extendTrail(undefined, { lat: 0, lon: 0 }, 0, 3);
    for (let i = 1; i < 10; i++) h = extendTrail(h, { lat: i, lon: 0 }, i * TRAIL_STEP_MS, 3);
    expect(h.map((s) => s.lat)).toEqual([7, 8, 9]);
  });

  it("fades toward the tail and ends at the vehicle", () => {
    const h = extendTrail(extendTrail(undefined, { lat: 0, lon: 0 }, 0), { lat: 1, lon: 0 }, TRAIL_STEP_MS);
    const s = trailSegments(h, { lat: 2, lon: 0 });
    expect(s).toHaveLength(2);
    expect(s[0]!.a).toBeLessThan(s[1]!.a);
    expect(s[1]!.a).toBe(1);
    expect(s[1]!.to).toEqual({ lat: 2, lon: 0 });
  });
});
