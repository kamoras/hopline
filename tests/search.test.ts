import { describe, expect, it } from "vitest";
import { describeIntent, parseIntent } from "@/lib/query";
import { pinKey, searchTrips } from "@/lib/search";
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

describe("natural language", () => {
  it("parses plain journeys", () => {
    expect(parseIntent("Stamford to Grand Central").legs).toEqual([{ from: "stamford", to: "grand central" }]);
    expect(parseIntent("stamford → new haven").legs).toEqual([{ from: "stamford", to: "new haven" }]);
    expect(parseIntent("stamford").legs).toEqual([]);
    expect(parseIntent("stamford to").legs).toEqual([]);
  });

  it("understands round trips", () => {
    const i = parseIntent("new haven to new york round trip");
    expect(i.roundTrip).toBe(true);
    expect(i.legs).toEqual([
      { from: "new haven", to: "new york" },
      { from: "new york", to: "new haven" },
    ]);
    expect(parseIntent("new haven to new york and back").roundTrip).toBe(true);
  });

  it("understands filler words and timing", () => {
    const i = parseIntent("trains leaving new haven to new york right now");
    expect(i.legs).toEqual([{ from: "new haven", to: "new york" }]);
    expect(i.soonMinutes).toBe(60);
    expect(parseIntent("show me trains from stamford to grand central in the next 30 minutes")).toMatchObject({
      legs: [{ from: "stamford", to: "grand central" }],
      soonMinutes: 30,
    });
    expect(parseIntent("trains from stamford within the next 2 hours").soonMinutes).toBe(120);
  });

  it("leaves non-journeys for ordinary search", () => {
    expect(parseIntent("2150")).toMatchObject({ legs: [], rest: "2150" });
    expect(parseIntent("trains leaving stamford now")).toMatchObject({ legs: [], rest: "stamford", soonMinutes: 60 });
  });

  it("echoes what it understood", () => {
    expect(describeIntent(parseIntent("trains leaving new haven to new york right now round trip"))).toBe(
      "New Haven → New York · round trip · next 1 hr",
    );
    expect(describeIntent(parseIntent("2150"))).toBeUndefined();
  });

  const aliases = { "new york": ["grand central", "new york penn"] };
  const NOW = 1_000_000;
  const min = (m: number) => NOW + m * 60_000;
  const trips = [
    trip("1", "on-time", [stop("New Haven", min(10)), stop("Grand Central", min(100))]),
    trip("2", "on-time", [stop("New Haven", min(120)), stop("Grand Central", min(210))]), // too far out for "now"
    trip("3", "on-time", [stop("Grand Central", min(15)), stop("New Haven", min(105))]), // the return leg
  ];

  it("resolves city aliases to stations", () => {
    const m = searchTrips(trips, { ...base, query: "new haven to new york" }, { aliases, now: NOW });
    expect(m.map((x) => x.trip.number)).toEqual(["1", "2"]);
  });

  it("limits 'right now' to the next hour", () => {
    const m = searchTrips(trips, { ...base, query: "trains leaving new haven to new york right now" }, { aliases, now: NOW });
    expect(m.map((x) => x.trip.number)).toEqual(["1"]);
  });

  it("returns both directions for a round trip, grouped by leg", () => {
    const m = searchTrips(trips, { ...base, query: "new haven to new york round trip" }, { aliases, now: NOW });
    expect(m.map((x) => [x.leg, x.trip.number])).toEqual([[0, "1"], [0, "2"], [1, "3"]]);
  });

  it("applies aliases to single-station searches too", () => {
    const m = searchTrips(trips, { ...base, query: "new york" }, { aliases, now: NOW });
    expect(m.length).toBeGreaterThan(0);
  });
});
