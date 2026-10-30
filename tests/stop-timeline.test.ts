import { describe, expect, it } from "vitest";
import { stopPhases } from "@/components/stop-timeline";
import type { StopCall, StopState } from "@/domain/trip";

const stops = (...states: StopState[]): StopCall[] => states.map((state, i) => ({ id: String(i), name: `S${i}`, state }));

describe("stopPhases", () => {
  it("marks passed stops, the next stop, and the rest ahead", () => {
    expect(stopPhases(stops("departed", "departed", "upcoming", "upcoming", "upcoming"))).toEqual(["visited", "visited", "next", "upcoming", "upcoming"]);
  });

  it("marks where the train is when it is standing at a station", () => {
    expect(stopPhases(stops("departed", "at", "upcoming", "upcoming"))).toEqual(["visited", "here", "next", "upcoming"]);
  });

  it("treats a train that has not left yet as all ahead, first stop next", () => {
    expect(stopPhases(stops("upcoming", "upcoming", "upcoming"))).toEqual(["next", "upcoming", "upcoming"]);
  });

  it("handles a finished trip", () => {
    expect(stopPhases(stops("departed", "departed"))).toEqual(["visited", "visited"]);
  });
});
