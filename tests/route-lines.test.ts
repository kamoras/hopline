import { describe, expect, it } from "vitest";
import { MODES } from "@/domain/modes";
import { findBoard } from "@/providers/registry";
import { createStaticData } from "@/providers/gtfs/static";
import { createSubwayStatic, subwayRoutes } from "@/providers/gtfs/subway";
import { getTrack } from "@/server/lines";
import { searchRoutes } from "@/server/routes";

const data = createStaticData(
  {
    stops: { A: ["A", 40, -75], B: ["B", 40.01, -75.01] },
    routes: { r1: { name: "One", color: "#111111", short: "1" } as never, r2: { name: "Two", color: "#222222", short: "2" } as never },
    trips: {},
    services: [],
    shapes: [
      { routeId: "r1", pts: [40, -75, 40.01, -75.01] },
      { routeId: "r2", pts: [40, -75, 40.02, -75.02] },
    ],
  },
  { id: "x", name: "X" },
);

describe("a big network's routes", () => {
  it("builds only the requested route's track", () => {
    expect(data.lines()).toHaveLength(2);
    expect(data.lines("1").map((l) => l.route)).toEqual(["1"]);
    expect(data.lines("2").map((l) => l.name)).toEqual(["Two"]);
    expect(data.lines("nope")).toEqual([]);
  });

  it("lists its routes without any geometry", () => {
    expect(subwayRoutes(createSubwayStatic(data, "stop"))).toEqual([
      { route: "1", name: "One", color: "#111111" },
      { route: "2", name: "Two", color: "#222222" },
    ]);
  });

  it("finds a route to follow by number from the real bundled data, and never builds a spatial index for a bus board", async () => {
    const board = findBoard("bus", "boston")!;
    expect(MODES[board.mode].viewport).toBe(true);
    expect((await searchRoutes(board, "39")).some((r) => r.route === "39")).toBe(true);
    expect((await getTrack(board)).lines).toHaveLength(0);
  });
});
