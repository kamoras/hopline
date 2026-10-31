import { describe, expect, it } from "vitest";
import { nearestBoard, toLink, type BoardLink } from "@/domain/board";
import { BOSTON, NORTHEAST, NYC } from "@/domain/region";
import { getConnections } from "@/server/connections";
import { getPlaces } from "@/server/places";
import { findBoard } from "@/providers/registry";

const boards: BoardLink[] = [
  toLink({ mode: "rail", region: NORTHEAST }),
  toLink({ mode: "subway", region: NYC }),
  toLink({ mode: "subway", region: BOSTON }),
];

describe("nearestBoard", () => {
  it("picks the board of the mode whose area contains where you are looking", () => {
    expect(nearestBoard(boards, "subway", { lat: 40.75, lon: -73.99 })?.regionId).toBe("nyc"); // Midtown
    expect(nearestBoard(boards, "subway", { lat: 42.35, lon: -71.06 })?.regionId).toBe("boston"); // Boston
  });

  it("falls back to the closest area when none contains the point", () => {
    expect(nearestBoard(boards, "subway", { lat: 39.95, lon: -75.16 })?.regionId).toBe("nyc"); // Philadelphia: closer to New York
    expect(nearestBoard(boards, "subway", { lat: 42.9, lon: -71.4 })?.regionId).toBe("boston"); // New Hampshire
  });

  it("has no answer for a mode with no board", () => {
    expect(nearestBoard(boards, "flights" as never, { lat: 40, lon: -73 })).toBeUndefined();
  });
});

describe("connections between modes", () => {
  it("links a train station to the subway beside it, and back", async () => {
    const rail = findBoard("rail", "northeast")!;
    const subway = findBoard("subway", "nyc")!;
    const gct = (await getPlaces(rail)).find((p) => p.name === "Grand Central")!;
    const toSubway = await getConnections(rail, gct);
    expect(toSubway.some((c) => c.mode === "subway" && /grand central/i.test(c.name) && c.href.startsWith("/metro/nyc/stop/"))).toBe(true);

    const station = (await getPlaces(subway)).find((p) => /^Grand Central/.test(p.name))!;
    const toRail = await getConnections(subway, station);
    expect(toRail.some((c) => c.mode === "rail" && c.name === "Grand Central" && c.href === "/rail/northeast/stop/grand-central")).toBe(true);
  });

  it("does not link a station to its own mode or to faraway boards", async () => {
    const rail = findBoard("rail", "northeast")!;
    const stamford = (await getPlaces(rail)).find((p) => p.name === "Stamford")!;
    expect(await getConnections(rail, stamford)).toEqual([]); // no subway in Connecticut
  });
});

describe("mode names", () => {
  it("calls rapid transit Metro, and still resolves the old subway address", async () => {
    const { MODES, getMode } = await import("@/domain/modes");
    expect(MODES.subway.label).toBe("Metro");
    expect(MODES.subway.slug).toBe("metro");
    expect(getMode("metro")).toBe("subway");
    expect(getMode("subway")).toBe("subway"); // an old link, or the internal id used by the API
    expect(getMode("rail")).toBe("rail");
    expect(getMode("nope")).toBeUndefined();
    expect(findBoard("subway", "nyc")?.mode).toBe("subway");
    expect(findBoard("metro", "boston")?.region.id).toBe("boston");
  });
});
