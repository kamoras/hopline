import { describe, expect, it } from "vitest";
import { extendTrail, TRAIL_STEP_MS, TRAIL_TTL_MS, trailSegments } from "@/lib/trail";

describe("trail", () => {
  it("keeps a point only once per step", () => {
    let h = extendTrail(undefined, { lat: 1, lon: 1 }, 0);
    h = extendTrail(h, { lat: 2, lon: 2 }, TRAIL_STEP_MS - 1);
    expect(h).toHaveLength(1);
    h = extendTrail(h, { lat: 2, lon: 2 }, TRAIL_STEP_MS);
    expect(h).toHaveLength(2);
  });

  it("never grows past what its lifetime allows, however long the vehicle flies", () => {
    let h = extendTrail(undefined, { lat: 0, lon: 0 }, 0);
    for (let i = 1; i < 500; i++) h = extendTrail(h, { lat: i, lon: 0 }, i * TRAIL_STEP_MS);
    expect(h.length).toBeLessThanOrEqual(TRAIL_TTL_MS / TRAIL_STEP_MS);
    expect(h[h.length - 1]!.lat).toBe(499);
  });

  it("can keep a shorter history", () => {
    let h = extendTrail(undefined, { lat: 0, lon: 0 }, 0, 3);
    for (let i = 1; i < 10; i++) h = extendTrail(h, { lat: i, lon: 0 }, i * TRAIL_STEP_MS, 3);
    expect(h.map((s) => s.lat)).toEqual([7, 8, 9]);
  });

  it("fades with age: solid at the vehicle, gone at the end of its life", () => {
    const now = 20_000;
    const h = [
      { lat: 0, lon: 0, at: now - 40_000 },
      { lat: 1, lon: 0, at: now - 10_000 },
    ];
    const s = trailSegments(h, { lat: 2, lon: 0 }, now, 50_000);
    expect(s).toHaveLength(2);
    expect(s[0]!.a).toBeLessThan(s[1]!.a);
    expect(s[1]!.a).toBe(1);
    expect(s[0]!.a).toBeCloseTo(0.8, 5); // the point ten seconds old
    expect(s[1]!.to).toMatchObject({ lat: 2, lon: 0 });
  });

  it("dies away when a vehicle stops", () => {
    let h = extendTrail(undefined, { lat: 0, lon: 0 }, 0);
    h = extendTrail(h, { lat: 1, lon: 0 }, TRAIL_STEP_MS);
    const later = TRAIL_STEP_MS + TRAIL_TTL_MS + 1;
    expect(trailSegments(h, { lat: 1, lon: 0 }, later)).toEqual([]);
    expect(extendTrail(h, { lat: 1, lon: 0 }, later)).toHaveLength(1); // only the fresh point is left
  });
});
