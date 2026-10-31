import { transit_realtime as rt } from "gtfs-realtime-bindings";
import { describe, expect, it } from "vitest";
import { summarizeRouteAlerts } from "@/providers/gtfs/line-status";
import { createSubwayStatic } from "@/providers/gtfs/subway";
import { createStaticData } from "@/providers/gtfs/static";

const NOW = Date.UTC(2026, 9, 31, 15, 0, 0);
const data = createStaticData(
  {
    stops: { S1: ["Stop One", 42.3, -71.1] },
    // Bus feeds add a short name (and sometimes a text color) to each route.
    routes: { "R-1": { name: "Route 1", color: "#FFC72C", short: "1", text: "#000000" }, "R-66": { name: "Route 66", color: "#003DA5", short: "66" } } as never,
    trips: {},
    services: [],
    shapes: [],
  },
  { id: "test-bus", name: "Test Bus" },
);
const buses = createSubwayStatic(data, "stop");

const alert = (id: string, routeIds: string[], effect: string, header: string) => ({
  id,
  alert: { informedEntity: routeIds.map((routeId) => ({ routeId })), effect, headerText: { translation: [{ text: header, language: "en" }] } },
});
const atStop = (id: string, routeId: string, stopId: string) => ({ id, alert: { informedEntity: [{ routeId, stopId }], effect: "NO_SERVICE", headerText: { translation: [{ text: "Stop closed", language: "en" }] } } });
const feed = (entity: object[]) => rt.FeedMessage.fromObject({ header: { gtfsRealtimeVersion: "2.0" }, entity }) as unknown as Parameters<typeof summarizeRouteAlerts>[0];

describe("bus route alerts", () => {
  it("lists only routes with an alert, worst first, and ignores routes it does not know", () => {
    const status = summarizeRouteAlerts(
      feed([
        alert("a", ["R-1"], "DETOUR", "Route 1 detoured"),
        alert("b", ["R-66"], "NO_SERVICE", "Route 66 suspended"),
        alert("c", ["SUBWAY-RED"], "NO_SERVICE", "Red Line suspended"),
      ]),
      buses,
      NOW,
    );
    expect(status.map((l) => [l.route, l.state])).toEqual([
      ["66", "suspended"],
      ["1", "change"],
    ]);
    expect(status[1]).toMatchObject({ color: "#FFC72C", textColor: "#000000" });
  });

  it("does not call a closed stop a suspended route", () => {
    const status = summarizeRouteAlerts(feed([atStop("s", "R-1", "S1")]), buses, NOW);
    expect(status.map((l) => [l.route, l.state])).toEqual([["1", "change"]]);
  });

  it("is empty when nothing is wrong", () => {
    expect(summarizeRouteAlerts(feed([]), buses, NOW)).toEqual([]);
  });
});
