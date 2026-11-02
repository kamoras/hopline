import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/trip/route";
import type { StopCall, Trip } from "@/domain/trip";
import { leanTrip } from "@/lib/lean";

const stop = (id: string, state: StopCall["state"]): StopCall => ({ id, name: id, state, arrival: 1 });
const trip = (mode: Trip["mode"]): Trip => ({
  id: "x:1",
  operatorId: "x",
  mode,
  number: "1",
  routeName: "Line",
  routeColor: "#000000",
  origin: "A",
  destination: "D",
  state: "enroute",
  stops: [stop("A", "departed"), stop("B", "departed"), stop("C", "upcoming"), stop("D", "upcoming")],
  nextStop: stop("C", "upcoming"),
  delayStatus: "on-time",
  updatedAt: 0,
});

describe("lean trips (what the map polls)", () => {
  it("keeps a train's stops that are still ahead, for A-to-B, commutes and a station's trains", () => {
    expect(leanTrip(trip("rail")).stops.map((s) => s.id)).toEqual(["C", "D"]);
  });

  it("leaves a bus's, metro's or ferry's stops out", () => {
    for (const mode of ["bus", "subway", "ferry"] as const) expect(leanTrip(trip(mode)).stops).toEqual([]);
  });

  it("keeps a flight's first stop, the airport the map points at", () => {
    expect(leanTrip(trip("flights")).stops.map((s) => s.id)).toEqual(["A"]);
  });

  it("drops a departure that only repeats the arrival, and keeps one that differs (a stop where it waits)", () => {
    const dwell: StopCall = { id: "C", name: "C", state: "upcoming", arrival: 100, departure: 160, scheduledArrival: 100, scheduledDeparture: 160 };
    const passing: StopCall = { id: "D", name: "D", state: "upcoming", arrival: 200, departure: 200, scheduledArrival: 200, scheduledDeparture: 200 };
    const lean = leanTrip({ ...trip("rail"), stops: [dwell, passing], nextStop: passing });
    expect(lean.stops[0]).toMatchObject({ departure: 160, scheduledDeparture: 160 });
    expect(lean.stops[1]).not.toHaveProperty("departure");
    expect(lean.nextStop).not.toHaveProperty("scheduledDeparture");
  });

  it("rounds positions to about a meter, so the digits that are only noise are not sent", () => {
    const t: Trip = { ...trip("bus"), position: { lat: 40.95607089996338, lon: -72.82733154296875, heading: 211.06, speedMph: 38.4567, source: "reported" }, motion: [{ t0: 0, t1: 1, path: [40.956070899, -72.827331542, 40.9561, -72.8273] }] };
    const lean = leanTrip(t);
    expect(lean.position).toEqual({ lat: 40.95607, lon: -72.82733, heading: 211, speedMph: 38.5, source: "reported" });
    expect(lean.motion![0]!.path).toEqual([40.95607, -72.82733, 40.9561, -72.8273]);
  });

  it("changes nothing else about the vehicle", () => {
    const t = trip("bus");
    expect({ ...leanTrip(t), stops: [], nextStop: undefined, position: undefined, motion: undefined, destinationAt: undefined }).toEqual({ ...t, stops: [], nextStop: undefined, position: undefined, motion: undefined, destinationAt: undefined });
  });
});

describe("/api/trip", () => {
  const ask = (query: string) => GET(new Request(`http://x/api/trip?${query}`));

  it("answers 404 for an unknown board, a missing id, or an absurd one", async () => {
    expect((await ask("mode=nope&region=x&id=a")).status).toBe(404);
    expect((await ask("mode=rail&region=northeast")).status).toBe(404);
    expect((await ask(`mode=rail&region=northeast&id=${"x".repeat(200)}`)).status).toBe(404);
  });
});
