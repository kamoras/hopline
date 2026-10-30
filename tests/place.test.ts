import { describe, expect, it } from "vitest";
import { mergePlaces, nearestPlaces, placeSlug } from "@/domain/place";
import overrides from "../data/places/overrides.json";

const p = (name: string, lat: number, lon: number) => ({ name, lat, lon, mode: "rail" as const, regionId: "northeast" });

describe("places", () => {
  it("slugs names for URLs", () => {
    expect(placeSlug("St. Louis")).toBe("st-louis");
    expect(placeSlug("Harlem–125 St")).toBe("harlem-125-st");
  });

  it("merges the same station named differently by two operators", () => {
    const merged = mergePlaces([p("Stamford", 41.04, -73.54), p("Stamford Station", 41.041, -73.542), p("New Haven", 41.3, -72.9)]);
    expect(merged.map((x) => x.id)).toEqual(["new-haven", "stamford"]);
    expect(merged.find((x) => x.id === "stamford")?.name).toBe("Stamford");
  });

  it("finds the nearest places first", () => {
    const places = mergePlaces([p("Stamford", 41.04, -73.54), p("New Haven", 41.3, -72.9), p("Grand Central", 40.75, -73.98)]);
    const near = nearestPlaces(places, { lat: 41.05, lon: -73.53 }, 2);
    expect(near.map((n) => n.place.id)).toEqual(["stamford", "grand-central"]);
    expect(near[0]!.miles).toBeLessThan(1);
  });

  it("replaces a rough operator position with a verified override, matched by name or code", () => {
    const rough = { name: "New York Penn Station", lat: 40.7506, lon: -73.9971, mode: "rail" as const, regionId: "northeast", codes: ["NYP"] };
    const [byName] = mergePlaces([{ ...rough, codes: undefined }], overrides);
    const [byCode] = mergePlaces([{ ...rough, name: "NY Penn" }], overrides);
    for (const p of [byName, byCode]) expect([p!.lat, p!.lon]).toEqual([40.75058844, -73.99358408]);
  });

  it("keeps operator codes when the same station comes from two operators", () => {
    const merged = mergePlaces([p("Stamford", 41.04, -73.54), { ...p("Stamford Station", 41.041, -73.542), codes: ["STM"] }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ name: "Stamford", codes: ["STM"] });
  });
});
