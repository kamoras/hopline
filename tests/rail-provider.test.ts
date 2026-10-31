import { transit_realtime as rt } from "gtfs-realtime-bindings";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NORTHEAST } from "@/domain/region";
import { createRealtimeRailProvider } from "@/providers/gtfs/rail-provider";
import { createStaticData } from "@/providers/gtfs/static";

const NOW = Date.UTC(2026, 9, 30, 14, 0, 0);
const DATE = "20261030";
const staticData = createStaticData(
  {
    stops: { A: ["Alpha", 39.0, -77.0], B: ["Beta", 39.2, -76.8] },
    routes: { R1: { name: "Penn Line", color: "#FF8000" } },
    trips: { T1: ["400", "R1", "Beta", 0, `A@${14 * 60 - 20};B@${14 * 60 + 40}`, 0, -1] },
    services: [DATE],
    shapes: [],
  },
  { id: "test-rail", name: "Test Rail" },
);

const encode = (entity: object[]) => rt.FeedMessage.encode(rt.FeedMessage.fromObject({ header: { gtfsRealtimeVersion: "2.0", timestamp: NOW / 1000 }, entity })).finish();
const feeds = {
  "https://rt.test/tu": encode([
    { id: "1", tripUpdate: { trip: { tripId: "T1", routeId: "R1", startDate: DATE }, stopTimeUpdate: [{ stopId: "B", arrival: { time: NOW / 1000 + 45 * 60 } }] } },
    { id: "2", tripUpdate: { trip: { tripId: "BUS1", routeId: "999", startDate: DATE }, stopTimeUpdate: [] } },
  ]),
  "https://rt.test/vp": encode([
    { id: "v1", vehicle: { trip: { tripId: "T1", routeId: "R1", startDate: DATE }, position: { latitude: 39.1, longitude: -76.9 }, timestamp: NOW / 1000 } },
    { id: "v2", vehicle: { trip: { tripId: "BUS1", routeId: "999" }, position: { latitude: 39.1, longitude: -76.9 } } },
  ]),
};

afterEach(() => vi.unstubAllGlobals());

describe("realtime rail provider", () => {
  const provider = createRealtimeRailProvider({
    realtime: { id: "test-rail", name: "Test Rail" },
    attribution: { label: "Test", url: "https://test", notice: "n" },
    regionIds: ["northeast"],
    staticData: () => Promise.resolve(staticData),
    feeds: { tripUpdates: "https://rt.test/tu", vehicles: "https://rt.test/vp" },
    apiKey: { value: "secret", header: "x-api-key" },
  });

  it("merges trip updates and vehicle positions, keeps only its own routes, and sends the key", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => new Response(feeds[url as keyof typeof feeds] as BodyInit));
    vi.stubGlobal("fetch", fetchMock);
    const diag = {};
    const trips = await provider.fetchTrips({ region: NORTHEAST, signal: AbortSignal.timeout(5000), now: NOW, diag });
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ id: "test-rail:T1", number: "400", routeName: "Penn Line" });
    expect(trips[0]!.position?.source).toBe("reported"); // the vehicle's GPS fix wins over the estimate
    expect(diag).toMatchObject({ matchedByTripId: 1 });
    expect(fetchMock.mock.calls.every(([, init]) => (init?.headers as Record<string, string>)["x-api-key"] === "secret")).toBe(true);
  });
});
