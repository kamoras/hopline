import { describe, expect, it } from "vitest";
import type { Position, Trip } from "@/domain/trip";
import { createPolyline } from "@/lib/polyline";
import { snapToTrack } from "@/server/snap";

// A straight track running due east at latitude 41.0.
const track = [createPolyline([41.0, -73.0, 41.0, -72.9])];

const trip = (position?: Position): Trip => ({ id: "t", position }) as Trip;
const reported = (lat: number, lon: number, heading?: number): Position => ({ lat, lon, heading, source: "reported" });

describe("snapToTrack", () => {
  it("pulls a GPS fix near the track onto it", () => {
    const [t] = snapToTrack([trip(reported(41.0005, -72.95))], track); // ~55 m north of the track
    expect(t!.position!.lat).toBeCloseTo(41.0, 6);
    expect(t!.position!.lon).toBeCloseTo(-72.95, 4);
  });

  it("leaves a fix that is nowhere near any track alone", () => {
    const [t] = snapToTrack([trip(reported(41.02, -72.95))], track); // ~2 km away
    expect(t!.position!.lat).toBe(41.02);
  });

  it("does not touch estimated positions", () => {
    const estimated: Position = { lat: 41.0005, lon: -72.95, source: "estimated" };
    expect(snapToTrack([trip(estimated)], track)[0]!.position).toEqual(estimated);
  });

  it("faces the way the train reported, along the track", () => {
    const east = snapToTrack([trip(reported(41.0003, -72.95, 80))], track)[0]!.position!;
    const west = snapToTrack([trip(reported(41.0003, -72.95, 270))], track)[0]!.position!;
    expect(east.heading).toBeCloseTo(90, 0);
    expect(west.heading).toBeCloseTo(270, 0);
  });

  it("handles trips without a position and boards without track", () => {
    expect(snapToTrack([trip()], track)[0]!.position).toBeUndefined();
    const p = reported(41.0005, -72.95);
    expect(snapToTrack([trip(p)], [])[0]!.position).toEqual(p);
  });
});
