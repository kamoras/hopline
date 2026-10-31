import { transit_realtime as rt } from "gtfs-realtime-bindings";
import { describe, expect, it } from "vitest";
import { summarizeLineStatus } from "@/providers/gtfs/line-status";
import type { FeedMessage } from "@/providers/gtfs/feed";
import { createStaticData } from "@/providers/gtfs/static";
import { buildMbtaSubwayArrivals, buildMbtaSubwayTrips } from "@/providers/mbta-subway/normalize";
import { createMbtaSubwayStatic } from "@/providers/mbta-subway/static";

const NOW = Date.UTC(2026, 9, 30, 15, 0, 0);
const sec = (min: number) => String(Math.floor(NOW / 1000) + min * 60);

const data = createMbtaSubwayStatic(
  createStaticData(
    {
      // Two platforms (one per direction) at each station, named after the station like the T's feed.
      stops: { "1": ["Alewife", 42.395, -71.142], "2": ["Davis", 42.396, -71.122], "3": ["Davis", 42.3961, -71.1221], "4": ["Park Street", 42.356, -70.964] },
      routes: { Red: { name: "Red Line", color: "#DA291C", short: "RL" } as never, "Green-B": { name: "Green Line B", color: "#00843D", short: "B" } as never },
      trips: {},
      services: [],
      shapes: [],
    },
    { id: "mbta-subway", name: "MBTA Subway" },
  ),
);

const feed = (entity: object[]) => ({ header: { gtfsRealtimeVersion: "2.0" }, entity }) as unknown as FeedMessage;
const update = (id: string, routeId: string, stops: [string, number][]) => ({
  id,
  tripUpdate: { trip: { tripId: id, routeId }, stopTimeUpdate: stops.map(([stopId, min]) => ({ stopId, arrival: { time: sec(min) } })) },
});
const vehicle = (tripId: string, routeId: string, extra: object = {}) => ({
  id: `y${tripId}`,
  vehicle: { trip: { tripId, routeId }, position: { latitude: 42.396, longitude: -71.13, bearing: 90 }, currentStatus: rt.VehiclePosition.VehicleStopStatus.IN_TRANSIT_TO, timestamp: sec(0), ...extra },
});

describe("station grouping", () => {
  it("merges a station's platforms and finds the station from any of them", () => {
    expect(data.stations.map((s) => s.name).sort()).toEqual(["Alewife", "Davis", "Park Street"]);
    expect(data.stationOfPlatform("3")?.platforms).toEqual(["2", "3"]);
  });
});

describe("MBTA subway trips", () => {
  it("shows each train where it reports itself, heading for its next stops", () => {
    const trips = buildMbtaSubwayTrips({
      staticData: data,
      tripUpdates: feed([update("T1", "Red", [["2", 2], ["1", 5]])]),
      vehicles: feed([vehicle("T1", "Red"), vehicle("BUS1", "1"), vehicle("T2", "Green-B")]),
      now: NOW,
    });
    expect(trips.map((t) => t.id)).toEqual(["mbta-subway:T1", "mbta-subway:T2"]); // the bus is not ours
    expect(trips[0]).toMatchObject({ number: "RL", routeName: "Red Line", destination: "Alewife", state: "enroute", mode: "subway" });
    expect(trips[0]!.position).toMatchObject({ lat: 42.396, lon: -71.13, heading: 90, source: "reported" });
    expect(trips[0]!.stops.map((s) => s.name)).toEqual(["Davis", "Alewife"]);
    expect(trips[1]!.destination).toBe("Green Line B"); // no trip update: fall back to the line
  });

  it("marks a train stopped at its next station", () => {
    const [trip] = buildMbtaSubwayTrips({
      staticData: data,
      tripUpdates: feed([update("T1", "Red", [["2", 0], ["1", 5]])]),
      vehicles: feed([vehicle("T1", "Red", { currentStatus: rt.VehiclePosition.VehicleStopStatus.STOPPED_AT, stopId: "2" })]),
      now: NOW,
    });
    expect(trip).toMatchObject({ state: "at-station" });
    expect(trip!.stops[0]).toMatchObject({ name: "Davis", state: "at" });
  });
});

describe("MBTA subway arrivals", () => {
  it("lists trains due at any of a station's platforms, soonest first, going to their last stop", () => {
    const arrivals = buildMbtaSubwayArrivals({
      staticData: data,
      tripUpdates: feed([update("T1", "Red", [["2", 6], ["1", 9]]), update("T2", "Red", [["3", 2], ["4", 20]]), update("T3", "Red", [["3", 90]])]),
      platforms: ["2", "3"],
      now: NOW,
    });
    expect(arrivals.map((a) => [a.tripId, a.headsign, a.route])).toEqual([["T2", "Park Street", "RL"], ["T1", "Alewife", "RL"]]); // T3 is beyond the 45 min horizon
    expect(arrivals[0]).toMatchObject({ color: "#DA291C", platform: "3" });
  });
});

describe("line status", () => {
  it("summarizes alerts with the generic summarizer", () => {
    const alert = (header: string, effect: rt.Alert.Effect, routeId: string) => ({
      id: header,
      alert: { effect, headerText: { translation: [{ text: header, language: "en" }] }, informedEntity: [{ routeId }] },
    });
    const status = summarizeLineStatus({
      feed: feed([alert("Green Line B: no service", rt.Alert.Effect.NO_SERVICE, "Green-B")]),
      now: NOW,
      order: ["RL", "B"],
      lineOf: (id) => ({ Red: "RL", "Green-B": "B" })[id],
      style: new Map([["RL", { color: "#DA291C", text: "#FFFFFF" }], ["B", { color: "#00843D", text: "#FFFFFF" }]]),
    });
    expect(status.map((s) => [s.route, s.state])).toEqual([["RL", "good"], ["B", "suspended"]]);
  });
});
