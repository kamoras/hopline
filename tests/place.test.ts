import { describe, expect, it } from "vitest";
import { mergePlaces, nearestPlaces, placeSlug } from "@/domain/place";

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
});
