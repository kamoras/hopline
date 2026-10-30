import { describe, expect, it } from "vitest";
import { NORTHEAST } from "@/domain/region";
import { serviceDayStart } from "@/lib/time";
import { buildScheduledTrips } from "@/providers/gtfs/scheduled";
import { createStaticData } from "@/providers/gtfs/static";

const DATE = "20261029";
const start = serviceDayStart(DATE, "America/New_York");
const at = (min: number) => start + min * 60_000;

const staticData = createStaticData(
  {
    stops: { "1": ["Old Saybrook", 41.3, -72.376], "2": ["Guilford", 41.28, -72.68], "3": ["New Haven", 41.304, -72.925] },
    routes: { SLE: { name: "Shore Line East", color: "#00A859" } },
    trips: {
      NOW: ["1", "SLE", "New Haven", 0, "1@480;2@510#2;3@540", 0, -1],
      LATER: ["2", "SLE", "New Haven", 0, "1@900;3@960", 0, -1],
      OTHERDAY: ["3", "SLE", "New Haven", 0, "1@480;3@540", 1, -1],
      NIGHT: ["4", "SLE", "Old Saybrook", 1, "3@1430;2@1450;1@1480", 0, -1],
    },
    services: [DATE, "20261030"],
    shapes: [],
  },
  { id: "shoreline-east", name: "Shore Line East" },
);

const build = (now: number) => buildScheduledTrips({ id: "shoreline-east", name: "Shore Line East", staticData, region: NORTHEAST, now });

describe("scheduled trips", () => {
  it("shows today's trips near now, positioned from the timetable, with no delay claimed", () => {
    const trips = build(at(495));
    expect(trips.map((t) => t.number)).toEqual(["1"]); // LATER is hours away; OTHERDAY doesn't run today
    const [trip] = trips;
    expect(trip).toMatchObject({ id: "shoreline-east:NOW", operatorId: "shoreline-east", routeName: "Shore Line East", state: "enroute", delayStatus: "unknown" });
    expect(trip!.position?.source).toBe("estimated");
    expect(trip!.stops[1]!.platform).toBe("2"); // the timetable's track comes through
  });

  it("includes yesterday's service day for trips that run past midnight", () => {
    const afterMidnight = start + 24 * 60 * 60_000 + 10 * 60_000; // 00:10 on the 30th
    expect(build(afterMidnight).map((t) => t.number)).toContain("4");
  });

  it("lists a trip shortly before it departs and drops it after it ends", () => {
    expect(build(at(480 - 60)).map((t) => t.number)).toEqual(["1"]);
    expect(build(at(540 + 30))).toEqual([]);
  });
});
