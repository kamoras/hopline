import { describe, expect, it } from "vitest";
import { toLink } from "@/domain/board";
import { BOSTON, NORTHEAST, NORTHEAST_AIR, NYC } from "@/domain/region";
import { activeBoards, boundsOfBoards, MODE_MIN_ZOOM, parseWorldPlaceId, requestsFor, worldPlaceId, type WorldView } from "@/lib/world";

const boards = [
  toLink({ mode: "rail", region: NORTHEAST }),
  toLink({ mode: "subway", region: NYC }),
  toLink({ mode: "subway", region: BOSTON }),
  toLink({ mode: "flights", region: NORTHEAST_AIR }),
  toLink({ mode: "bus", region: NYC }),
];
const all = new Set(["rail", "subway", "flights", "bus"] as const);
const nyc = (zoom: number): WorldView => ({ bbox: [-74.1, 40.65, -73.85, 40.85], zoom });

describe("which boards the model shows", () => {
  it("shows only boards in view, close enough to read", () => {
    const at = (zoom: number) => activeBoards(boards, nyc(zoom), all).map((b) => `${b.mode}/${b.regionId}`);
    expect(at(5)).toEqual(["rail/northeast"]); // zoomed out: just trains (planes wait for zoom 6)
    expect(at(6)).toEqual(["rail/northeast", "flights/northeast-air"]);
    expect(at(8)).toEqual(["rail/northeast", "subway/nyc", "flights/northeast-air"]); // not Boston's metro: out of view
    expect(at(12)).toContain("bus/nyc");
    expect(activeBoards(boards, undefined, all)).toEqual([]);
  });

  it("leaves out modes that are switched off", () => {
    expect(activeBoards(boards, nyc(13), new Set(["subway"])).map((b) => b.mode)).toEqual(["subway"]);
  });

  it("shows a followed route's board at any zoom, and only that route of it", () => {
    const bus = boards[4]!;
    expect(activeBoards(boards, nyc(5), all).map((b) => b.mode)).not.toContain("bus");
    expect(activeBoards(boards, nyc(5), all, { board: bus, route: "M15" }).map((b) => b.mode)).toContain("bus");
    const r = requestsFor(bus, nyc(5), "M15+SBS");
    expect(r.trips).toBe("/api/trips?mode=bus&region=nyc&lean=1&route=M15%2BSBS");
    expect(r.lines).toBe("/api/lines?mode=bus&region=nyc&route=M15%2BSBS");
    expect(r.places).toBeUndefined();
  });

  it("keeps every mode's start zoom in step with how dense it is", () => {
    expect(MODE_MIN_ZOOM.rail).toBeLessThan(MODE_MIN_ZOOM.subway);
    expect(MODE_MIN_ZOOM.subway).toBeLessThan(MODE_MIN_ZOOM.bus);
  });
});

describe("what a board is asked for", () => {
  it("asks a small board for everything, once", () => {
    const r = requestsFor(boards[1]!, nyc(10));
    expect(r.trips).toBe("/api/trips?mode=subway&region=nyc&lean=1");
    expect(r.lines).toBe("/api/lines?mode=subway&region=nyc");
    expect(r.places).toBe("/api/places?mode=subway&region=nyc");
  });

  it("asks a big network for the visible area only, rounded outward, with stops only when close", () => {
    const far = requestsFor(boards[4]!, nyc(12.5));
    expect(far.trips).toMatch(/^\/api\/trips\?mode=bus&region=nyc&lean=1&bbox=-74\.1,40\.64,-73\.84,40\.86$/);
    expect(far.lines).toBeUndefined(); // a route's track comes only when one is chosen
    expect(far.places).toBeUndefined();
    expect(requestsFor(boards[4]!, nyc(14.5)).places).toContain("&bbox=");
  });
});

describe("the combined map's ids and first view", () => {
  it("keeps equal station ids on different boards apart, and takes them back apart", () => {
    const id = worldPlaceId({ mode: "subway", regionId: "nyc" }, "times-sq");
    expect(id).not.toBe(worldPlaceId({ mode: "bus", regionId: "nyc" }, "times-sq"));
    expect(parseWorldPlaceId(id)).toEqual({ mode: "subway", regionId: "nyc", placeId: "times-sq" });
    expect(parseWorldPlaceId(worldPlaceId({ mode: "bus", regionId: "nyc" }, "a~b"))).toMatchObject({ placeId: "a~b" }); // ids may contain the separator
    expect(parseWorldPlaceId("nonsense")).toBeUndefined();
  });

  it("starts with a rectangle that holds every board it is given", () => {
    const [w, s, e, n] = boundsOfBoards(boards);
    for (const b of boards) {
      expect(w).toBeLessThanOrEqual(b.bounds[0]);
      expect(s).toBeLessThanOrEqual(b.bounds[1]);
      expect(e).toBeGreaterThanOrEqual(b.bounds[2]);
      expect(n).toBeGreaterThanOrEqual(b.bounds[3]);
    }
  });
});
