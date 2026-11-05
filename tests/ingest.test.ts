import { describe, expect, it } from "vitest";
import { checkLive, inService, keyFor, liveWorks, modeOfRouteType, modesIn, namesRoutes, planFor } from "../scripts/lib/ingest";

describe("what a schedule holds", () => {
  it("maps route types to the mode a rider looks for", () => {
    expect(["3", "11", "702"].map(modeOfRouteType)).toEqual(["bus", "bus", "bus"]);
    expect(["0", "1", "12"].map(modeOfRouteType)).toEqual(["subway", "subway", "subway"]);
    expect(["2", "101"].map(modeOfRouteType)).toEqual(["rail", "rail"]);
    expect(modeOfRouteType("4")).toBe("ferry");
    expect(["5", "6", "7", "nonsense"].map(modeOfRouteType)).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("lists the modes in a feed with their route types", () => {
    const modes = modesIn([{ route_type: "3" }, { route_type: "3" }, { route_type: "1" }, { route_type: "0" }, { route_type: "5" }]);
    expect([...modes.keys()].sort()).toEqual(["bus", "subway"]);
    expect(modes.get("subway")!.sort()).toEqual(["0", "1"]);
  });

  it("calls a schedule in service only if it runs from today on", () => {
    expect(inService([{ end_date: "20261231" }], [], "20261103")).toBe(true);
    expect(inService([{ end_date: "20261001" }], [], "20261103")).toBe(false);
    expect(inService([], [{ date: "20261110", exception_type: "1" }], "20261103")).toBe(true);
    expect(inService([], [{ date: "20261110", exception_type: "2" }], "20261103")).toBe(false); // a removed date is not service
    expect(inService([], [], "20261103")).toBe(false);
  });
});

describe("whether a live feed matches", () => {
  const routes = new Set(["r1", "r2"]);
  const trips = new Set(["t1"]);

  it("ties vehicles to the schedule by route, or by trip when they name no route", () => {
    const check = checkLive([{ routeId: "r1" }, { routeId: "zzz" }, { tripId: "t1" }, { tripId: "nope" }, {}], routes, trips);
    expect(check).toEqual({ vehicles: 5, matched: 2, withRoute: 2 });
  });

  it("accepts a feed whose vehicles mostly match, and rejects one that does not (or is empty)", () => {
    expect(liveWorks({ vehicles: 10, matched: 7, withRoute: 10 })).toBe(true);
    expect(liveWorks({ vehicles: 10, matched: 3, withRoute: 10 })).toBe(false);
    expect(liveWorks({ vehicles: 0, matched: 0, withRoute: 0 })).toBe(false);
    expect(namesRoutes({ vehicles: 10, withRoute: 2, matched: 10 })).toBe(false); // names only trips: keep the schedule's trips
  });
});

describe("what to serve", () => {
  const live = { vehicles: 10, matched: 9, withRoute: 10 };

  it("serves a bus network only when its live feed works", () => {
    expect(planFor("bus", ["3"], undefined)).toBeUndefined();
    expect(planFor("bus", ["3"], { vehicles: 10, matched: 2, withRoute: 10 })).toBeUndefined();
    expect(planFor("bus", ["3"], live)).toMatchObject({ kind: "live", options: { realtimeOnly: true, scanStops: true } });
  });

  it("keeps the schedule's trips for a live feed that names only trips", () => {
    expect(planFor("bus", ["3"], { vehicles: 10, matched: 9, withRoute: 0 })!.options).toMatchObject({ realtimeOnly: false, scanStops: false });
  });

  it("serves trains and ferries from the timetable when there is no live feed", () => {
    expect(planFor("rail", ["2"], undefined)).toMatchObject({ kind: "timetable" });
    expect(planFor("ferry", ["4"], undefined)).toMatchObject({ kind: "timetable", options: { coarseGapM: 1e9 } });
    expect(planFor("subway", ["1"], undefined)!.options).toMatchObject({ platformStops: true });
  });

  it("names the data of an agency with several modes by mode", () => {
    expect(keyFor("valley-metro-147", "bus", 2)).toBe("valley-metro-147-bus");
    expect(keyFor("big-blue-bus-37", "bus", 1)).toBe("big-blue-bus-37");
  });
});

describe("joining batches", () => {
  const s = (key: string) => ({ key });
  const r = (id: string) => ({ id });
  it("sorts and counts each agency once", async () => {
    const { mergeReports, missingKeys } = await import("../scripts/lib/ingest");
    const merged = mergeReports([
      { served: [s("b"), s("a")], rejected: [r("z")] },
      { served: [s("c"), s("a")], rejected: [r("y"), r("z")] },
    ]);
    expect(merged.served.map((x) => x.key)).toEqual(["a", "b", "c"]);
    expect(merged.rejected.map((x) => x.id)).toEqual(["y", "z"]);
    expect(missingKeys(merged.served, new Set(["a", "c"]))).toEqual(["b"]);
  });
});
