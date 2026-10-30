import { describe, expect, it } from "vitest";
import { parseRoute, pinKey, searchTrips } from "@/lib/search";
import type { DelayStatus, StopCall, Trip } from "@/domain/trip";

const stop = (name: string, arrival: number, state: StopCall["state"] = "upcoming"): StopCall => ({ id: name, name, state, arrival });

function trip(number: string, delayStatus: DelayStatus, stops: StopCall[], operatorId = "mnr"): Trip {
  return {
    id: `${operatorId}:${number}`, operatorId, mode: "rail", number, routeName: "New Haven Line", routeColor: "#f00",
    origin: "Grand Central", destination: "New Haven", state: "enroute", stops, delayStatus,
    nextStop: stops.find((s) => s.state !== "departed"), updatedAt: 0,
  };
}

const trips = [
  trip("1302", "on-time", [stop("Stamford", 300)]),
  trip("1304", "major", [stop("Stamford", 100)]),
  trip("2150", "minor", [stop("Stamford", 200, "departed"), stop("New Haven", 500)], "amtrak"),
];
const base = { query: "", operator: "all", delayedOnly: false };

describe("searchTrips", () => {
  it("lists the most delayed trips first", () => {
    expect(searchTrips(trips, base).map((m) => m.trip.number)).toEqual(["1304", "2150", "1302"]);
  });
  it("matches trip numbers by prefix", () => {
    expect(searchTrips(trips, { ...base, query: "130" }).map((m) => m.trip.number)).toEqual(["1304", "1302"]);
  });
  it("matches stations only for trips still due there, ordered by arrival", () => {
    const m = searchTrips(trips, { ...base, query: "stamford" });
    expect(m.map((x) => x.trip.number)).toEqual(["1304", "1302"]);
    expect(m[0]?.stop?.name).toBe("Stamford");
  });
  it("filters by operator and delay", () => {
    expect(searchTrips(trips, { ...base, operator: "amtrak" })).toHaveLength(1);
    expect(searchTrips(trips, { ...base, delayedOnly: true }).map((m) => m.trip.number)).toEqual(["1304", "2150"]);
  });
  it("pins by operator and number so the key survives across days", () => {
    expect(pinKey(trips[0]!)).toBe("mnr:1302");
  });
  it("parses A-to-B queries", () => {
    expect(parseRoute("Stamford to Grand Central")).toEqual({ from: "stamford", to: "grand central" });
    expect(parseRoute("stamford → new haven")).toEqual({ from: "stamford", to: "new haven" });
    expect(parseRoute("stamford")).toBeUndefined();
    expect(parseRoute("stamford to")).toBeUndefined();
  });

  it("finds trips that call at A and then B, with A still ahead", () => {
    const t = [
      trip("1", "on-time", [stop("Stamford", 100), stop("New Haven", 200)]),
      trip("2", "on-time", [stop("New Haven", 100), stop("Stamford", 200)]), // wrong direction
      trip("3", "on-time", [stop("Stamford", 50, "departed"), stop("New Haven", 150)]), // already left A
    ];
    const m = searchTrips(t, { ...base, query: "stamford to new haven" });
    expect(m.map((x) => x.trip.number)).toEqual(["1"]);
    expect(m[0]?.to?.name).toBe("New Haven");
  });
});
