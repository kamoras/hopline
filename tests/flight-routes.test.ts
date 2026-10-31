import { afterEach, describe, expect, it, vi } from "vitest";
import { leadEnd, LEAD_MAX_MILES } from "@/lib/trail";
import { NORTHEAST_AIR } from "@/domain/region";
import { NORTHEAST_AIRPORTS } from "@/providers/adsb/airports";
import { buildFlights, type Aircraft } from "@/providers/adsb/normalize";
import { clearRoutes, routeEnds, seedRoute, warmRoutes, cachedRoute, type KnownRoute } from "@/providers/adsb/routes";
import { distanceMiles } from "@/lib/geo";

const NOW = Date.UTC(2026, 9, 31, 18, 0, 0);
const KEF = { iata: "KEF", name: "Keflavik International Airport", city: "Reykjavík", lat: 63.985, lon: -22.6056 };
const MCO = { iata: "MCO", name: "Orlando International Airport", city: "Orlando", lat: 28.4294, lon: -81.309 };
const ICE689: KnownRoute = [KEF, MCO];

// Over Long Island at cruise, flying south-west like ICE689.
const over: Aircraft = { hex: "4cc586", flight: "ICE689  ", t: "A21N", lat: 40.95, lon: -72.83, gs: 417, track: 211, alt_baro: 34000, baro_rate: 0, seen_pos: 0.3 };

afterEach(() => {
  clearRoutes();
  vi.unstubAllGlobals();
});

describe("flight routes", () => {
  it("heads for the end of the route its track points at", () => {
    const { from, to } = routeEnds(ICE689, over as never, 211);
    expect(to.iata).toBe("MCO");
    expect(from.iata).toBe("KEF");
    expect(routeEnds(ICE689, over as never, 30).to.iata).toBe("KEF"); // the same flight, flown the other way
  });

  it("gives a flight over the area the destination from its route", () => {
    seedRoute("ICE689", ICE689, NOW);
    const [trip] = buildFlights({ aircraft: [over], airports: NORTHEAST_AIRPORTS, region: NORTHEAST_AIR, now: NOW });
    expect(trip).toMatchObject({ destination: "Orlando (MCO)", origin: "Reykjavík (KEF)", destinationAt: { lat: 28.4294, lon: -81.309 } });
  });

  it("leaves a flight with no known route as it was", () => {
    const [trip] = buildFlights({ aircraft: [over], airports: NORTHEAST_AIRPORTS, region: NORTHEAST_AIR, now: NOW });
    expect(trip).toMatchObject({ destination: "", origin: "" });
    expect(trip!.destinationAt).toBeUndefined();
  });

  it("looks each callsign up once, remembers one with no route, and never throws", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("ICE689.json")
        ? new Response(JSON.stringify({ _airports: [{ iata: "KEF", name: "Keflavik", location: "Reykjavík", lat: 63.985, lon: -22.6 }, { iata: "MCO", name: "Orlando", location: "Orlando", lat: 28.4, lon: -81.3 }] }))
        : new Response("", { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await warmRoutes(["ICE689", "CHARTR1"], NOW);
    expect(cachedRoute("ICE689", NOW)).toHaveLength(2);
    expect(cachedRoute("CHARTR1", NOW)).toBeNull();
    await warmRoutes(["ICE689", "CHARTR1"], NOW);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    await expect(warmRoutes(["NEW123"], NOW)).resolves.toBeUndefined();
    expect(cachedRoute("NEW123", NOW)).toBeUndefined();
  });
});

describe("heading line", () => {
  it("runs to a near destination and stops short of a far one", () => {
    const here = { lat: 40.95, lon: -72.83 };
    expect(leadEnd(here, undefined)).toBeUndefined();
    expect(leadEnd(here, { lat: 40.64, lon: -73.78 })).toEqual({ lat: 40.64, lon: -73.78 });
    const end = leadEnd(here, MCO)!;
    expect(Math.abs(distanceMiles(here, end) - LEAD_MAX_MILES)).toBeLessThan(4); // straight in lat/lon, so a little off at this length
  });
});
