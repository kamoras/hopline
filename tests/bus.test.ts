import { describe, expect, it } from "vitest";
import type { FeedMessage } from "@/providers/gtfs/feed";
import { createStaticData } from "@/providers/gtfs/static";
import { buildSubwayArrivals, buildSubwayTrips, createSubwayStatic, subwayPlaces } from "@/providers/gtfs/subway";
import { readableTextColor } from "@/lib/color";

const NOW = Date.UTC(2026, 9, 30, 15, 0, 0);
const sec = (min: number) => String(Math.floor(NOW / 1000) + min * 60);
const feed = (entity: object[]) => ({ header: { gtfsRealtimeVersion: "2.0" }, entity }) as unknown as FeedMessage;

// Bus stops share names ("Main St" on both sides of the street), so each stop is its own place.
const buses = createSubwayStatic(
  createStaticData(
    {
      stops: { "100": ["Main St", 40.0, -75.2], "101": ["Main St", 40.0001, -75.2001], "102": ["Broad St", 40.01, -75.19] },
      routes: { "40": { name: "2nd-Lombard to Conshohocken", color: "#EF3340", short: "40", text: "#FFFFFF" } as never },
      trips: {},
      services: [],
      shapes: [],
    },
    { id: "septa-bus", name: "SEPTA Bus" },
  ),
  "stop",
);

describe("bus stops", () => {
  it("keeps stops that share a name apart, each opening its own arrivals", () => {
    const places = subwayPlaces(buses, "philadelphia", "bus");
    expect(places.map((p) => [p.id, p.name, p.mode])).toEqual([["100", "Main St", "bus"], ["101", "Main St", "bus"], ["102", "Broad St", "bus"]]);
    expect(places[0]!.codes).toEqual(["100"]);
  });

  it("lists the buses due at one stop only", () => {
    const arrivals = buildSubwayArrivals({
      staticData: buses,
      tripUpdates: feed([{ id: "t", tripUpdate: { trip: { tripId: "t", routeId: "40" }, stopTimeUpdate: [{ stopId: "100", arrival: { time: sec(4) } }, { stopId: "102", arrival: { time: sec(9) } }] } }]),
      platforms: ["100"],
      now: NOW,
    });
    expect(arrivals.map((a) => [a.route, a.headsign, a.platform])).toEqual([["40", "Broad St", "100"]]);
  });
});

describe("vehicles that report no trip", () => {
  const position = { latitude: 40.0, longitude: -75.2, bearing: 90 };
  const update = { id: "u", tripUpdate: { trip: { tripId: "T9", routeId: "40" }, vehicle: { id: "3804" }, stopTimeUpdate: [{ stopId: "102", arrival: { time: sec(6) } }] } };

  it("takes the route and trip from the trip update that names the same vehicle (SEPTA)", () => {
    const trips = buildSubwayTrips({
      operatorId: "septa-bus",
      mode: "bus",
      staticData: buses,
      tripUpdates: feed([update]),
      vehicles: feed([
        { id: "3804", vehicle: { position, timestamp: sec(0), vehicle: { id: "3804", label: "3804" } } }, // no trip of its own
        { id: "9999", vehicle: { position, timestamp: sec(0), vehicle: { id: "9999" } } }, // no trip, and no update names it
      ]),
      now: NOW,
    });
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ id: "septa-bus:T9", mode: "bus", number: "40", destination: "Broad St" });
  });

  it("still prefers the vehicle's own trip when it reports one", () => {
    const [trip] = buildSubwayTrips({
      operatorId: "septa-bus",
      mode: "bus",
      staticData: buses,
      tripUpdates: feed([update]),
      vehicles: feed([{ id: "3804", vehicle: { trip: { tripId: "T1", routeId: "40" }, position, timestamp: sec(0), vehicle: { id: "3804" } } }]),
      now: NOW,
    });
    expect(trip!.id).toBe("septa-bus:T1");
  });
});

describe("readableTextColor", () => {
  it("picks black on light colors and white on dark ones", () => {
    expect(readableTextColor("#FFC72C")).toBe("#000000"); // MBTA bus yellow
    expect(readableTextColor("#1A1818")).toBe("#FFFFFF"); // SEPTA bus charcoal
    expect(readableTextColor("#EF3340")).toBe("#000000"); // a mid red reads better with black (5.0:1 against 4.2:1)
    expect(readableTextColor("#003DA5")).toBe("#FFFFFF");
    expect(readableTextColor("nonsense")).toBe("#FFFFFF");
  });
});
