import { transit_realtime as rt } from "gtfs-realtime-bindings";
import { NORTHEAST } from "@/domain/region";
import type { Trip } from "@/domain/trip";
import { dateInZone, serviceDayStart } from "@/lib/time";
import { normalizeAmtrakTrip } from "../amtrak/normalize";
import { AmtrakTrainSchema } from "../amtrak/schema";
import { mnrProvider } from "../mnr";
import { indexAlerts } from "../mnr/alerts";
import { buildMnrTrips, MNR_TIMEZONE } from "../mnr/normalize";
import { loadStaticData } from "../mnr/static";
import type { FetchContext, TransitProvider } from "../types";

/**
 * Offline demo data for development and screenshots (`HOPLINE_DEMO=1`).
 * It feeds synthetic realtime messages through the *real* normalizers, so the
 * UI exercises the same code paths as production.
 */
const MIN = 60_000;

function syntheticMnr(now: number): Trip[] {
  const staticData = loadStaticData();
  const date = dateInZone(now, MNR_TIMEZONE);
  const start = serviceDayStart(date, MNR_TIMEZONE);
  const entities: rt.IFeedEntity[] = [];
  const seen = new Set<string>(); // schedules overlap across service days; one trip per trip number
  let n = 0;

  for (const id of tripIds()) {
    const trip = staticData.trip(id);
    if (!trip || seen.has(trip.number)) continue;
    const first = start + trip.stopTimes[0]!.departureMin * MIN;
    const last = start + trip.stopTimes.at(-1)!.arrivalMin * MIN;
    if (now < first - 10 * MIN || now > last) continue;
    seen.add(trip.number);
    // Deterministic spread of delays: mostly on time, some late, one canceled.
    const delayMin = [0, 0, 0, 2, 0, 7, 0, 0, 18, 0, 11, 0][n % 12]!;
    const canceled = n % 41 === 40;
    entities.push({
      id: `demo-${n}`,
      tripUpdate: {
        trip: {
          tripId: id,
          startDate: date,
          scheduleRelationship: canceled ? rt.TripDescriptor.ScheduleRelationship.CANCELED : undefined,
        },
        stopTimeUpdate: trip.stopTimes.map((s) => ({ stopId: s.stopId, arrival: { delay: delayMin * 60 } })),
      },
    });
    n++;
  }
  const realtime = rt.FeedMessage.create({ header: { gtfsRealtimeVersion: "2.0" }, entity: entities });
  return buildMnrTrips({
    staticData,
    realtime,
    alerts: indexAlerts(undefined, now),
    region: { ...NORTHEAST, bounds: [-180, -90, 180, 90] }, // demo trips ignore region bounds
    now,
  });
}

const tripIds = () => loadStaticData().tripIds();

function syntheticAmtrak(now: number, region: FetchContext["region"]): Trip[] {
  const iso = (offsetMin: number) => new Date(now + offsetMin * MIN).toISOString();
  const stop = (code: string, name: string, status: string, at: number, late: number) => ({
    code, name, status, platform: "",
    schArr: iso(at), schDep: iso(at), arr: iso(at + late), dep: iso(at + late),
  });
  const mk = (num: string, route: string, lat: number, lon: number, late: number, msg: string) =>
    AmtrakTrainSchema.parse({
      routeName: route, trainNum: num, trainNumRaw: num, trainID: `${num}-demo`, lat, lon, heading: "NE", velocity: 71,
      origName: "Washington", destName: "Boston", trainState: "Active", lastValTS: iso(0),
      alerts: msg ? [{ message: msg }] : [],
      stations: [
        stop("PHL", "Philadelphia", "Departed", -75, 0),
        stop("NWK", "Newark Penn", "Departed", -25, late),
        stop("NYP", "New York Penn", "Enroute", 5, late),
        stop("STM", "Stamford", "Enroute", 50, late),
        stop("NHV", "New Haven", "Enroute", 80, late),
      ],
    });
  return [
    mk("2150", "Acela", 40.4, -74.4, 0, ""),
    mk("174", "Northeast Regional", 40.7, -74.1, 22, "Delayed due to a signal problem near Newark"),
    mk("86", "Northeast Regional", 41.2, -73.3, 6, ""),
  ]
    .map((t) => normalizeAmtrakTrip(t, region))
    .filter((t): t is Trip => !!t);
}

export const demoProvider: TransitProvider = {
  id: "demo",
  name: "Demo",
  mode: "rail",
  regionIds: ["northeast"],
  async fetchTrips({ now, region }) {
    return [...syntheticMnr(now), ...syntheticAmtrak(now, region)];
  },
  fetchPlaces: (ctx) => mnrProvider.fetchPlaces(ctx),
};
