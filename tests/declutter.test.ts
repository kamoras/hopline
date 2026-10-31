import { describe, expect, it } from "vitest";
import type { Line } from "@/domain/line";
import type { Place } from "@/domain/place";
import { assignDetailZoom, DETAIL_MAX_ZOOM, DETAIL_MIN_ZOOM, MIN_SPACING_PX, type Declutterable } from "@/lib/declutter";
import { placeImportance } from "@/lib/importance";

// Web Mercator at zoom 0 with 512 px tiles, written out independently of the implementation.
const px = (lat: number, lon: number, z: number) => {
  const x = ((lon + 180) / 360) * 512 * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 512 * 2 ** z;
  return [x, y] as const;
};

let seed = 5;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const crowd = (n: number): Declutterable[] =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, lat: 40.6 + rand() * 0.25, lon: -74.1 + rand() * 0.3, importance: Math.floor(rand() * 40) }));

describe("assignDetailZoom", () => {
  it("never shows two stations closer than the spacing at any zoom", () => {
    const points = crowd(400);
    const zooms = assignDetailZoom(points);
    for (const z of [8, 10, 12, 13]) {
      const shown = points.filter((p) => zooms.get(p.id)! <= z);
      for (let i = 0; i < shown.length; i++) {
        for (let j = i + 1; j < shown.length; j++) {
          const [ax, ay] = px(shown[i]!.lat, shown[i]!.lon, z);
          const [bx, by] = px(shown[j]!.lat, shown[j]!.lon, z);
          expect(Math.hypot(ax - bx, ay - by)).toBeGreaterThanOrEqual(MIN_SPACING_PX - 1e-6);
        }
      }
    }
  });

  it("keeps the most important stations on screen longest, and shows everything once zoomed in far enough", () => {
    const points = crowd(300);
    const zooms = assignDetailZoom(points);
    const top = [...points].sort((a, b) => b.importance - a.importance || a.id.localeCompare(b.id))[0]!;
    expect(zooms.get(top.id)).toBe(DETAIL_MIN_ZOOM); // nothing outranks it, so nothing can crowd it out
    expect(Math.max(...zooms.values())).toBeLessThanOrEqual(DETAIL_MAX_ZOOM);
    const lowZoomShown = points.filter((p) => zooms.get(p.id)! <= 9).length;
    expect(lowZoomShown).toBeLessThan(points.length / 2); // zoomed out, most of a crowd is held back
  });

  it("lets a less important station in when there is room, but never before a more important neighbor", () => {
    const a = { id: "a", lat: 40.75, lon: -73.99, importance: 20 };
    const b = { id: "b", lat: 40.7502, lon: -73.9902, importance: 5 }; // about 30 m away
    const far = { id: "c", lat: 40.9, lon: -73.5, importance: 1 };
    const zooms = assignDetailZoom([b, a, far]);
    expect(zooms.get("a")).toBe(DETAIL_MIN_ZOOM);
    expect(zooms.get("b")!).toBeGreaterThan(zooms.get("a")!);
    expect(zooms.get("c")).toBe(DETAIL_MIN_ZOOM); // alone, so it shows from the start
  });

  it("gives the same answer whatever order the stations arrive in", () => {
    const points = crowd(200);
    expect([...assignDetailZoom(points)].sort()).toEqual([...assignDetailZoom([...points].reverse())].sort());
  });

  it("handles a national-sized list quickly", () => {
    const many = Array.from({ length: 30_000 }, (_, i) => ({ id: `n${i}`, lat: 25 + rand() * 24, lon: -124 + rand() * 57, importance: i % 7 }));
    const start = performance.now();
    assignDetailZoom(many);
    expect(performance.now() - start).toBeLessThan(3000);
  });
});

describe("placeImportance", () => {
  // Two lines cross at x; "end" is the end of the east-west line.
  const lines: Line[] = [
    { id: "ew", name: "East-West", color: "#f00", route: "EW", coords: [[-74.0, 40.7], [-73.99, 40.7], [-73.98, 40.7], [-73.97, 40.7]] },
    { id: "ns", name: "North-South", color: "#00f", route: "NS", coords: [[-73.99, 40.69], [-73.99, 40.7], [-73.99, 40.71]] },
  ];
  const place = (id: string, lon: number, lat: number): Place => ({ id, name: id, lat, lon, mode: "subway", regionId: "x" });

  it("ranks an interchange above a local stop, and a terminus above a stop in the middle", () => {
    const score = placeImportance([place("x", -73.99, 40.7), place("mid", -73.98, 40.7), place("end", -73.97, 40.7), place("nowhere", -73.9, 40.8)], lines);
    expect(score.get("x")!).toBeGreaterThan(score.get("end")!);
    expect(score.get("end")!).toBeGreaterThan(score.get("mid")!);
    expect(score.get("mid")!).toBeGreaterThan(score.get("nowhere")!);
  });
});
