import { describe, expect, it } from "vitest";
import { NORTHEAST_AIR } from "@/domain/region";
import { NORTHEAST_AIRPORTS } from "@/providers/adsb/airports";
import { buildAirportStatus, parseAirportStatus } from "@/providers/adsb/faa";
import { buildFlightArrivals, buildFlights, classify, type Aircraft } from "@/providers/adsb/normalize";
import { positionAt, compileLegs } from "@/lib/motion";

const NOW = Date.UTC(2026, 9, 30, 18, 0, 0);
const jfk = NORTHEAST_AIRPORTS.find((a) => a.code === "JFK")!;

/** An aircraft 20 nautical miles due east of JFK. */
const base: Aircraft = { hex: "abc123", flight: "DAL1283 ", t: "B712", lat: 40.6413, lon: -73.7781 + 20 / 46.4, gs: 200, track: 270, alt_baro: 3000, baro_rate: -700, seen_pos: 0.4 };
const build = (aircraft: Aircraft[]) => buildFlights({ aircraft, airports: NORTHEAST_AIRPORTS, region: NORTHEAST_AIR, now: NOW });

describe("classify", () => {
  it("calls a plane descending toward an airport an arrival there", () => {
    const phase = classify({ ...base, lat: base.lat!, lon: base.lon!, track: 270 }, NORTHEAST_AIRPORTS);
    expect(phase).toMatchObject({ kind: "arriving", airport: { code: "JFK" } });
  });

  it("does not send a plane that is still too high to land at a closer airport", () => {
    // 12 nm east of Long Island MacArthur at 9,000 ft heading west: ISP is ahead but out of reach; it is bound for a bigger airport.
    const isp = NORTHEAST_AIRPORTS.find((a) => a.code === "ISP")!;
    const high = { ...base, lat: isp.lat, lon: isp.lon + 12 / 46.4, alt_baro: 9000, baro_rate: -1200 };
    const phase = classify(high as never, NORTHEAST_AIRPORTS);
    expect(phase.kind).toBe("arriving");
    expect(phase.kind === "arriving" && phase.airport.code).not.toBe("ISP");
    // The same plane at 2,500 ft really is landing at ISP.
    expect(classify({ ...high, alt_baro: 2500, baro_rate: -600 } as never, NORTHEAST_AIRPORTS)).toMatchObject({ kind: "arriving", airport: { code: "ISP" } });
  });

  it("calls a climbing plane near an airport a departure, and a high flyer an overflight", () => {
    expect(classify({ ...base, track: 90, baro_rate: 2200, alt_baro: 5000 } as never, NORTHEAST_AIRPORTS)).toMatchObject({ kind: "departing", airport: { code: "JFK" } });
    expect(classify({ ...base, alt_baro: 36000, baro_rate: 0 } as never, NORTHEAST_AIRPORTS)).toEqual({ kind: "overflying" });
  });
});

describe("buildFlights", () => {
  it("shows airline flights in the air with their real position, speed and altitude", () => {
    const [trip] = build([base]);
    expect(trip).toMatchObject({ id: "adsb:abc123", mode: "flights", number: "DAL1283", routeName: "Delta B712", state: "enroute", delayStatus: "unknown" });
    expect(trip!.position).toMatchObject({ source: "reported", heading: 270, altitudeFt: 3000 });
    expect(trip!.position!.speedMph).toBeCloseTo(200 * 1.15078, 1);
    expect(trip!.destination).toBe("New York JFK");
    expect(trip!.stops[0]).toMatchObject({ name: "New York JFK", state: "upcoming" });
    // about 20 nm at 200 knots: six minutes
    expect(Math.abs(trip!.stops[0]!.arrival! - NOW - 6 * 60_000)).toBeLessThan(30_000);
  });

  it("drops what is not an airline flight in the air: ground traffic, private aircraft, lost signals, other skies", () => {
    const trips = build([
      { ...base, hex: "g", alt_baro: "ground" },
      { ...base, hex: "n", flight: "N123AB" },
      { ...base, hex: "none", flight: undefined },
      { ...base, hex: "stale", seen_pos: 120 },
      { ...base, hex: "far", lat: 30, lon: -90 },
      { ...base, hex: "ok", flight: "UAL12" },
    ]);
    expect(trips.map((t) => t.number)).toEqual(["UAL12"]);
  });

  it("keeps the plane moving between refreshes with a glide along its heading", () => {
    const [trip] = build([{ ...base, track: 90, alt_baro: 36000, baro_rate: 0, gs: 480, seen_pos: 2 }]);
    const [leg] = trip!.motion!;
    expect(leg!.t0).toBe(NOW - 2000); // from when the aircraft actually reported
    expect(leg!.t1).toBeGreaterThan(NOW + 20_000);
    const [startLat, startLon, endLat, endLon] = leg!.path;
    expect(endLat).toBeCloseTo(startLat!, 3); // due east: latitude holds
    expect(endLon).toBeGreaterThan(startLon!);
    const at = positionAt(compileLegs(trip!.motion!), NOW + 10_000, 0)!;
    expect(at.lon).toBeGreaterThan(trip!.position!.lon); // already ahead of the reported spot, still moving
  });
});

describe("buildFlightArrivals", () => {
  it("lists flights descending into an airport, soonest first", () => {
    const arrivals = buildFlightArrivals({
      aircraft: [
        { ...base, hex: "late", flight: "AAL9", gs: 150, lon: base.lon! + 0.2 },
        { ...base, hex: "soon", flight: "UAL1" },
        { ...base, hex: "cruise", flight: "SWA5", alt_baro: 36000, baro_rate: 0 },
      ],
      airports: NORTHEAST_AIRPORTS,
      region: NORTHEAST_AIR,
      now: NOW,
      airport: "JFK",
    });
    expect(arrivals.map((a) => a.headsign.split(" ")[0])).toEqual(["UAL1", "AAL9"]);
    expect(arrivals[0]).toMatchObject({ route: "UAL", tripId: "adsb:soon" });
    expect(jfk.code).toBe("JFK");
  });
});

describe("FAA airport status", () => {
  const xml = `<AIRPORT_STATUS_INFORMATION>
    <Delay_type><Name>General Arrival/Departure Delay Info</Name><Arrival_Departure_Delay_List>
      <Delay><ARPT>LGA</ARPT><Reason>STAFF:Staffing</Reason><Arrival_Departure Type="Departure"><Min>30 minutes</Min><Max>44 minutes</Max><Trend>Decreasing</Trend></Arrival_Departure></Delay>
    </Arrival_Departure_Delay_List></Delay_type>
    <Delay_type><Name>Ground Delay Programs</Name><Ground_Delay_List>
      <Ground_Delay><ARPT>EWR</ARPT><Reason>WEATHER:Low Ceilings</Reason><Avg>57 minutes</Avg><Max>2 hours</Max></Ground_Delay>
    </Ground_Delay_List></Delay_type>
    <Delay_type><Name>Ground Stop Programs</Name><Ground_Stop_List>
      <Program><ARPT>JFK</ARPT><Reason>WEATHER:Thunderstorms</Reason><End_Time>8:30 pm EDT</End_Time></Program>
    </Ground_Stop_List></Delay_type>
    <Delay_type><Name>Airport Closures</Name><Airport_Closure_List>
      <Airport><ARPT>LAX</ARPT><Reason>!LAX 05/277 AD AP CLSD</Reason><Reopen>May 28 at 16:00 UTC.</Reopen></Airport>
    </Airport_Closure_List></Delay_type>
  </AIRPORT_STATUS_INFORMATION>`;

  it("understands delays, ground delay programs, ground stops and closures", () => {
    const found = parseAirportStatus(xml);
    expect(found.map((f) => [f.airport, f.state])).toEqual([["JFK", "suspended"], ["EWR", "delays"], ["LGA", "delays"], ["LAX", "suspended"]]);
  });

  it("reports every covered airport, good unless the FAA says otherwise, with the reason in words", () => {
    const status = buildAirportStatus(xml, NORTHEAST_AIRPORTS);
    const by = Object.fromEntries(status.map((s) => [s.route, s]));
    expect(status).toHaveLength(NORTHEAST_AIRPORTS.length); // LAX is not ours
    expect(by.JFK).toMatchObject({ state: "suspended" });
    expect(by.JFK!.alerts[0]!.headline).toBe("Ground stop: thunderstorms, until 8:30 pm EDT");
    expect(by.EWR!.alerts[0]!.headline).toContain("57 minutes");
    expect(by.LGA!.alerts[0]!.headline).toBe("Departure delays of 30 minutes to 44 minutes (decreasing), staffing");
    expect(by.PHL).toMatchObject({ state: "good", alerts: [] });
  });
});
