import { describe, expect, it } from "vitest";
import { covered, enabled, regionOf, servable, timeZoneOf, type IngestedAgency } from "@/providers/generated/plan";
import { generatedProviders } from "@/providers/generated";
import { getRegion } from "@/domain/region";

const agency = (over: Partial<IngestedAgency> = {}): IngestedAgency => ({ id: "a", key: "a", name: "A", state: "Oregon", mode: "bus", kind: "live", bbox: [-123, 45, -122, 46], feeds: { tripUpdates: "t", vehicles: "v" }, ...over });

describe("generated agencies", () => {
  it("switches on only the listed states, and only with a data host", () => {
    const all = [agency({ id: "o" }), agency({ id: "w", state: "Washington" })];
    expect(enabled(all, "Oregon", "https://x").map((a) => a.id)).toEqual(["o"]);
    expect(enabled(all, " washington , oregon", "https://x")).toHaveLength(2);
    expect(enabled(all, "all", "https://x")).toHaveLength(2);
    expect(enabled(all, "all", undefined)).toEqual([]);
    expect(enabled(all, "", "https://x")).toEqual([]);
  });

  it("reads time in the right zone, including split states", () => {
    expect(timeZoneOf("California", -122, 37)).toBe("America/Los_Angeles");
    expect(timeZoneOf("Texas", -106.4, 31.8)).toBe("America/Denver");
    expect(timeZoneOf("Texas", -97, 32)).toBe("America/Chicago");
    expect(timeZoneOf("Florida", -87.2, 30.4)).toBe("America/Chicago");
    expect(timeZoneOf("Arizona", -112, 33.4)).toBe("America/Phoenix");
    expect(timeZoneOf("Nowhere", 0, 0)).toBe("America/New_York");
  });

  it("makes a padded region that holds the service area", () => {
    const r = regionOf(agency());
    expect(r.bounds[0]).toBeLessThan(-123);
    expect(r.bounds[3]).toBeGreaterThan(46);
    expect(r.center).toEqual([-122.5, 45.5]);
    expect(r.timeZone).toBe("America/Los_Angeles");
    expect(regionOf(agency({ bbox: [-122.4, 45.5, -122.39, 45.51] })).zoom).toBeLessThanOrEqual(13);
    expect(regionOf(agency({ bbox: [-125, 32, -114, 42] })).zoom).toBeGreaterThanOrEqual(3.5);
  });

  it("leaves a live agency without both feeds out, and defers to hand-built coverage of the same mode", () => {
    expect(servable(agency({ feeds: { vehicles: "v" } }))).toBe(false);
    expect(servable(agency({ kind: "timetable", feeds: undefined }))).toBe(true);
    const region = regionOf(agency({ id: "h" }));
    expect(covered(agency(), [{ mode: "bus", region }])).toBe(true);
    expect(covered(agency(), [{ mode: "rail", region }])).toBe(false);
    expect(covered(agency({ bbox: [-80, 40, -79, 41] }), [{ mode: "bus", region }])).toBe(false);
  });

  it("serves nothing unless switched on, and registers regions when it is", () => {
    expect(generatedProviders([], "Oregon", undefined)).toEqual([]);
    const providers = generatedProviders([], "Oregon", "https://example.test");
    expect(providers.length).toBeGreaterThan(0);
    const p = providers[0]!;
    expect(getRegion(p.regionIds[0])?.timeZone).toMatch(/^America\//);
  });
});
