import { transit_realtime as rt } from "gtfs-realtime-bindings";
import { describe, expect, it } from "vitest";
import { NORTHEAST } from "@/domain/region";
import { indexAlerts } from "@/providers/mnr/alerts";
import { buildMnrTrips } from "@/providers/mnr/normalize";
import { createStaticData, parseStopTimes } from "@/providers/mnr/static";
import { serviceDayStart } from "@/lib/time";

const staticData = createStaticData({
  stops: {
    "1": ["Grand Central", 40.753, -73.977],
    "2": ["Stamford", 41.047, -73.542],
    "3": ["New Haven", 41.297, -72.926],
  },
  routes: { "3": { name: "New Haven", color: "#EE0034" } },
  trips: { T1: ["1302", "3", "New Haven", 0, "1@480;2@540-541;3@600"] },
});

const DATE = "20261029";
const start = serviceDayStart(DATE, "America/New_York");
const at = (min: number) => start + min * 60_000;

function feed(entities: rt.IFeedEntity[]): rt.FeedMessage {
  const msg = rt.FeedMessage.create({ header: { gtfsRealtimeVersion: "2.0" }, entity: entities });
  return rt.FeedMessage.decode(rt.FeedMessage.encode(msg).finish());
}

describe("static data", () => {
  it("decodes encoded stop times", () => {
    expect(parseStopTimes("1@480;2@540-541")).toEqual([
      { stopId: "1", arrivalMin: 480, departureMin: 480 },
      { stopId: "2", arrivalMin: 540, departureMin: 541 },
    ]);
  });
});

describe("serviceDayStart", () => {
  it("anchors service days at noon minus 12h, per the GTFS spec", () => {
    const hours = (a: string, b: string) =>
      (serviceDayStart(b, "America/New_York") - serviceDayStart(a, "America/New_York")) / 3_600_000;
    expect(hours("20260307", "20260308")).toBe(23); // spring forward
    expect(hours("20261031", "20261101")).toBe(25); // fall back: the day starting 10/31 runs 25h
    expect(hours("20261101", "20261102")).toBe(24);
  });
});

describe("buildMnrTrips", () => {
  const tripUpdate = (stopUpdates: rt.TripUpdate.IStopTimeUpdate[]): rt.IFeedEntity => ({
    id: "e1",
    tripUpdate: { trip: { tripId: "T1", startDate: DATE }, stopTimeUpdate: stopUpdates },
  });

  it("estimates position, state and delay for a late trip", () => {
    const now = at(510); // halfway Grand Central -> Stamford
    const realtime = feed([tripUpdate([{ stopId: "2", arrival: { delay: 600 } }, { stopId: "3", arrival: { delay: 600 } }])]);
    const [trip] = buildMnrTrips({ staticData, realtime, alerts: indexAlerts(undefined, now), region: NORTHEAST, now });

    expect(trip).toBeDefined();
    expect(trip!.number).toBe("1302");
    expect(trip!.routeName).toBe("New Haven Line");
    expect(trip!.state).toBe("enroute");
    expect(trip!.nextStop?.name).toBe("Stamford");
    expect(trip!.delayMinutes).toBe(10);
    expect(trip!.delayStatus).toBe("minor");
    expect(trip!.position?.source).toBe("estimated");
    // Between Grand Central (40.753) and Stamford (41.047), shifted by the 10 min delay.
    expect(trip!.position!.lat).toBeGreaterThan(40.753);
    expect(trip!.position!.lat).toBeLessThan(41.047);
  });

  it("prefers a reported vehicle position", () => {
    const now = at(510);
    const realtime = feed([
      tripUpdate([{ stopId: "2", arrival: { delay: 0 } }]),
      { id: "v1", vehicle: { trip: { tripId: "T1" }, position: { latitude: 40.9, longitude: -73.7 } } },
    ]);
    const [trip] = buildMnrTrips({ staticData, realtime, alerts: indexAlerts(undefined, now), region: NORTHEAST, now });
    expect(trip!.position?.source).toBe("reported");
    expect(trip!.position!.lat).toBeCloseTo(40.9, 4); // protobuf floats are 32-bit
    expect(trip!.position!.lon).toBeCloseTo(-73.7, 4);
  });

  it("flags canceled trips and attaches operator alerts", () => {
    const now = at(470);
    const realtime = feed([
      { id: "e1", tripUpdate: { trip: { tripId: "T1", startDate: DATE, scheduleRelationship: rt.TripDescriptor.ScheduleRelationship.CANCELED } } },
    ]);
    const alerts = indexAlerts(
      feed([{ id: "a", alert: { cause: rt.Alert.Cause.MEDICAL_EMERGENCY, informedEntity: [{ trip: { tripId: "T1" } }] } }]),
      now,
    );
    const [trip] = buildMnrTrips({ staticData, realtime, alerts, region: NORTHEAST, now });
    expect(trip!.state).toBe("canceled");
    expect(trip!.delayStatus).toBe("canceled");
    expect(trip!.delayReason).toEqual({ kind: "operator-reported", text: "Medical emergency" });
  });

  it("skips unknown trips and finished trips", () => {
    const now = at(700);
    const realtime = feed([tripUpdate([]), { id: "x", tripUpdate: { trip: { tripId: "nope", startDate: DATE } } }]);
    expect(buildMnrTrips({ staticData, realtime, alerts: indexAlerts(undefined, now), region: NORTHEAST, now })).toEqual([]);
  });
});
