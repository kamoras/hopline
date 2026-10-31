import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/place";
import { PHILADELPHIA } from "@/domain/region";
import { septaMetroProvider as metro } from "@/providers/septa-metro";

// A Monday morning (10:00 in Philadelphia) inside the bundled timetable.
const NOW = Date.UTC(2026, 10, 2, 15, 0, 0);
const ctx = { region: PHILADELPHIA, signal: AbortSignal.timeout(5000), now: NOW, diag: {} };

describe("SEPTA Metro (timetable only)", () => {
  it("places trains by the schedule, as metro trains, claiming nothing about lateness", async () => {
    const trips = await metro.fetchTrips(ctx);
    expect(trips.length).toBeGreaterThan(10);
    for (const t of trips) {
      expect(t.mode).toBe("subway");
      expect(t.delayStatus).toBe("unknown");
      if (t.position) expect(t.position.source).toBe("estimated"); // never passed off as a GPS fix
    }
    expect(trips.filter((t) => t.position).length).toBeGreaterThan(5);
    expect(new Set(trips.map((t) => t.routeName.split(" ")[0]))).toContain("Market-Frankford");
  });

  it("lists each station once, under its station name", async () => {
    const places = await metro.fetchPlaces!(ctx);
    const names = places.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Olney Transit Center"); // not "Olney Transit Center - B1"
    expect(names.some((n) => /Employee|Not a stop/.test(n))).toBe(false);
  });

  it("lists the next scheduled trains at a station, soonest first, with the line's badge", async () => {
    const places = await metro.fetchPlaces!(ctx);
    const station = places.find((p) => p.name === "15th St/City Hall")!;
    const arrivals = await metro.fetchArrivals!(ctx, station as Place);
    expect(arrivals.length).toBeGreaterThan(2);
    expect(arrivals.every((a) => a.at >= NOW)).toBe(true);
    expect(arrivals.map((a) => a.at)).toEqual([...arrivals.map((a) => a.at)].sort((a, b) => a - b));
    expect(new Set(arrivals.map((a) => a.route))).toContain("L");
  });
});
