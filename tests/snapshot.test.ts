import { afterEach, describe, expect, it, vi } from "vitest";
import type { Board } from "@/domain/board";
import { NORTHEAST } from "@/domain/region";
import type { Trip } from "@/domain/trip";
import type { TransitProvider } from "@/providers/types";

const attribution = { label: "Test", url: "https://example.com" };
const board: Board = { mode: "rail", region: NORTHEAST };
const trip = { id: "ok:1" } as Trip;
const good: TransitProvider = { id: "good", name: "Good", attribution, mode: "rail", regionIds: ["northeast"], fetchTrips: async () => [trip], fetchPlaces: async () => [] };
const bad: TransitProvider = {
  id: "bad", name: "Bad", attribution, mode: "rail", regionIds: ["northeast"],
  fetchTrips: async () => { throw new Error("boom"); }, fetchPlaces: async () => [],
};

afterEach(() => vi.resetModules());

describe("getSnapshot", () => {
  it("isolates provider failures", async () => {
    vi.doMock("@/providers/registry", () => ({ providersFor: () => [good, bad] }));
    const { getSnapshot } = await import("@/server/snapshot");
    const snap = await getSnapshot(board, 1_000);
    expect(snap.trips).toEqual([trip]);
    expect(snap.providers.find((p) => p.id === "bad")).toMatchObject({ ok: false, error: "boom", tripCount: 0 });
    expect(snap.providers.find((p) => p.id === "good")?.ok).toBe(true);
    expect(snap.providers.every((p) => p.attribution.url === attribution.url)).toBe(true); // credit survives failures
  });

  it("serves recent last-good data when a provider starts failing", async () => {
    let fail = false;
    const flaky: TransitProvider = {
      ...good, id: "flaky",
      fetchTrips: async () => { if (fail) throw new Error("down"); return [trip]; },
    };
    vi.doMock("@/providers/registry", () => ({ providersFor: () => [flaky] }));
    const { getSnapshot } = await import("@/server/snapshot");
    await getSnapshot(board, 1_000);
    fail = true;
    const snap = await getSnapshot(board, 30_000);
    expect(snap.trips).toEqual([trip]);
    expect(snap.providers[0]).toMatchObject({ ok: false, tripCount: 1 });
    const later = await getSnapshot(board, 10 * 60_000);
    expect(later.trips).toEqual([]);
  });
});
