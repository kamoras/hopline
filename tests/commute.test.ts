import { describe, expect, it } from "vitest";
import type { Trip } from "@/domain/trip";
import { aliasesOfAll } from "@/lib/aliases";
import { commuteMatches } from "@/lib/commute";

const NOW = Date.UTC(2026, 10, 2, 15, 0, 0);
const call = (id: string, name: string, minutes: number) => ({ id, name, state: "upcoming" as const, arrival: NOW + minutes * 60_000, departure: NOW + minutes * 60_000 });
const trip = (id: string, stops: ReturnType<typeof call>[]): Trip => ({
  id,
  operatorId: "mnr",
  mode: "rail",
  number: id,
  routeName: "New Haven Line",
  routeColor: "#ee0034",
  origin: stops[0]!.name,
  destination: stops.at(-1)!.name,
  state: "enroute",
  stops,
  nextStop: stops[0],
  delayStatus: "on-time",
  updatedAt: NOW,
});

const trips = [
  trip("1", [call("STM", "Stamford", 10), call("GCT", "Grand Central", 60)]),
  trip("2", [call("STM", "Stamford", 5), call("NHV", "New Haven", 40)]), // goes the wrong way
  trip("3", [call("GCT", "Grand Central", 5), call("STM", "Stamford", 50)]), // the other direction
  trip("4", [call("STM", "Stamford", 30), call("GCT", "Grand Central", 80)]),
];

describe("saved commutes", () => {
  it("finds trains that call at the first place and then the second, soonest first", () => {
    const found = commuteMatches(trips, { from: "stamford", to: "grand central" }, NOW);
    expect(found.map((m) => m.trip.id)).toEqual(["1", "4"]);
    expect(found[0]!.from.name).toBe("Stamford");
    expect(found[0]!.to.name).toBe("Grand Central");
  });

  it("understands what people call places", () => {
    expect(aliasesOfAll()["new york"]).toBeDefined();
    expect(commuteMatches(trips, { from: "stamford", to: "gct" }, NOW).map((m) => m.trip.id)).toEqual(["1", "4"]);
  });
});
