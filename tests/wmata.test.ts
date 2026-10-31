import { transit_realtime as rt } from "gtfs-realtime-bindings";
import { describe, expect, it } from "vitest";
import type { FeedMessage } from "@/providers/gtfs/feed";
import { summarizeLineStatus } from "@/providers/gtfs/line-status";
import { createStaticData } from "@/providers/gtfs/static";
import { buildSubwayArrivals, buildSubwayTrips, createSubwayStatic, subwayPlaces } from "@/providers/gtfs/subway";
import { loadWmataStatic } from "@/providers/wmata/static";

const NOW = Date.UTC(2026, 9, 30, 23, 0, 0);
const sec = (min: number) => String(Math.floor(NOW / 1000) + min * 60);

// Platform ids and names as WMATA's static feed has them: Metro Center is one station with a platform per line group.
const data = createSubwayStatic(
  createStaticData(
    {
      stops: {
        PF_A15_C: ["Shady Grove", 39.12, -77.165],
        PF_A01_C: ["Metro Center", 38.898, -77.028],
        PF_C01_C: ["Metro Center", 38.8983, -77.0281],
        PF_A13_C: ["Rockville", 39.084, -77.146],
      },
      routes: {
        RED: { name: "Red", color: "#C80F2D", short: "RD", text: "#FFFFFF" } as never,
        YELLOW: { name: "Yellow", color: "#FFD100", short: "YL", text: "#000000" } as never,
      },
      trips: {},
      services: [],
      shapes: [],
    },
    { id: "wmata", name: "Washington Metro" },
  ),
);

const feed = (entity: object[]) => ({ header: { gtfsRealtimeVersion: "2.0" }, entity }) as unknown as FeedMessage;
const update = (id: string, routeId: string, stops: [string, number][]) => ({
  id,
  // WMATA's first stop has only a departure; later ones only an arrival.
  tripUpdate: { trip: { tripId: id, routeId }, stopTimeUpdate: stops.map(([stopId, min], i) => ({ stopId, [i === 0 ? "departure" : "arrival"]: { time: sec(min), uncertainty: 0 } })) },
});
const vehicle = (tripId: string | undefined, routeId: string | undefined) => ({
  id: `v${tripId}`,
  vehicle: {
    trip: tripId ? { tripId, routeId } : undefined,
    position: { latitude: 39.0, longitude: -77.1, bearing: 341 },
    currentStatus: rt.VehiclePosition.VehicleStopStatus.INCOMING_AT,
    timestamp: sec(0),
    vehicle: { id: "001", label: "131" },
  },
});

describe("Washington subway", () => {
  it("merges a station's platforms across lines", () => {
    expect(data.stations.map((s) => s.name).sort()).toEqual(["Metro Center", "Rockville", "Shady Grove"]);
    expect(data.stationOfPlatform("PF_C01_C")?.platforms).toEqual(["PF_A01_C", "PF_C01_C"]);
    expect(subwayPlaces(data, "washington").find((p) => p.name === "Metro Center")).toMatchObject({ regionId: "washington", mode: "subway", codes: ["PF_A01_C", "PF_C01_C"] });
  });

  it("shows each train where it reports itself and skips trains with no trip", () => {
    const trips = buildSubwayTrips({
      operatorId: "wmata",
      staticData: data,
      tripUpdates: feed([update("T1", "RED", [["PF_A13_C", 1], ["PF_A01_C", 9]])]),
      vehicles: feed([vehicle("T1", "RED"), vehicle(undefined, undefined)]),
      now: NOW,
    });
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ id: "wmata:T1", operatorId: "wmata", number: "RD", routeName: "Red", destination: "Metro Center", mode: "subway" });
    expect(trips[0]!.position).toMatchObject({ lat: 39.0, lon: -77.1, heading: 341, source: "reported" });
    expect(trips[0]!.stops.map((s) => s.name)).toEqual(["Rockville", "Metro Center"]);
  });

  it("lists arrivals at any platform of a station, with the line's own badge colors", () => {
    const arrivals = buildSubwayArrivals({
      staticData: data,
      tripUpdates: feed([update("T1", "RED", [["PF_A13_C", 3], ["PF_A01_C", 12]]), update("T2", "YELLOW", [["PF_A15_C", 0], ["PF_C01_C", 5]]), update("T3", "RED", [["PF_A01_C", 90]])]),
      platforms: data.stationOfPlatform("PF_A01_C")!.platforms,
      now: NOW,
    });
    expect(arrivals.map((a) => [a.tripId, a.route, a.headsign, a.textColor])).toEqual([
      ["T2", "YL", "Metro Center", "#000000"],
      ["T1", "RD", "Metro Center", "#FFFFFF"],
    ]);
  });

  it("reports line status from alerts, and every line good when there are none", () => {
    const style = new Map([["RD", { color: "#C80F2D", text: "#FFFFFF" }], ["YL", { color: "#FFD100", text: "#000000" }]]);
    const input = { now: NOW, order: ["RD", "YL"], lineOf: (id: string) => data.lines[id]?.short, style };
    expect(summarizeLineStatus({ ...input, feed: feed([]) }).map((s) => s.state)).toEqual(["good", "good"]);
    const alert = { id: "a", alert: { effect: rt.Alert.Effect.SIGNIFICANT_DELAYS, headerText: { translation: [{ text: "Red Line: delays", language: "en" }] }, informedEntity: [{ routeId: "RED" }] } };
    expect(summarizeLineStatus({ ...input, feed: feed([alert]) }).map((s) => [s.route, s.state])).toEqual([["RD", "delays"], ["YL", "good"]]);
  });
});

describe("bundled Metrorail data", () => {
  it("has the six lines with their badges, and stations that merge across lines", async () => {
    const metro = await loadWmataStatic();
    expect(Object.values(metro.lines).map((l) => l.short).sort()).toEqual(["BL", "GR", "OR", "RD", "SV", "YL"]);
    expect(metro.lines.YELLOW).toMatchObject({ color: "#FFD100", text: "#000000" });
    expect(metro.stations.length).toBeGreaterThan(90);
    expect(metro.stations.find((s) => s.name === "Metro Center")!.platforms.length).toBeGreaterThan(1);
    expect(metro.stations.some((s) => /Platform/.test(s.name))).toBe(false); // named after the station, not the platform
  });
});
