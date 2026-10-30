import { afterEach, describe, expect, it, vi } from "vitest";
import { NORTHEAST } from "@/domain/region";
import { amtrakProvider } from "@/providers/amtrak";

const ctx = () => ({ region: NORTHEAST, now: Date.now(), signal: new AbortController().signal, diag: {} as Record<string, number | string> });

afterEach(() => vi.unstubAllGlobals());

describe("amtrakProvider", () => {
  it("requests the documented Amtraker endpoints", async () => {
    const fetchMock = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    await amtrakProvider.fetchTrips(ctx());
    await amtrakProvider.fetchPlaces(ctx());
    const urls = (fetchMock.mock.calls as unknown[][]).map((c) => String(c[0]));
    expect(urls).toEqual(["https://api.amtraker.com/v3/trains", "https://api.amtraker.com/v3/stations"]);
  });

  it("reports what it dropped", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ "1": [{ trainID: "1-1", lat: 35, lon: -90, stations: [{ code: "XXX", name: "Nowhere" }] }], bad: ["x"] })));
    const c = ctx();
    const trips = await amtrakProvider.fetchTrips(c);
    expect(trips).toEqual([]);
    expect(c.diag).toMatchObject({ trainsInFeed: 2, invalidRecords: 1, outsideRegion: 1, kept: 0 });
  });
});
