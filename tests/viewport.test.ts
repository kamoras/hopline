import { describe, expect, it } from "vitest";
import type { Place } from "@/domain/place";
import type { Trip } from "@/domain/trip";
import { formatBbox, inBBox, parseBbox, snapBbox } from "@/lib/bbox";
import { distanceMiles } from "@/lib/geo";
import { PlaceIndex } from "@/server/place-index";
import { scopeTrips } from "@/server/snapshot";
import { GET as getPlacesRoute } from "@/app/api/places/route";
import { GET as getLinesRoute } from "@/app/api/lines/route";
import { GET as getRoutesRoute } from "@/app/api/routes/route";

describe("bbox", () => {
  it("accepts a sensible rectangle and nothing else", () => {
    expect(parseBbox("-71.2,42.3,-71.0,42.4")).toEqual([-71.2, 42.3, -71.0, 42.4]);
    for (const bad of [undefined, "", "1,2,3", "a,b,c,d", "-71,42,-72,43", "-71,42,-70,41", "-80,30,-70,40" /* too wide */]) expect(parseBbox(bad)).toBeUndefined();
  });

  it("rounds outward to a grid so nearby views share one request", () => {
    const snapped = snapBbox([-71.1234, 42.3456, -71.0111, 42.4], 0.02);
    expect(snapped).toEqual([-71.14, 42.34, -71.0, 42.4]);
    const [w, s, e, n] = snapped;
    expect(inBBox(snapped, 42.3456, -71.1234) && w <= -71.1234 && s <= 42.3456 && e >= -71.0111 && n >= 42.4).toBe(true);
    expect(formatBbox(snapped)).toBe("-71.14,42.34,-71,42.4");
  });
});

let seed = 99;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const places: Place[] = Array.from({ length: 4000 }, (_, i) => ({
  id: `p${i}`,
  name: `${["Main", "Elm", "Harvard", "Park", "Oak"][i % 5]} St @ ${["First", "Second", "Third"][i % 3]} Ave ${i}`,
  lat: 42.2 + rand() * 0.4,
  lon: -71.3 + rand() * 0.5,
  mode: "bus",
  regionId: "boston",
}));
const index = new PlaceIndex(places);

describe("PlaceIndex", () => {
  it("finds the places in a rectangle, like checking every one", () => {
    const box = [-71.15, 42.33, -71.05, 42.38] as const;
    const expected = places.filter((p) => inBBox(box, p.lat, p.lon)).map((p) => p.id).sort();
    expect(index.inBox(box, 10_000).map((p) => p.id).sort()).toEqual(expected);
  });

  it("keeps the ones nearest the middle when there are too many", () => {
    const box = [-71.3, 42.2, -70.8, 42.6] as const;
    const got = index.inBox(box, 25);
    expect(got).toHaveLength(25);
    const mid = { lat: 42.4, lon: -71.05 };
    const worst = Math.max(...got.map((p) => distanceMiles(p, mid)));
    expect(places.filter((p) => !got.includes(p)).every((p) => distanceMiles(p, mid) >= worst - 1e-9)).toBe(true);
  });

  it("finds the closest places to a point, like sorting them all", () => {
    for (const at of [{ lat: 42.37, lon: -71.12 }, { lat: 42.21, lon: -71.29 }, { lat: 42.59, lon: -70.85 }]) {
      const expected = [...places].sort((a, b) => distanceMiles(a, at) - distanceMiles(b, at)).slice(0, 5).map((p) => p.id);
      expect(index.near(at, 5).map((p) => p.id)).toEqual(expected);
    }
  });

  it("searches by name, prefix matches first, and looks places up by id", () => {
    const hits = index.search("harvard st", 10);
    expect(hits).toHaveLength(10);
    expect(hits.every((p) => p.name.toLowerCase().includes("harvard st"))).toBe(true);
    expect(index.search("   ", 10)).toEqual([]);
    expect(index.get("p7")?.id).toBe("p7");
    expect(index.get("nope")).toBeUndefined();
  });

  it("answers quickly on a national-sized list", () => {
    const big = new PlaceIndex(Array.from({ length: 200_000 }, (_, i) => ({ ...places[i % places.length]!, id: `b${i}`, lat: 25 + rand() * 24, lon: -124 + rand() * 57 })));
    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      big.inBox([-100, 35, -99.9, 35.1], 300);
      big.near({ lat: 30 + rand() * 15, lon: -120 + rand() * 40 }, 5);
    }
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe("scopeTrips", () => {
  const trip = (id: string, number: string, lat: number, lon: number) => ({ id, number, position: { lat, lon } }) as unknown as Trip;
  const trips = [trip("a", "1", 42.35, -71.1), trip("b", "39", 42.3, -71.1), trip("c", "1", 42.5, -71.0)];

  it("returns what is in view, one route, or nothing", () => {
    expect(scopeTrips(trips, { bbox: [-71.2, 42.3, -71.0, 42.4] }).map((t) => t.id)).toEqual(["a", "b"]);
    expect(scopeTrips(trips, { route: "1" }).map((t) => t.id)).toEqual(["a", "c"]);
    expect(scopeTrips(trips, undefined)).toEqual([]);
    expect(scopeTrips(trips, {})).toEqual([]);
  });

  it("prefers the route to the rectangle", () => {
    expect(scopeTrips(trips, { route: "39", bbox: [-72, 42, -70, 43] }).map((t) => t.id)).toEqual(["b"]);
  });
});

describe("big-network APIs (MBTA buses)", () => {
  const url = (path: string) => new Request(`http://x/api/${path}`);

  it("never sends every stop: only what is asked for", async () => {
    expect(await (await getPlacesRoute(url("places?mode=bus&region=boston"))).json()).toEqual([]);
    const near = await (await getPlacesRoute(url("places?mode=bus&region=boston&near=42.373,-71.119"))).json();
    expect(near).toHaveLength(5);
    const found = await (await getPlacesRoute(url("places?mode=bus&region=boston&q=harvard"))).json();
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThanOrEqual(15);
    const box = await (await getPlacesRoute(url("places?mode=bus&region=boston&bbox=-71.14,42.36,-71.10,42.40"))).json();
    expect(box.length).toBeGreaterThan(20);
    expect(box.length).toBeLessThanOrEqual(300);
  });

  it("sends a route's track on request and none otherwise", async () => {
    expect(await (await getLinesRoute(url("lines?mode=bus&region=boston"))).json()).toEqual([]);
    const one = await (await getLinesRoute(url("lines?mode=bus&region=boston&route=39"))).json();
    expect(one.length).toBeGreaterThan(0);
    expect(one.every((l: { route: string }) => l.route === "39")).toBe(true);
  });

  it("finds routes by number or name", async () => {
    const routes = await (await getRoutesRoute(url("routes?mode=bus&region=boston&q=39"))).json();
    expect(routes[0]).toMatchObject({ route: "39" });
    expect(await (await getRoutesRoute(url("routes?mode=bus&region=boston&q=zzzzzz"))).json()).toEqual([]);
  });

  it("serves each bus network from its own data (Metrobus, SEPTA)", async () => {
    const dc = await (await getRoutesRoute(url("routes?mode=bus&region=washington&q=D10"))).json();
    expect(dc[0]).toMatchObject({ route: "D10" });
    const philly = await (await getRoutesRoute(url("routes?mode=bus&region=philadelphia&q=40"))).json();
    expect(philly[0]).toMatchObject({ route: "40" });
    const stops = await (await getPlacesRoute(url("places?mode=bus&region=washington&near=38.8977,-77.0365"))).json();
    expect(stops).toHaveLength(5);
    expect(stops.every((p: { mode: string; regionId: string }) => p.mode === "bus" && p.regionId === "washington")).toBe(true);
  });

  it("leaves small boards alone: the whole list, as before", async () => {
    const all = await (await getPlacesRoute(url("places?mode=rail&region=northeast"))).json();
    expect(all.length).toBeGreaterThan(100);
  });
});
