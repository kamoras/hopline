import type { Trip } from "@/domain/trip";
import { indexAlerts } from "../gtfs/alerts";
import { fetchGtfsRt, type FeedMessage } from "../gtfs/feed";
import { buildRealtimeTrips, type RealtimeConfig } from "../gtfs/realtime";
import { createStaticData, type GtfsStaticData, type RawTrips } from "../gtfs/static";
import { staticLinesAndPlaces } from "../gtfs/scheduled";
import type { FetchContext, TransitProvider } from "../types";
import routes from "../../../data/mbta-cr/routes.json";
import services from "../../../data/mbta-cr/services.json";
import shapes from "../../../data/mbta-cr/shapes.json";
import stops from "../../../data/mbta-cr/stops.json";
import trips from "../../../data/mbta-cr/trips.json";

export const MBTA_CR_ID = "mbta-cr";
const CONFIG: RealtimeConfig = { id: MBTA_CR_ID, name: "MBTA Commuter Rail" };

const FEEDS = {
  trips: process.env.MBTA_TRIP_UPDATES_URL || "https://cdn.mbta.com/realtime/TripUpdates.pb",
  vehicles: process.env.MBTA_VEHICLE_POSITIONS_URL || "https://cdn.mbta.com/realtime/VehiclePositions.pb",
  alerts: process.env.MBTA_ALERTS_URL || "https://cdn.mbta.com/realtime/Alerts.pb",
};

let loaded: GtfsStaticData | undefined;
const staticData = () =>
  (loaded ??= createStaticData(
    { stops: stops as unknown as Record<string, [string, number, number]>, routes, trips: trips as unknown as RawTrips, services, shapes },
    { id: MBTA_CR_ID, name: "MBTA Commuter Rail" },
  ));

/** Sent as `x-api-key` when set: optional, but raises the MBTA's rate limit. */
const headers = (): Record<string, string> => (process.env.MBTA_API_KEY ? { "x-api-key": process.env.MBTA_API_KEY } : {});

/**
 * The MBTA publishes trip updates and vehicle positions as separate feeds for every mode; combine them and
 * keep only commuter rail, so the shared builder sees one feed like Metro-North's.
 */
async function fetchCommuterRail(signal: AbortSignal, data: GtfsStaticData): Promise<FeedMessage> {
  const [tripUpdates, vehicles] = await Promise.all([
    fetchGtfsRt(FEEDS.trips, signal, { headers: headers(), ttlMs: 5_000 }),
    fetchGtfsRt(FEEDS.vehicles, signal, { headers: headers(), ttlMs: 5_000 }),
  ]);
  const ours = (e: FeedMessage["entity"][number]) => !!data.routes[e.tripUpdate?.trip.routeId ?? e.vehicle?.trip?.routeId ?? ""];
  return { ...tripUpdates, entity: [...tripUpdates.entity, ...vehicles.entity].filter(ours) } as FeedMessage;
}

/** MBTA Commuter Rail via the MBTA's GTFS-Realtime feeds plus the bundled schedule. */
export const mbtaCommuterRailProvider: TransitProvider = {
  id: MBTA_CR_ID,
  name: "MBTA Commuter Rail",
  attribution: {
    label: "MBTA",
    url: "https://www.mbta.com/developers",
    notice: "MBTA schedule and real-time data provided by the Massachusetts Bay Transportation Authority. Hopline is not affiliated with or endorsed by the MBTA.",
  },
  mode: "rail",
  regionIds: ["northeast"],

  async fetchTrips({ region, signal, now, diag }: FetchContext): Promise<Trip[]> {
    const data = staticData();
    const [realtime, alertFeed] = await Promise.all([
      fetchCommuterRail(signal, data),
      fetchGtfsRt(FEEDS.alerts, signal, { headers: headers(), ttlMs: 30_000 }).catch(() => undefined),
    ]);
    return buildRealtimeTrips({ config: CONFIG, staticData: data, realtime, alerts: indexAlerts(alertFeed, now), region, now, diag });
  },

  ...staticLinesAndPlaces(staticData),
};
