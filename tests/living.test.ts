import { describe, expect, it } from "vitest";
import type { Trip } from "@/domain/trip";
import { newArrivals } from "@/lib/ripples";
import { nightFactor, sunAltitudeDeg } from "@/lib/sun";

const NYC = { lat: 40.7128, lon: -74.006 };

describe("sunAltitudeDeg", () => {
  it("puts the sun high at midsummer noon and low at midwinter noon (New York)", () => {
    // Local solar noon is a little before 17:00 UTC in June (EDT noon is 16:00 UTC) and about 17:00 UTC in December.
    const june = sunAltitudeDeg(NYC.lat, NYC.lon, new Date("2026-06-21T16:55:00Z"));
    const december = sunAltitudeDeg(NYC.lat, NYC.lon, new Date("2026-12-21T16:55:00Z"));
    expect(june).toBeGreaterThan(72);
    expect(june).toBeLessThan(74.5); // 90 - 40.7 + 23.4 = 72.7
    expect(december).toBeGreaterThan(25);
    expect(december).toBeLessThan(27.5); // 90 - 40.7 - 23.4 = 25.9
  });

  it("is below the horizon at local midnight and above it at noon, all year", () => {
    for (const day of ["2026-03-20", "2026-06-21", "2026-09-22", "2026-12-21"]) {
      expect(sunAltitudeDeg(NYC.lat, NYC.lon, new Date(`${day}T05:00:00Z`))).toBeLessThan(0); // about midnight EST/EDT
      expect(sunAltitudeDeg(NYC.lat, NYC.lon, new Date(`${day}T17:00:00Z`))).toBeGreaterThan(20);
    }
  });

  it("rises in the east and sets in the west: higher at 10:00 than 07:00 local, lower at 17:00 than 14:00", () => {
    const at = (h: number) => sunAltitudeDeg(NYC.lat, NYC.lon, new Date(`2026-09-22T${String(h).padStart(2, "0")}:00:00Z`)); // EDT = UTC-4
    expect(at(14)).toBeGreaterThan(at(11));
    expect(at(18)).toBeGreaterThan(at(21));
  });

  it("puts the sun near the zenith over the equator at the equinox noon", () => {
    expect(sunAltitudeDeg(0, 0, new Date("2026-03-20T12:00:00Z"))).toBeGreaterThan(85);
  });
});

describe("nightFactor", () => {
  it("is zero in daylight, one in full dark, and eases through twilight", () => {
    expect(nightFactor(40)).toBe(0);
    expect(nightFactor(6)).toBe(0);
    expect(nightFactor(-12)).toBe(1);
    expect(nightFactor(-40)).toBe(1);
    expect(nightFactor(-3)).toBeGreaterThan(0);
    expect(nightFactor(-3)).toBeLessThan(1);
    expect(nightFactor(-6)).toBeGreaterThan(nightFactor(-3));
  });
});

describe("newArrivals", () => {
  const trip = (id: string, state: Trip["state"], lat = 40, lon = -73): Trip => ({ id, state, routeColor: "#f00", position: { lat, lon, source: "reported" } }) as Trip;

  it("does not ripple on the first look, only on what changes after", () => {
    const first = newArrivals(undefined, [trip("a", "at-station"), trip("b", "enroute")]);
    expect(first.arrivals).toEqual([]);
    expect([...first.now]).toEqual(["a"]);

    const second = newArrivals(first.now, [trip("a", "at-station"), trip("b", "at-station", 41, -72), trip("c", "enroute")]);
    expect(second.arrivals).toEqual([{ id: "b", lat: 41, lon: -72, color: "#f00" }]); // a was already there
    expect([...second.now].sort()).toEqual(["a", "b"]);
  });

  it("ripples again when a vehicle leaves and comes back, and ignores vehicles with no position", () => {
    const there = newArrivals(undefined, [trip("a", "at-station")]);
    const gone = newArrivals(there.now, [trip("a", "enroute")]);
    expect(newArrivals(gone.now, [trip("a", "at-station")]).arrivals).toHaveLength(1);
    expect(newArrivals(new Set(), [{ id: "x", state: "at-station", routeColor: "#f00" } as Trip]).arrivals).toEqual([]);
  });
});
