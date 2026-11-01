import { describe, expect, it } from "vitest";
import { MODES } from "@/domain/modes";
import { NYC } from "@/domain/region";
import type { FeedMessage } from "@/providers/gtfs/feed";
import { buildScheduledArrivals, buildScheduledTrips } from "@/providers/gtfs/scheduled";
import { createStaticData } from "@/providers/gtfs/static";
import { buildSubwayTrips, createSubwayStatic } from "@/providers/gtfs/subway";

const NOW = Date.UTC(2026, 10, 2, 15, 0, 0); // 10:00 in New York
const sec = (min: number) => String(Math.floor(NOW / 1000) + min * 60);
const feed = (entity: object[]) => ({ header: { gtfsRealtimeVersion: "2.0" }, entity }) as unknown as FeedMessage;
const DATE = "20261102";

// A ferry's trip is 305 on route ER, and the live feed says only "trip 305", never the route.
const data = createStaticData(
  {
    stops: { "8": ["Wall St/Pier 11", 40.703, -74.006], "18": ["East 34th Street", 40.744, -73.972] },
    routes: { ER: { name: "East River", color: "#00839C", short: "ER", text: "#FFFFFF" } as never },
    trips: { "305": ["", "ER", "East 34th Street", 0, `8@${10 * 60 + 5};18@${10 * 60 + 30}`, 0, -1] },
    services: [DATE],
    shapes: [],
  },
  { id: "nyc-ferry", name: "NYC Ferry" },
);
const ferries = createSubwayStatic(data, "name");

describe("ferries", () => {
  it("is a mode of its own, with landings and docks", () => {
    expect(MODES.ferry).toMatchObject({ label: "Ferries", stopNoun: "landing", platformNoun: "Dock", browse: "stations" });
  });

  it("finds a vessel's route from its trip when the live feed gives only the trip (NYC Ferry)", () => {
    const trips = buildSubwayTrips({
      operatorId: "nyc-ferry",
      mode: "ferry",
      staticData: ferries,
      tripUpdates: feed([{ id: "305", tripUpdate: { trip: { tripId: "305" }, stopTimeUpdate: [{ stopId: "18", arrival: { time: sec(25) } }] } }]),
      vehicles: feed([{ id: "v", vehicle: { trip: { tripId: "305" }, position: { latitude: 40.72, longitude: -74.0, bearing: 20 }, timestamp: sec(0), vehicle: { id: "13" } } }]),
      now: NOW,
    });
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ mode: "ferry", number: "ER", routeName: "East River", destination: "East 34th Street" });
  });

  it("places a timetable-only ferry by the schedule, with the route standing in for a train number", () => {
    const trips = buildScheduledTrips({ id: "nyc-sif", name: "Staten Island Ferry", staticData: data, region: NYC, now: NOW, mode: "ferry" });
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ mode: "ferry", number: "ER", delayStatus: "unknown" });
  });

  it("lists the next scheduled boats at a landing, with the last stop as the destination when the feed names none", () => {
    const arrivals = buildScheduledArrivals({
      staticData: data,
      lineOf: () => ({ route: "ER", color: "#00839C", textColor: "#FFFFFF" }),
      region: NYC,
      platforms: ["8"],
      now: NOW,
    });
    expect(arrivals.map((a) => [a.route, a.platform])).toEqual([["ER", "8"]]);
  });
});
