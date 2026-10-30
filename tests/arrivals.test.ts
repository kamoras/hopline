import { describe, expect, it } from "vitest";
import type { Arrival } from "@/domain/arrival";
import { groupArrivals, longGapWarning, minutesUntil } from "@/lib/arrivals";

const NOW = 1_000_000_000;
const min = (m: number) => NOW + m * 60_000;
const arr = (route: string, headsign: string, m: number): Arrival => ({ tripId: `${route}${m}`, route, color: "#0062CF", textColor: "#fff", headsign, at: min(m), platform: "127N" });

describe("groupArrivals", () => {
  const groups = groupArrivals([arr("A", "Inwood", 7), arr("A", "Far Rockaway", 4), arr("A", "Inwood", 2), arr("C", "Euclid Av", 3), arr("A", "Inwood", 12), arr("A", "Inwood", -5)], NOW);

  it("groups by line and destination, ordered by the next train", () => {
    expect(groups.map((g) => `${g.route} ${g.headsign}`)).toEqual(["A Inwood", "C Euclid Av", "A Far Rockaway"]);
    expect(groups[0]!.times).toEqual([min(2), min(7), min(12)]);
  });

  it("ignores trains that have already left", () => {
    expect(groups.flatMap((g) => g.times).every((t) => t >= NOW - 15_000)).toBe(true);
  });

  it("limits how many times each group shows", () => {
    const many = groupArrivals([1, 2, 3, 4, 5, 6].map((m) => arr("L", "8 Av", m)), NOW, 4);
    expect(many[0]!.times).toHaveLength(4);
  });
});

describe("longGapWarning", () => {
  it("is quiet for frequent service", () => {
    expect(longGapWarning([min(2), min(6), min(10)], NOW)).toBeUndefined();
  });
  it("warns when the next train is far away", () => {
    expect(longGapWarning([min(18), min(30)], NOW)).toBe("Long wait: next train in 18 min");
  });
  it("warns about a hole much bigger than the usual spacing", () => {
    expect(longGapWarning([min(2), min(6), min(10), min(30)], NOW)).toBe("Gap of 20 min between trains");
  });
  it("does not warn when every gap is simply long (that's the schedule)", () => {
    expect(longGapWarning([min(5), min(20), min(35), min(50)], NOW)).toBeUndefined();
  });
  it("has nothing to say with no trains", () => {
    expect(longGapWarning([], NOW)).toBeUndefined();
  });
});

describe("minutesUntil", () => {
  it("counts whole minutes and never goes negative", () => {
    expect(minutesUntil(min(3) + 20_000, NOW)).toBe(3);
    expect(minutesUntil(min(-2), NOW)).toBe(0);
  });
});
