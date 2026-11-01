import { describe, expect, it } from "vitest";
import { NORTHEAST_AIRPORTS } from "@/providers/adsb/airports";
import { mergeAircraft } from "@/providers/adsb/merge";
import type { Aircraft } from "@/providers/adsb/normalize";

const ac = (hex: string, seen: number, lat = 40): Aircraft => ({ hex, flight: "DAL1 ", lat, lon: -75, gs: 400, track: 90, alt_baro: 30000, seen_pos: seen });

describe("merging the query circles", () => {
  it("keeps an aircraft seen by two circles once, with the freshest position", () => {
    const merged = mergeAircraft([[ac("a", 5, 40.1), ac("b", 1)], [ac("a", 0.5, 40.2), ac("c", 2)]]);
    expect(merged.map((x) => x.hex).sort()).toEqual(["a", "b", "c"]);
    expect(merged.find((x) => x.hex === "a")!.lat).toBe(40.2);
  });
});

describe("airports", () => {
  it("cover the whole Northeast, each once", () => {
    const codes = NORTHEAST_AIRPORTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of ["BOS", "PVD", "ALB", "PIT", "BWI", "DCA", "IAD", "BTV", "PWM", "RIC", "ORF", "JFK", "PHL"]) expect(codes).toContain(code);
  });
});
