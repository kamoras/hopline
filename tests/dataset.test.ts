import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAgencyBundle, lazy, MAX_RESIDENT, residentCount } from "@/providers/gtfs/dataset";

afterEach(() => vi.unstubAllGlobals());

describe("lazy data", () => {
  it("loads once, shares the result, and retries after a failure", async () => {
    let calls = 0;
    const once = lazy(async () => ++calls);
    expect(await Promise.all([once(), once()])).toEqual([1, 1]);
    let tries = 0;
    const flaky = lazy(async () => {
      if (++tries === 1) throw new Error("down");
      return "ok";
    });
    await expect(flaky()).rejects.toThrow("down");
    expect(await flaky()).toBe("ok");
  });

  it("keeps no more than the allowance in memory, dropping the least recently used", async () => {
    const loads: number[] = [];
    const items = Array.from({ length: MAX_RESIDENT + 5 }, (_, i) => lazy(async () => (loads.push(i), i)));
    for (const item of items) await item();
    expect(residentCount()).toBeLessThanOrEqual(MAX_RESIDENT);
    const before = loads.length;
    await items[0]!(); // the oldest was dropped, so it loads again
    expect(loads.length).toBe(before + 1);
    await items[items.length - 1]!(); // the newest is still held
    expect(loads.length).toBe(before + 1);
  });
});

describe("a published agency bundle", () => {
  const bundle = { stops: {}, routes: {}, trips: {}, services: [], shapes: [] };

  it("is not fetched when no data host is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchAgencyBundle("mnr", undefined)).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is read from the host by agency id", async () => {
    const fetchMock = vi.fn(async (url: string) => (url ? Response.json(bundle) : new Response(null)));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchAgencyBundle("fairfax-connector", "https://data.example/hopline")).toEqual(bundle);
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://data.example/hopline/fairfax-connector.json");
  });

  it("fails when the host lacks it or sends something incomplete, so the bundled copy can answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await expect(fetchAgencyBundle("x", "https://h")).rejects.toThrow("404");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ stops: {} })));
    await expect(fetchAgencyBundle("x", "https://h")).rejects.toThrow("incomplete");
  });
});
