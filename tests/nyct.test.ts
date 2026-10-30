import { transit_realtime as rt } from "gtfs-realtime-bindings";
import { describe, expect, it } from "vitest";
import { NYC } from "@/domain/region";
import { buildNyctTrips } from "@/providers/nyct/normalize";
import { createNyctStatic, loadNyctStatic, type RawSubway } from "@/providers/nyct/static";

const NOW = 1_800_000_000_000;
const sec = (ms: number) => Math.floor(ms / 1000);

// A tiny line "X" running north along a straight track: three stations 1 km apart.
const raw: RawSubway = {
  stations: [
    ["A1", "Alpha St", 40.7, -73.95, ["A1N", "A1S"]],
    ["B1", "Beta St", 40.709, -73.95, ["B1N", "B1S"]],
    ["C1", "Gamma St", 40.718, -73.95, ["C1N", "C1S"]],
  ],
  routes: { X: { short: "X", long: "Test Line", color: "#00aa00", text: "#ffffff" } },
  shapes: { shapes: [{ route: "X", pts: [40.695, -73.95, 40.725, -73.95] }], byId: { "X..N": 0 }, fallback: { "X:0": 0 } },
};
const data = createNyctStatic(raw);

function feed(entities: rt.IFeedEntity[]): rt.FeedMessage {
  const msg = rt.FeedMessage.create({ header: { gtfsRealtimeVersion: "2.0", timestamp: sec(NOW) }, entity: entities });
  return rt.FeedMessage.decode(rt.FeedMessage.encode(msg).finish());
}
const trip = (stops: [string, number][], extra: rt.IFeedEntity[] = []) =>
  feed([
    { id: "t", tripUpdate: { trip: { tripId: "100000_X..N", routeId: "X" }, stopTimeUpdate: stops.map(([stopId, at]) => ({ stopId, arrival: { time: sec(at) } })) } },
    ...extra,
  ]);
const build = (f: rt.FeedMessage) => buildNyctTrips({ staticData: data, feeds: [f], region: NYC, now: NOW, diag: {} });

describe("buildNyctTrips", () => {
  it("builds a trip from upcoming stops, with the line's identity", () => {
    const [t] = build(trip([["B1N", NOW + 90_000], ["C1N", NOW + 200_000]]));
    expect(t).toMatchObject({ operatorId: "nyct", mode: "subway", number: "X", routeName: "Test Line", routeColor: "#00aa00", destination: "Gamma St", state: "enroute" });
    expect(t!.nextStop?.name).toBe("Beta St");
    expect(t!.delayStatus).toBe("unknown"); // the feed has no schedule to be late against
  });

  it("places the train behind its next stop, along the track, by the time it still needs", () => {
    const [t] = build(trip([["B1N", NOW + 60_000], ["C1N", NOW + 150_000]]));
    // Beta is at 40.709; 60 s at ~11 m/s (or measured 1 km / 90 s = 11 m/s) is ~670 m south of it.
    expect(t!.position!.lat).toBeLessThan(40.709);
    expect(t!.position!.lat).toBeGreaterThan(40.7);
    expect(t!.position!.heading).toBeCloseTo(0, 0); // northbound
    expect(t!.motion).toHaveLength(1);
    expect(t!.motion![0]!.t1).toBe(NOW + 60_000); // the leg ends at the next stop
  });

  it("holds a train that is stopped at a station", () => {
    const stopped = rt.VehiclePosition.VehicleStopStatus.STOPPED_AT;
    const [t] = build(trip([["B1N", NOW + 10_000], ["C1N", NOW + 120_000]], [{ id: "v", vehicle: { trip: { tripId: "100000_X..N" }, currentStatus: stopped, stopId: "B1N" } }]));
    expect(t!.state).toBe("at-station");
    expect(t!.position!.lat).toBeCloseTo(40.709, 3);
    expect(t!.motion).toBeUndefined();
  });

  it("drops trips that are finished or have not started", () => {
    expect(build(trip([["B1N", NOW - 120_000]]))).toEqual([]); // already served
    expect(build(trip([["B1N", NOW + 40 * 60_000]]))).toEqual([]); // starts much later
  });

  it("keeps only the next few stops plus the destination", () => {
    const stops: [string, number][] = [["A1N", NOW + 10_000], ["B1N", NOW + 60_000], ["C1N", NOW + 120_000], ["A1N", NOW + 180_000], ["B1N", NOW + 240_000]];
    const [t] = build(trip(stops));
    expect(t!.stops).toHaveLength(4);
    expect(t!.stops.at(-1)!.arrival).toBe(NOW + 240_000);
  });

  it("counts what it dropped and skips unknown routes", () => {
    const diag: Record<string, number | string> = {};
    const f = feed([{ id: "u", tripUpdate: { trip: { tripId: "1_Q..N", routeId: "Q" }, stopTimeUpdate: [{ stopId: "B1N", arrival: { time: sec(NOW + 1000) } }] } }]);
    expect(buildNyctTrips({ staticData: data, feeds: [f], region: NYC, now: NOW, diag })).toEqual([]);
    expect(diag).toMatchObject({ tripUpdates: 1, unknownRoute: 1 });
  });
});

describe("real subway data", () => {
  const real = loadNyctStatic();
  it("merges a complex's stations and platforms under one name", () => {
    const times = real.stations.filter((s) => s.name === "Times Sq-42 St");
    expect(times).toHaveLength(1);
    expect(times[0]!.platforms).toEqual(expect.arrayContaining(["127N", "725S", "R16N", "902S"]));
    expect(real.stationOfPlatform("725N")?.name).toBe("Times Sq-42 St");
  });

  it("knows line colors and finds track for a route and direction", () => {
    expect(real.routes["A"]?.color).toBe("#0062CF");
    expect(real.shapeFor("123456_A..N03R", "A", "N")).toBeDefined();
    expect(real.shapeFor("unknown_id", "L", "S")).toBeDefined(); // falls back to the route's main track
  });

  it("draws each distinct track once", () => {
    const lines = real.lines();
    expect(lines.length).toBeGreaterThan(20);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
  });
});
