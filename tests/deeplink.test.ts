import { describe, expect, it } from "vitest";
import { linkHref, parseLink, type Link } from "@/lib/deeplink";

describe("deep links", () => {
  const links: Link[] = [
    { kind: "trip", key: "mnr:521", mode: "rail", regionId: "northeast" },
    { kind: "place", mode: "subway", regionId: "nyc", placeId: "times-sq-42-st" },
    { kind: "route", mode: "bus", regionId: "boston", route: "39" },
  ];

  it("round-trips what is open through the address", () => {
    for (const link of links) {
      const params = Object.fromEntries(new URL(linkHref(link), "http://x").searchParams);
      expect(parseLink(params)).toEqual(link);
    }
  });

  it("writes readable addresses", () => {
    expect(linkHref(links[0])).toBe("/?trip=mnr:521&board=rail/northeast");
    expect(linkHref(links[2])).toBe("/?route=bus/boston/39");
    expect(linkHref(undefined)).toBe("/");
  });

  it("ignores anything it does not understand", () => {
    expect(parseLink({})).toBeUndefined();
    expect(parseLink({ trip: "x" })).toBeUndefined(); // no board
    expect(parseLink({ trip: "mnr:1", board: "spaceship/mars" })).toBeUndefined(); // no such mode
    expect(parseLink({ place: "rail/northeast" })).toBeUndefined(); // no place
    expect(parseLink({ trip: "x".repeat(200), board: "rail/northeast" })).toBeUndefined();
  });
});
