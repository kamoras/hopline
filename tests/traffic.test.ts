import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/traffic/[z]/[x]/[y]/route";
import { createBudget, trafficAvailable, trafficTilePath, TRAFFIC_CACHE_S, TRAFFIC_MIN_ZOOM, upstreamTileUrl, validTile } from "@/lib/traffic";

const ask = (z: string, x: string, y: string) => GET(new Request("http://x/api/traffic"), { params: Promise.resolve({ z, x, y }) });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("traffic tiles", () => {
  it("the browser's template points at this site, never at TomTom", () => {
    expect(trafficTilePath("https://hopline.example")).toBe("https://hopline.example/api/traffic/{z}/{x}/{y}");
  });

  it("builds TomTom's address with the key encoded (server only)", () => {
    expect(upstreamTileUrl("a b&c", 12, 1205, 1539)).toBe("https://api.tomtom.com/traffic/map/4/tile/flow/relative/12/1205/1539.png?key=a%20b%26c&tileSize=256");
  });

  it("only allows tiles the overlay could ask for", () => {
    expect(validTile(12, 1205, 1539)).toBe(true); // New York
    expect(validTile(12, 1205, 1539, [[-120, 30, -110, 40]])).toBe(false); // outside the areas given
    expect(validTile(12, 600, 1539)).toBe(false); // out in the Atlantic, nowhere Hopline covers
    expect(validTile(TRAFFIC_MIN_ZOOM - 1, 0, 0)).toBe(false); // too far out
    expect(validTile(15, 1205 * 8, 1539 * 8)).toBe(false); // finer than the map ever asks for
    expect(validTile(12, 4096, 0)).toBe(false); // off the map
    expect(validTile(12, -1, 0)).toBe(false);
    expect(validTile(12, 1.5, 0)).toBe(false);
    expect(validTile(Number.NaN, 0, 0)).toBe(false);
  });
});

describe("the traffic route", () => {
  it("does not exist without a key", async () => {
    vi.stubEnv("TOMTOM_API_KEY", "");
    expect(trafficAvailable()).toBe(false);
    expect((await ask("12", "1205", "1539")).status).toBe(404);
  });

  it("fetches a tile with the server's key, caches it at the edge, and never repeats the key", async () => {
    vi.stubEnv("TOMTOM_API_KEY", "s3cret");
    const fetchMock = vi.fn(async (url: string) => (url ? new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } }) : new Response(null)));
    vi.stubGlobal("fetch", fetchMock);
    expect(trafficAvailable()).toBe(true);
    const res = await ask("12", "1205", "1539");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain(`s-maxage=${TRAFFIC_CACHE_S}`);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("key=s3cret");
    expect(JSON.stringify([...res.headers])).not.toContain("s3cret");
  });

  it("refuses bad tiles without asking TomTom, and hides upstream failures (and the key)", async () => {
    vi.stubEnv("TOMTOM_API_KEY", "s3cret");
    const fetchMock = vi.fn(async () => new Response("denied key=s3cret", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await ask("3", "0", "0")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    const failed = await ask("12", "1205", "1539");
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain("s3cret");
  });
});

describe("the daily allowance", () => {
  it("stops at its limit, then starts again the next UTC day", () => {
    let now = Date.UTC(2026, 10, 2, 12);
    const budget = createBudget(3, () => now);
    expect([1, 2, 3, 4].map(() => budget.take())).toEqual([true, true, true, false]);
    now += 86_400_000;
    expect(budget.take()).toBe(true);
  });
});
