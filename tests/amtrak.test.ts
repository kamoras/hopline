import { describe, expect, it } from "vitest";
import { NORTHEAST } from "@/domain/region";
import { normalizeAmtrakTrip } from "@/providers/amtrak/normalize";
import { AmtrakTrainSchema } from "@/providers/amtrak/schema";

const st = (code: string, name: string, status: string, sch: string, act: string) => ({
  code, name, status, platform: "", schArr: sch, schDep: sch, arr: act, dep: act,
});

const raw = {
  routeName: "Northeast Regional",
  trainNum: "150",
  trainNumRaw: "150",
  trainID: "150-28",
  lat: 41.2,
  lon: -73.1,
  iconColor: "#2f6fb5",
  heading: "NE",
  velocity: 62,
  trainState: "Active",
  statusMsg: "",
  lastValTS: "2026-10-29T15:00:00-04:00",
  origName: "Washington", origCode: "WAS", destName: "Boston", destCode: "BOS",
  alerts: [{ message: "Delayed due to a signal problem near Bridgeport" }],
  stations: [
    st("PHL", "Philadelphia", "Departed", "2026-10-29T13:00:00-04:00", "2026-10-29T13:02:00-04:00"),
    st("NYP", "New York Penn", "Departed", "2026-10-29T14:30:00-04:00", "2026-10-29T14:48:00-04:00"),
    st("NHV", "New Haven", "Enroute", "2026-10-29T15:40:00-04:00", "2026-10-29T15:58:00-04:00"),
  ],
};

describe("normalizeAmtrakTrip", () => {
  const trip = normalizeAmtrakTrip(AmtrakTrainSchema.parse(raw), NORTHEAST)!;

  it("maps identity and position", () => {
    expect(trip.id).toBe("amtrak:150-28");
    expect(trip.number).toBe("150");
    expect(trip.position).toMatchObject({ lat: 41.2, lon: -73.1, heading: 45, source: "reported" });
  });

  it("computes per-stop delay and headline status", () => {
    expect(trip.stops.map((s) => s.delayMinutes)).toEqual([2, 18, 18]);
    expect(trip.nextStop?.id).toBe("NHV");
    expect(trip.delayMinutes).toBe(18);
    expect(trip.delayStatus).toBe("major");
  });

  it("prefers operator-reported reason over inference", () => {
    expect(trip.delayReason).toEqual({ kind: "operator-reported", text: "Delayed due to a signal problem near Bridgeport" });
  });

  it("drops trips outside the region", () => {
    const far = AmtrakTrainSchema.parse({ ...raw, lat: 35, lon: -90 });
    expect(normalizeAmtrakTrip(far, NORTHEAST)).toBeUndefined();
  });

  it("keeps position-less trips that serve region stations", () => {
    const pre = AmtrakTrainSchema.parse({ ...raw, lat: 0, lon: 0, trainState: "Predeparture", alerts: [] });
    const t = normalizeAmtrakTrip(pre, NORTHEAST)!;
    expect(t.position).toBeUndefined();
  });

  it("tolerates junk fields", () => {
    const parsed = AmtrakTrainSchema.safeParse({ ...raw, lat: "x", stations: "nope" });
    expect(parsed.success).toBe(true);
  });
});
