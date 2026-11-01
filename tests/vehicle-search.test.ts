import { describe, expect, it } from "vitest";
import type { Trip } from "@/domain/trip";
import { searchVehicles } from "@/lib/vehicle-search";

const trip = (over: Partial<Trip> & { id: string; number: string }): Trip => ({
  operatorId: "x",
  mode: "rail",
  routeName: "Line",
  routeColor: "#000000",
  origin: "",
  destination: "",
  state: "enroute",
  stops: [],
  delayStatus: "on-time",
  updatedAt: 0,
  ...over,
});

const trips = [
  trip({ id: "1", number: "ICE689", mode: "flights", routeName: "Icelandair", destination: "Orlando (MCO)" }),
  trip({ id: "2", number: "2150", routeName: "Acela", destination: "Boston South" }),
  trip({ id: "3", number: "21", routeName: "Red Line", destination: "Alewife" }),
  trip({ id: "4", number: "88", routeName: "Northeast Regional", destination: "Washington", stops: [{ id: "NYP", name: "New York Penn", state: "upcoming" }] }),
  trip({ id: "5", number: "9", routeName: "Gone", state: "completed", destination: "Orlando" }),
];

describe("searchVehicles", () => {
  it("finds a flight by callsign, however it is typed", () => {
    expect(searchVehicles(trips, "ice689").map((t) => t.id)).toEqual(["1"]);
    expect(searchVehicles(trips, "ICE 689").map((t) => t.id)).toEqual(["1"]);
  });

  it("ranks an exact number above a prefix above a route above a destination", () => {
    expect(searchVehicles(trips, "21").map((t) => t.id)).toEqual(["3", "2"]); // exact 21, then 2150 starts with 21
    expect(searchVehicles(trips, "orlando").map((t) => t.id)).toEqual(["1"]); // the finished run is not running
    expect(searchVehicles(trips, "acela").map((t) => t.id)).toEqual(["2"]);
  });

  it("finds what is still headed for a station", () => {
    expect(searchVehicles(trips, "new york penn").map((t) => t.id)).toEqual(["4"]);
  });

  it("finds nothing for an empty query, and caps the list", () => {
    expect(searchVehicles(trips, "  ")).toEqual([]);
    const many = Array.from({ length: 40 }, (_, i) => trip({ id: `m${i}`, number: `${100 + i}`, routeName: "Metro" }));
    expect(searchVehicles(many, "metro")).toHaveLength(12);
  });
});
