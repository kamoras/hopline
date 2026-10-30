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
  trips: {
    T1: ["1302", "3", "New Haven", 0, "1@480;2@540-541;3@600", 0],
    // Same train number twice on one day (an AM and a PM run), plus one that runs another day.
    AM: ["1500", "3", "New Haven", 0, "1@300;3@400", 0],
    PM: ["1500", "3", "New Haven", 0, "1@900;3@1000", 0],
    OTHERDAY: ["1600", "3", "New Haven", 0, "1@480;3@600", 1],
  },
  services: ["20261029", "20261030"],
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

  it("matches by train number when the feed's trip_id is opaque (Metro-North)", () => {
    const now = at(510);
    // Real Metro-North: the number is the entity id; the trip_id means nothing to the schedule.
    const realtime = feed([
      { id: "1302", tripUpdate: { trip: { tripId: "opaque-9f3a", startDate: DATE }, stopTimeUpdate: [{ stopId: "2", arrival: { delay: 300 } }] } },
    ]);
    const diag: Record<string, number | string> = {};
    const [train] = buildMnrTrips({ staticData, realtime, alerts: indexAlerts(undefined, now), region: NORTHEAST, now, diag });
    expect(train?.number).toBe("1302");
    expect(train?.id).toBe("mnr:T1"); // stable schedule id, not the opaque feed id
    expect(train?.delayMinutes).toBe(5);
    expect(diag).toMatchObject({ matchedByTrainNumber: 1, kept: 1 });
  });

  it("accepts train numbers with a letter prefix", () => {
    const now = at(510);
    const realtime = feed([{ id: "T1X", tripUpdate: { trip: { tripId: "x", startDate: DATE } } }]);
    expect(buildMnrTrips({ staticData, realtime, alerts: indexAlerts(undefined, now), region: NORTHEAST, now })).toEqual([]); // not in schedule: dropped, not crashed
    const withPrefix = createStaticData({
      stops: { "1": ["A", 40.75, -73.97], "2": ["B", 41.0, -73.5] },
      routes: { "3": { name: "New Haven", color: "#EE0034" } },
      trips: { P: ["EB1997", "3", "B", 0, "1@480;2@540", 0] },
      services: [DATE],
    });
    const rt2 = feed([{ id: "EB1997", tripUpdate: { trip: { tripId: "opaque", startDate: DATE } } }]);
    expect(buildMnrTrips({ staticData: withPrefix, realtime: rt2, alerts: indexAlerts(undefined, now), region: NORTHEAST, now })[0]?.number).toBe("EB1997");
  });

  it("infers the service date when the feed omits it", () => {
    const now = at(510);
    const realtime = feed([{ id: "1302", tripUpdate: { trip: { tripId: "opaque" }, stopTimeUpdate: [{ stopId: "2", arrival: { delay: 0 } }] } }]);
    expect(buildMnrTrips({ staticData, realtime, alerts: indexAlerts(undefined, now), region: NORTHEAST, now })).toHaveLength(1);
  });

  it("does not match a train number that doesn't run that day", () => {
    const now = at(510);
    const realtime = feed([{ id: "1600", tripUpdate: { trip: { tripId: "x", startDate: DATE } } }]);
    expect(buildMnrTrips({ staticData, realtime, alerts: indexAlerts(undefined, now), region: NORTHEAST, now })).toEqual([]);
  });

  it("picks between same-number trips by start time", () => {
    const now = at(950);
    const realtime = feed([{ id: "1500", tripUpdate: { trip: { tripId: "x", startDate: DATE, startTime: "15:00:00" } } }]);
    const [t] = buildMnrTrips({ staticData, realtime, alerts: indexAlerts(undefined, now), region: NORTHEAST, now });
    expect(t?.id).toBe("mnr:PM");
  });

  it("finds vehicle positions through the train number", () => {
    const now = at(510);
    const realtime = feed([
      { id: "1302", tripUpdate: { trip: { tripId: "opaque", startDate: DATE }, stopTimeUpdate: [{ stopId: "2", arrival: { delay: 0 } }] } },
      { id: "v", vehicle: { vehicle: { label: "1302" }, trip: { tripId: "other-opaque" }, position: { latitude: 40.9, longitude: -73.7 } } },
    ]);
    const [t] = buildMnrTrips({ staticData, realtime, alerts: indexAlerts(undefined, now), region: NORTHEAST, now });
    expect(t?.position?.source).toBe("reported");
  });

  it("reports why trips were dropped, including unmatched feed ids", () => {
    const now = at(510);
    const realtime = feed([tripUpdate([{ stopId: "2", arrival: { delay: 0 } }]), { id: "x", tripUpdate: { trip: { tripId: "feed-only-id", startDate: DATE } } }]);
    const diag: Record<string, number | string> = {};
    buildMnrTrips({ staticData, realtime, alerts: indexAlerts(undefined, now), region: NORTHEAST, now, diag });
    expect(diag).toMatchObject({ feedEntities: 2, tripUpdates: 2, unknownTrip: 1, kept: 1, matchedByTripId: 1, exampleScheduleTripId: "T1" });
    expect(String(diag.unmatchedFeedSamples)).toContain("trip=feed-only-id");
  });

  it("skips unknown trips and finished trips", () => {
    const now = at(700);
    const realtime = feed([tripUpdate([]), { id: "x", tripUpdate: { trip: { tripId: "nope", startDate: DATE } } }]);
    expect(buildMnrTrips({ staticData, realtime, alerts: indexAlerts(undefined, now), region: NORTHEAST, now })).toEqual([]);
  });
});
